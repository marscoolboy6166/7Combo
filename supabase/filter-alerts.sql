-- ============================================================
-- Filter alerts — unresolved/resolved queue for blocked posts
--
-- Run once in the Supabase SQL Editor (safe to re-run).
-- Source of truth for fresh installs is supabase/filter-appeals.sql;
-- this file is the focused migration for an existing project.
--
-- Every post the friendly-content filter rejects files an alert,
-- de-duplicated per user + kind within an hour so spam cannot flood
-- the queue. Alerts are UNRESOLVED until:
--   * staff decide the user's appeal — approve = false positive,
--     reject = filter was right
--   * staff resolve it directly with the same two choices
-- Each staff member sees an alert once; the "seen" mark is personal
-- and stored in the database. Resolved alerts never pop up again.
-- ============================================================

-- Filter alerts — one per blocked post, with unresolved/resolved state
--
-- A blocked post files an alert the same way anti-spam files one. Alerts
-- are de-duplicated per user + kind (combo/comment) within an hour, so a
-- determined spammer cannot flood the staff queue.
--
-- Unresolved (resolved_at is null) until:
--   decided an appeal  — approve = 'false_positive' (filter was wrong)
--                        reject  = 'confirmed'      (filter was right)
--   staff resolve it   — same two choices, without waiting for an appeal
-- Resolved alerts never pop up again.
-- ============================================================
create table if not exists public.filter_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('combo', 'comment')),
  filter_reason text not null,
  flagged_text text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution text
);

alter table public.filter_events
  drop constraint if exists filter_events_resolution_check;
alter table public.filter_events
  add constraint filter_events_resolution_check
  check (resolution is null or resolution in ('confirmed', 'false_positive'));

create index if not exists filter_events_created_idx
  on public.filter_events (created_at desc);
create index if not exists filter_events_user_idx
  on public.filter_events (user_id, created_at desc);
create index if not exists filter_events_open_idx
  on public.filter_events (created_at desc) where resolved_at is null;

alter table public.filter_events enable row level security;
-- No policies and no direct grants: rows are written by log_filter_event()
-- and read only through the staff functions below.
revoke all on public.filter_events from anon, authenticated;

-- Per-staff “already seen” marks: each alert pops up once for each staff
-- member, and acknowledging yours never affects anyone else.
create table if not exists public.filter_event_acks (
  event_id bigint not null references public.filter_events(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, staff_id)
);
create index if not exists filter_event_acks_staff_idx
  on public.filter_event_acks (staff_id, created_at desc);

alter table public.filter_event_acks enable row level security;
revoke all on public.filter_event_acks from anon, authenticated;

-- Log a blocked post as a filter alert. Called by the API right before it
-- answers 422, so every rejection staff might need to review is recorded.
-- Returns the alert id; de-duplicated per user + kind per hour, so repeated
-- attempts reuse the open alert instead of piling up.
create or replace function public.log_filter_event(
  p_kind text, p_reason text, p_flagged text, p_context jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then
    return null;
  end if;
  if p_kind is null or p_kind not in ('combo', 'comment') then
    raise exception 'Invalid filter kind';
  end if;

  select id into v_id
  from public.filter_events
  where user_id = auth.uid()
    and kind = p_kind
    and resolved_at is null
    and created_at > now() - interval '1 hour'
  order by created_at desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.filter_events (user_id, kind, filter_reason, flagged_text, context)
  values (
    auth.uid(),
    p_kind,
    left(coalesce(p_reason, 'Filtered'), 500),
    left(coalesce(p_flagged, ''), 2000),
    p_context
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Decide an appeal: approve (content may be posted) or reject.
-- Deciding also RESOLVES that user's open filter alerts for the same kind:
--   approve = false positive (the filter was wrong)
--   reject  = confirmed      (the filter was right)
create or replace function public.staff_decide_filter_appeal(
  p_appeal uuid, p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_kind text;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'Invalid action';
  end if;

  update public.filter_appeals
     set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_appeal
     and status = 'pending'
  returning user_id, kind into v_user, v_kind;

  if v_user is null then
    return false;
  end if;

  update public.filter_events
     set resolved_at = now(),
         resolved_by = auth.uid(),
         resolution = case when p_action = 'approve' then 'false_positive' else 'confirmed' end
   where user_id = v_user
     and kind = v_kind
     and resolved_at is null;

  return true;
end;
$$;

-- Queue for the alert popup / card: unresolved first, then recent resolved.
create or replace function public.admin_list_filter_events()
returns table (
  id bigint, user_id uuid, display_name text, username text,
  kind text, filter_reason text, flagged_text text, context jsonb,
  created_at timestamptz, resolved_at timestamptz, resolution text,
  acknowledged boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.user_id, p.display_name, p.username,
         e.kind, e.filter_reason, e.flagged_text, e.context,
         e.created_at, e.resolved_at, e.resolution,
         exists (
           select 1 from public.filter_event_acks a
           where a.event_id = e.id and a.staff_id = auth.uid()
         ) as acknowledged
  from public.filter_events e
  left join public.profiles p on p.id = e.user_id
  where public.is_staff()
  order by (e.resolved_at is null) desc, e.created_at desc
  limit 100;
$$;

-- Mark alerts as seen by THIS staff member (bulk, idempotent).
create or replace function public.admin_ack_filter_event(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;
  insert into public.filter_event_acks (event_id, staff_id)
  select e.id, auth.uid()
  from public.filter_events e
  where e.id = any (p_ids)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Resolve an alert without an appeal.
-- confirmed      — the filter was right; nothing else changes.
-- false_positive — the filter was wrong (the blocked post is not restored).
create or replace function public.admin_resolve_filter_event(
  p_id bigint, p_resolution text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  if p_resolution is null or p_resolution not in ('confirmed', 'false_positive') then
    raise exception 'Invalid resolution';
  end if;
  update public.filter_events
     set resolved_at = now(),
         resolved_by = auth.uid(),
         resolution = p_resolution
   where id = p_id
     and resolved_at is null;
  return found;
end;
$$;

revoke execute on function public.log_filter_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_filter_event(text, text, text, jsonb) to authenticated;
revoke execute on function public.admin_list_filter_events() from public, anon, authenticated;
grant execute on function public.admin_list_filter_events() to authenticated;
revoke execute on function public.admin_ack_filter_event(bigint[]) from public, anon, authenticated;
grant execute on function public.admin_ack_filter_event(bigint[]) to authenticated;
revoke execute on function public.admin_resolve_filter_event(bigint, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_filter_event(bigint, text) to authenticated;

notify pgrst, 'reload schema';
