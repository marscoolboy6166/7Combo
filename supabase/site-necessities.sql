-- ============================================================
-- 7Combo — site necessities pack (roadmap #5)
-- Bug reports: users file reports (with the page they were on),
-- staff review them in the admin hub and mark them resolved.
-- Run once in the Supabase SQL Editor. Idempotent.
-- ============================================================

-- ---------------- bug reports ----------------
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_url text check (char_length(page_url) <= 2000),   -- where it happened
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  staff_note text,                                        -- staff's reply / follow-up
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists bug_reports_status_idx
  on public.bug_reports (status, created_at desc);
create index if not exists bug_reports_user_idx
  on public.bug_reports (user_id, created_at desc);

alter table public.bug_reports enable row level security;

-- Users file their own reports (user_id is set by the function,
-- never trusted from the client).
drop policy if exists "Users file their own bug reports" on public.bug_reports;
create policy "Users file their own bug reports"
  on public.bug_reports for insert
  with check (auth.uid() = user_id);

-- Users see their own reports; staff see the whole queue.
drop policy if exists "Users see own reports, staff see all" on public.bug_reports;
create policy "Users see own reports, staff see all"
  on public.bug_reports for select
  using (auth.uid() = user_id or public.is_staff());

-- Resolution goes exclusively through the security-definer function.

-- ---------------- user functions ----------------

-- File a bug report. Caps: at most 5 open reports per user and
-- at most 10 per day, so the queue can't be flooded.
create or replace function public.submit_bug_report(
  p_page_url text, p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_open integer;
  v_today integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_open := (
    select count(*) from public.bug_reports
    where user_id = auth.uid() and status = 'open'
  );
  if v_open >= 5 then
    raise exception 'You already have 5 open reports — we review the oldest first.';
  end if;

  v_today := (
    select count(*) from public.bug_reports
    where user_id = auth.uid()
      and created_at > now() - interval '24 hours'
  );
  if v_today >= 10 then
    raise exception 'That''s 10 reports in one day — slow down, we''ve got them all.';
  end if;

  insert into public.bug_reports (user_id, page_url, description)
  values (auth.uid(), left(coalesce(p_page_url, ''), 2000), p_description)
  returning id into v_id;

  return v_id;
end;
$$;

-- The user's own report history (status visibility).
create or replace function public.my_bug_reports()
returns table (
  id uuid, page_url text, description text,
  status text, staff_note text,
  created_at timestamptz, resolved_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.page_url, r.description, r.status, r.staff_note,
         r.created_at, r.resolved_at
  from public.bug_reports r
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 50;
$$;

-- ---------------- staff functions ----------------

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

-- Resolve a report with an optional note (visible to the reporter).
-- Owner only: resolving means fixing the code. The old staff-level function
-- is dropped so admins cannot reach it. Staff still read the queue.
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

revoke execute on function public.submit_bug_report(text, text) from anon, authenticated;
grant execute on function public.submit_bug_report(text, text) to authenticated;

revoke execute on function public.my_bug_reports() from anon, authenticated;
grant execute on function public.my_bug_reports() to authenticated;

revoke execute on function public.admin_list_bug_reports() from anon, authenticated;
grant execute on function public.admin_list_bug_reports() to authenticated;

revoke execute on function public.admin_ack_bug_report(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_ack_bug_report(uuid[]) to authenticated;

revoke execute on function public.owner_resolve_bug_report(uuid, text) from public, anon, authenticated;
grant execute on function public.owner_resolve_bug_report(uuid, text) to authenticated;
