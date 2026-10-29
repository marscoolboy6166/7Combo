-- ============================================================
-- Auto-mod alerts: per-admin one-time alerts + resolved state
--
-- Run once in the Supabase SQL Editor (safe to re-run).
-- Source of truth for fresh installs is supabase/anti-spam.sql;
-- this file is the focused migration for an existing project.
--
-- Every alert is now either UNRESOLVED or RESOLVED.
--   resolved 'confirmed'      — an admin decided the auto-action was correct
--   resolved 'false_positive' — false automod; any automatic restriction lifted
--   resolved 'unbanned'       — an admin lifted the restriction themselves
-- Resolved alerts never pop up again, and neither do alerts this admin
-- has already dismissed (the "seen" mark is per admin, in the database).
-- ============================================================

-- ---------- resolution state ----------
-- Every event starts unresolved (resolved_at is null). It is resolved in
-- exactly one of three ways:
--   confirmed      — an admin decided the automatic action was correct
--                    (the restriction, if any, stays as it is)
--   false_positive — an admin decided the automatic action was wrong; any
--                    active automatic restriction on that user is lifted
--   unbanned       — an admin lifted the restriction themselves
-- Resolved events never open the alert popup again.
alter table public.moderation_events
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolution text;

alter table public.moderation_events
  drop constraint if exists moderation_events_resolution_check;
alter table public.moderation_events
  add constraint moderation_events_resolution_check
  check (resolution is null or resolution in ('confirmed', 'false_positive', 'unbanned'));

-- ---------- per-admin "already seen" marks ----------
-- Each admin sees every alert once. Acknowledging is personal: it never
-- changes the event for anyone else and never resolves it.
create table if not exists public.moderation_event_acks (
  event_id bigint not null references public.moderation_events(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, admin_id)
);
create index if not exists moderation_event_acks_admin_idx
  on public.moderation_event_acks (admin_id, created_at desc);

alter table public.moderation_event_acks enable row level security;
-- Written only through admin_ack_moderation_event(); no direct grants.
revoke all on public.moderation_event_acks from anon, authenticated;

-- ---------- staff view of recent automatic actions ----------
-- Return shape changed (ack + resolution state), so drop first: Postgres
-- cannot change a function's OUT row type via CREATE OR REPLACE.
drop function if exists public.admin_recent_moderation();
create or replace function public.admin_recent_moderation()
returns table (
  id bigint,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  is_test boolean,
  event_type text,
  action text,
  scope text,
  reason text,
  until timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  acknowledged boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  return query
  select e.id, e.user_id, p.display_name, p.username, p.avatar_url, p.is_test,
         e.event_type, e.action, e.scope, e.reason, e.until, e.expires_at, e.created_at,
         e.resolved_at, e.resolution,
         exists (
           select 1 from public.moderation_event_acks a
           where a.event_id = e.id and a.admin_id = auth.uid()
         ) as acknowledged
  from public.moderation_events e
  left join public.profiles p on p.id = e.user_id
  order by e.created_at desc
  limit 50;
end;
$$;

-- ---------- mark alerts as seen by THIS admin ----------
-- Bulk, idempotent: closing the popup passes every id it showed. A
-- per-admin mark only — nothing about the event changes for others.
create or replace function public.admin_ack_moderation_event(p_ids bigint[])
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
  insert into public.moderation_event_acks (event_id, admin_id)
  select e.id, auth.uid()
  from public.moderation_events e
  where e.id = any (p_ids)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------- resolve an automatic alert ----------
-- confirmed      — the automatic action was correct; nothing else changes.
-- false_positive — the automatic action was wrong; any ACTIVE automatic
--                  restriction on that user is lifted (a pending appeal is
--                  marked upheld), and the event is resolved.
-- Lifting a ban by hand resolves the user's open events with 'unbanned'
-- (see admin_lift_ban in schema.sql).
create or replace function public.admin_resolve_moderation_event(
  p_id bigint,
  p_resolution text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_resolution is null or p_resolution not in ('confirmed', 'false_positive') then
    raise exception 'Invalid resolution';
  end if;

  update public.moderation_events
     set resolved_at = now(),
         resolved_by = auth.uid(),
         resolution = p_resolution
   where id = p_id and resolved_at is null
  returning user_id into v_user;

  if v_user is null then
    return false; -- already resolved, or no such event
  end if;

  if p_resolution = 'false_positive' then
    update public.profiles
       set ban_scope = null,
           ban_until = null,
           ban_reason = null,
           ban_at = null,
           appeal_status = case when appeal_status = 'pending' then 'upheld' else appeal_status end,
           appeal_at = case when appeal_status = 'pending' then now() else appeal_at end
     where id = v_user
       and ban_reason like '[Automatic]%';
  end if;

  return true;
end;
$$;

-- ---------- lifting a restriction resolves the open alerts ----------
create or replace function public.admin_lift_ban(p_target uuid, p_appeal text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if exists (select 1 from public.profiles where id = p_target and role = 'owner') then
    raise exception 'The owner cannot be banned';
  end if;
  if exists (select 1 from public.profiles where id = p_target and is_admin)
     and not public.is_owner() then
    raise exception 'Only the owner can lift an admin restriction';
  end if;
  if p_appeal is not null and p_appeal not in ('upheld') then
    raise exception 'Invalid appeal value';
  end if;

  update public.profiles
     set ban_scope = null,
         ban_until = null,
         ban_reason = null,
         ban_at = null,
         appeal_status = case when p_appeal = 'upheld' then 'upheld' else appeal_status end,
         appeal_at = case when p_appeal = 'upheld' then now() else appeal_at end
   where id = p_target;
  v_found := found;

  -- Lifting a restriction resolves that user's open auto-mod alerts, so a
  -- resolved alert never pops up again. Guarded on the column so this file
  -- still works when supabase/anti-spam.sql has not been re-run yet.
  if v_found and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'moderation_events'
      and column_name = 'resolution'
  ) then
    update public.moderation_events
       set resolved_at = now(),
           resolved_by = auth.uid(),
           resolution = 'unbanned'
     where user_id = p_target
       and resolved_at is null;
  end if;

  return v_found;
end;
$$;

revoke execute on function public.admin_recent_moderation() from anon, authenticated;
revoke execute on function public.admin_ack_moderation_event(bigint[]) from public, anon, authenticated;
revoke execute on function public.admin_resolve_moderation_event(bigint, text) from public, anon, authenticated;
grant execute on function public.admin_recent_moderation() to authenticated;
grant execute on function public.admin_ack_moderation_event(bigint[]) to authenticated;
grant execute on function public.admin_resolve_moderation_event(bigint, text) to authenticated;

notify pgrst, 'reload schema';
