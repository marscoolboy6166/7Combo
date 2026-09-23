-- ============================================================
-- 7Combo — filter appeals + phrase whitelist (roadmap #7 add-on)
-- Lets users appeal friendly-content-filter false positives and
-- lets staff approve/reject appeals and whitelist exact phrases
-- so the same mistake never blocks anyone again.
-- Run once in the Supabase SQL Editor. Idempotent.
-- ============================================================

-- ---------------- appeals ----------------
create table if not exists public.filter_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('combo', 'comment')),
  flagged_text text not null check (char_length(flagged_text) between 1 and 4000),
  filter_reason text not null,
  context jsonb,            -- combo snapshot (title/description/steps/items) for approve&post
  appeal_text text not null check (char_length(btrim(appeal_text)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists filter_appeals_status_idx
  on public.filter_appeals (status, created_at desc);
create index if not exists filter_appeals_user_idx
  on public.filter_appeals (user_id, created_at desc);

-- One open appeal per user at a time (keeps the queue clean).
create unique index if not exists filter_appeals_one_pending_idx
  on public.filter_appeals (user_id) where status = 'pending';

alter table public.filter_appeals enable row level security;

drop policy if exists "Users file their own appeals" on public.filter_appeals;
create policy "Users file their own appeals"
  on public.filter_appeals for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users see own appeals, staff see all" on public.filter_appeals;
create policy "Users see own appeals, staff see all"
  on public.filter_appeals for select
  using (auth.uid() = user_id or public.is_staff());

-- Decisions go exclusively through the security-definer functions below.

-- ---------------- whitelist ----------------
create table if not exists public.filter_whitelist (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique,   -- stored normalized (lowercase, alphanumerics only)
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.filter_whitelist enable row level security;

drop policy if exists "Staff read whitelist" on public.filter_whitelist;
create policy "Staff read whitelist"
  on public.filter_whitelist for select
  using (public.is_staff());

-- Same normalization as the app's text filter: lowercase + strip
-- everything that is not a letter/digit.
create or replace function public.normalize_phrase(p_text text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_text, ''), '[^a-zA-Z0-9]+', '', 'g'));
$$;

-- ---------------- user functions ----------------

-- File an appeal against a filter rejection. One pending appeal per user.
create or replace function public.submit_filter_appeal(
  p_kind text, p_flagged text, p_reason text, p_context jsonb, p_appeal_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_kind not in ('combo', 'comment') then
    raise exception 'Invalid appeal kind';
  end if;
  begin
    insert into public.filter_appeals
      (user_id, kind, flagged_text, filter_reason, context, appeal_text)
    values
      (auth.uid(), p_kind, left(p_flagged, 4000), left(p_reason, 500), p_context, p_appeal_text)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'You already have an appeal being reviewed — check back soon.';
  end;
  return v_id;
end;
$$;

-- The user's own appeal history (status visibility).
create or replace function public.my_filter_appeals()
returns table (
  id uuid, kind text, status text, filter_reason text,
  created_at timestamptz, decided_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.kind, a.status, a.filter_reason, a.created_at, a.decided_at
  from public.filter_appeals a
  where a.user_id = auth.uid()
  order by a.created_at desc
  limit 20;
$$;

-- ---------------- staff functions ----------------

-- Queue for the admin panel: pending appeals first, then recently decided.
create or replace function public.admin_list_filter_appeals()
returns table (
  id uuid, user_id uuid, display_name text, username text,
  kind text, status text, flagged_text text, filter_reason text,
  context jsonb, appeal_text text,
  created_at timestamptz, decided_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.user_id, p.display_name, p.username,
         a.kind, a.status, a.flagged_text, a.filter_reason,
         a.context, a.appeal_text, a.created_at, a.decided_at
  from public.filter_appeals a
  join public.profiles p on p.id = a.user_id
  where public.is_staff()
  order by (a.status = 'pending') desc, a.created_at desc
  limit 100;
$$;

-- Decide an appeal: approve (content may be posted) or reject.
create or replace function public.staff_decide_filter_appeal(
  p_appeal uuid, p_action text
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
  if p_action not in ('approve', 'reject') then
    raise exception 'Invalid action';
  end if;
  update public.filter_appeals
     set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_appeal
     and status = 'pending';
  return found;
end;
$$;

-- Whitelist management (exact normalized phrases).
create or replace function public.staff_add_whitelist(p_phrase text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := public.normalize_phrase(p_phrase);
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  if v_norm is null or char_length(v_norm) < 2 then
    raise exception 'Phrase is too short to whitelist';
  end if;
  insert into public.filter_whitelist (phrase, added_by)
  values (v_norm, auth.uid())
  on conflict (phrase) do update set added_by = excluded.added_by
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.staff_remove_whitelist(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  delete from public.filter_whitelist where id = p_id;
  return found;
end;
$$;

-- ---------------- grants (revoke-before-grant) ----------------
revoke update, delete on public.filter_appeals from anon, authenticated;
revoke insert, update, delete on public.filter_whitelist from anon, authenticated;
grant select on public.filter_whitelist to authenticated;

revoke execute on function public.submit_filter_appeal(text, text, text, jsonb, text) from anon, authenticated;
grant execute on function public.submit_filter_appeal(text, text, text, jsonb, text) to authenticated;

revoke execute on function public.my_filter_appeals() from anon, authenticated;
grant execute on function public.my_filter_appeals() to authenticated;

revoke execute on function public.admin_list_filter_appeals() from anon, authenticated;
grant execute on function public.admin_list_filter_appeals() to authenticated;

revoke execute on function public.staff_decide_filter_appeal(uuid, text) from anon, authenticated;
grant execute on function public.staff_decide_filter_appeal(uuid, text) to authenticated;

revoke execute on function public.staff_add_whitelist(text) from anon, authenticated;
grant execute on function public.staff_add_whitelist(text) to authenticated;

revoke execute on function public.staff_remove_whitelist(uuid) from anon, authenticated;
grant execute on function public.staff_remove_whitelist(uuid) to authenticated;
