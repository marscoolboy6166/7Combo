-- ============================================================
-- Bug reports — alerts (3 reminders), owner-only resolve
--
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Safe to re-run.
--
-- Source of truth for fresh installs is supabase/schema.sql (also
-- mirrored in supabase/site-necessities.sql); this file is the
-- focused migration for an existing project.
--
-- * UNRESOLVED = status 'open'; RESOLVED = the site owner resolved it
--   (resolving a bug means fixing the code).
-- * Every new report pops up for each staff member THREE times before
--   staying quiet for them, so an unanswered bug gets enough warnings.
--   The counter is personal (bug_report_acks.seen_count, capped at 3).
-- * Admins and moderators can read the queue and see the popups; only
--   the owner resolves. The old staff-level resolve function is dropped.
-- ============================================================

-- Safety for projects whose bug_reports predates resolved_by.
alter table public.bug_reports
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

-- Per-staff reminder counter for the bug-report queue. A new report pops
-- up THREE times for each staff member before it stays quiet for them, so an
-- unanswered bug gets a fair chance of being noticed. Acknowledging is
-- personal and never changes the report; resolving it (owner_resolve_bug_
-- report) is what marks it resolved for everyone.
create table if not exists public.bug_report_acks (
  report_id uuid not null references public.bug_reports(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  seen_count integer not null default 1 check (seen_count between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (report_id, staff_id)
);
-- Safety for projects that created the table before the counter existed.
alter table public.bug_report_acks
  add column if not exists seen_count integer not null default 1;
create index if not exists bug_report_acks_staff_idx
  on public.bug_report_acks (staff_id, created_at desc);

alter table public.bug_report_acks enable row level security;
revoke all on public.bug_report_acks from anon, authenticated;

-- Return shape changed (seen_count), so drop first: Postgres cannot change
-- a function's OUT row type via CREATE OR REPLACE.
drop function if exists public.admin_list_bug_reports();
create or replace function public.admin_list_bug_reports()
returns table (
  id uuid, user_id uuid, display_name text, username text,
  page_url text, description text, status text, staff_note text,
  created_at timestamptz, resolved_at timestamptz,
  seen_count integer
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.user_id, p.display_name, p.username,
         r.page_url, r.description, r.status, r.staff_note,
         r.created_at, r.resolved_at,
         coalesce(
           (select a.seen_count from public.bug_report_acks a
            where a.report_id = r.id and a.staff_id = auth.uid()),
           0
         ) as seen_count
  from public.bug_reports r
  join public.profiles p on p.id = r.user_id
  where public.is_staff()
  order by (r.status = 'open') desc, r.created_at desc
  limit 200;
$$;

-- Bump the caller's reminder counter (max 3) for the reports in p_ids.
create or replace function public.admin_ack_bug_report(p_ids uuid[])
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
  insert into public.bug_report_acks (report_id, staff_id, seen_count)
  select r.id, auth.uid(), 1
  from public.bug_reports r
  where r.id = any (p_ids)
  on conflict (report_id, staff_id) do update
     set seen_count = least(public.bug_report_acks.seen_count + 1, 3),
         created_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Resolving a bug report means fixing the code, so only the owner does it.
-- The old staff-level function is dropped so an admin cannot reach it even
-- with a hand-crafted RPC call. Admins and moderators still see the queue
-- and the alert popup.
drop function if exists public.staff_resolve_bug_report(uuid, text);

create or replace function public.owner_resolve_bug_report(
  p_report uuid, p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  update public.bug_reports
     set status = 'resolved',
         staff_note = nullif(left(coalesce(p_note, ''), 1000), ''),
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_report
     and status = 'open';
  return found;
end;
$$;

-- ---------------- grants (revoke-before-grant) ----------------
revoke insert, update, delete on public.bug_reports from anon, authenticated;
grant select on public.bug_reports to authenticated;

revoke execute on function public.admin_list_bug_reports() from anon, authenticated;
grant execute on function public.admin_list_bug_reports() to authenticated;

revoke execute on function public.admin_ack_bug_report(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_ack_bug_report(uuid[]) to authenticated;

revoke execute on function public.owner_resolve_bug_report(uuid, text) from public, anon, authenticated;
grant execute on function public.owner_resolve_bug_report(uuid, text) to authenticated;

notify pgrst, 'reload schema';
