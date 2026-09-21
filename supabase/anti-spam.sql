-- ============================================================
-- 7Combo — anti-spam: warnings + automatic temporary timeouts
-- (roadmap #4) Run once in the Supabase SQL Editor. Idempotent.
--
-- Rules (constants are inline in the triggers, documented here):
--   posting   max 3 combo posts per rolling hour (the quota counts
--             successful posts; deleting a combo never restores quota)
--             violation 1-2 -> friendly warning
--             violation 3   -> 1h automatic timeout from posting
--             violation 4+  -> 24h automatic timeout from posting
--   rating    rating DIFFERENT combos is unlimited (that is the point
--             of the site); max 5 rating actions on ONE combo per
--             10 minutes (re-rates and delete+re-rate both count)
--             violation 1-2 -> friendly warning
--             violation 3   -> 1h automatic timeout from rating
--             violation 4+  -> 24h automatic timeout from rating
--
--   exempt:   owner, admins, moderators ONLY — is_test is purely a
--             visual status badge and does NOT exempt an account, so
--             test accounts can be used to test the limits themselves
--   timeouts: reuse the existing ban system (reason prefixed
--             "[Automatic]", auto-cleared on expiry, a pending appeal
--             is auto-upheld) so the restriction popup, the one-appeal
--             flow and admin lifting all work unchanged
--   every automatic action is logged to moderation_events, which the
--   admin panel surfaces as a popup and an overview card
--
--   triggers never raise errors: they log the event, apply any timeout,
--   then return NULL to quietly cancel the violating write. The API
--   notices via my_last_rate_limit_event() and answers 429.
-- ============================================================

-- ---------- event log: every automatic action ----------
create table if not exists public.moderation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('warning', 'timeout')),
  action text not null check (action in ('post', 'rate')),
  scope text not null check (scope in ('posting', 'rating')),
  context uuid,               -- the combo for rate events, null for post
  reason text not null,       -- full user-facing message (prefixed "[Automatic] ")
  until timestamptz,          -- timeouts only
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);
create index if not exists moderation_events_user_idx
  on public.moderation_events (user_id, created_at desc);
create index if not exists moderation_events_created_idx
  on public.moderation_events (created_at desc);

alter table public.moderation_events enable row level security;
-- No policies and no grants: rows are written by the triggers (security
-- definer) and read only through admin_recent_moderation().

-- ---------- quota ledger: successful combo posts ----------
-- Counting ledger rows instead of the combos table means deleting
-- combos cannot farm extra quota.
create table if not exists public.post_log (
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists post_log_user_idx on public.post_log (user_id, created_at desc);
create index if not exists post_log_created_idx on public.post_log (created_at);
alter table public.post_log enable row level security; -- internal only

-- ---------- burst ledger: rating actions per (user, combo) ----------
create table if not exists public.rate_log (
  user_id uuid not null,
  combo_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_log_pair_idx on public.rate_log (user_id, combo_id, created_at desc);
create index if not exists rate_log_created_idx on public.rate_log (created_at);
alter table public.rate_log enable row level security; -- internal only

-- ---------- who is exempt ----------
create or replace function public.excluded_from_limits(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user
      and (
        role in ('owner', 'admin', 'moderator')
        or is_admin = true
      )
  );
$$;

-- ---------- posting limit trigger ----------
create or replace function public.check_posting_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count      integer;
  v_violations integer;
  v_first      timestamptz;
  v_wait       integer;
  v_user_msg   text;
  v_until      timestamptz;
begin
  if new.author_id is null then
    return new;
  end if;

  -- Staff and official test accounts are exempt from all limits.
  if public.excluded_from_limits(new.author_id) then
    return new;
  end if;

  -- An active restriction (admin ban or our own auto timeout) means RLS
  -- blocks the insert anyway; the API explains via my_ban_state().
  if exists (
    select 1 from public.profiles
    where id = new.author_id
      and ban_scope in ('posting', 'both')
      and (ban_until is null or ban_until > now())
  ) then
    return null;
  end if;

  -- Self-cleaning quota ledger: everything older than an hour is gone.
  delete from public.post_log where created_at < now() - interval '1 hour';

  v_count := (
    select count(*) from public.post_log where user_id = new.author_id
  );

  if v_count < 3 then
    insert into public.post_log (user_id) values (new.author_id);
    return new;
  end if;

  -- Blocked attempt: escalate via the 24h violation window.
  v_violations := (
    select count(*) from public.moderation_events
    where user_id = new.author_id
      and action = 'post'
      and created_at > now() - interval '24 hours'
  );

  if v_violations < 2 then
    -- Warning 1 or 2. Minutes until the oldest successful post ages out.
    select min(created_at) into v_first
      from public.post_log where user_id = new.author_id;
    v_wait := greatest(ceil(60 - (extract(epoch from (now() - v_first)) / 60))::int, 1);

    v_user_msg := 'Posting limit reached: 3 combos per hour keeps the feed fresh. You can post again in about '
      || v_wait::text
      || ' minutes. '
      || case v_violations
           when 0 then 'Warning 1 of 2 — continuing past the limit triggers an automatic timeout.'
           else 'Final warning (2 of 2) — the next attempt triggers an automatic timeout.'
         end;

    insert into public.moderation_events (user_id, event_type, action, scope, reason)
    values (new.author_id, 'warning', 'post', 'posting', '[Automatic] ' || v_user_msg);

    return null; -- cancel the insert; the API answers 429 with the message
  end if;

  v_until := now()
    + case when v_violations = 2 then interval '1 hour' else interval '24 hours' end;
  v_user_msg := 'Timed out from posting for '
    || case when v_violations = 2 then '1 hour' else '24 hours' end
    || ' — the posting limit (3 per hour) was passed repeatedly. Browsing and rating stay open. You can appeal from the restriction popup or your profile.';

  insert into public.moderation_events (user_id, event_type, action, scope, reason, until, expires_at)
  values (new.author_id, 'timeout', 'post', 'posting', '[Automatic] ' || v_user_msg, v_until, now() + interval '24 hours');

  -- Reuses the ban system so the popup, appeal flow and admin lifting work.
  update public.profiles
     set ban_scope = 'posting',
         ban_until = v_until,
         ban_reason = '[Automatic] ' || v_user_msg,
         ban_at = now(),
         appeal_status = 'none',
         appeal_text = null,
         appeal_at = null
   where id = new.author_id;

  return null;
end;
$$;

drop trigger if exists combos_posting_limit on public.combos;
create trigger combos_posting_limit
  before insert on public.combos
  for each row execute function public.check_posting_limit();

-- ---------- rating burst limit trigger ----------
create or replace function public.check_rating_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count      integer;
  v_violations integer;
  v_user_msg   text;
  v_until      timestamptz;
begin
  if new.user_id is null then
    return new;
  end if;

  if public.excluded_from_limits(new.user_id) then
    return new;
  end if;

  -- An active rating restriction (admin or auto) means RLS blocks the
  -- insert anyway. Rating DIFFERENT combos stays unlimited by design:
  -- this guard only watches bursts on one combo.
  if exists (
    select 1 from public.profiles
    where id = new.user_id
      and ban_scope in ('rating', 'both')
      and (ban_until is null or ban_until > now())
  ) then
    return null;
  end if;

  -- Self-cleaning burst ledger for this (user, combo) pair.
  delete from public.rate_log where created_at < now() - interval '10 minutes';

  v_count := (
    select count(*) from public.rate_log
    where user_id = new.user_id and combo_id = new.combo_id
  );

  if v_count < 5 then
    insert into public.rate_log (user_id, combo_id) values (new.user_id, new.combo_id);
    return new;
  end if;

  v_violations := (
    select count(*) from public.moderation_events
    where user_id = new.user_id
      and action = 'rate'
      and created_at > now() - interval '24 hours'
  );

  if v_violations < 2 then
    v_user_msg := 'You have rated and re-rated this same combo '
      || (v_count + 1)::text
      || ' times within a few minutes. Rating different combos is unlimited — rapid re-rating of one combo is limited. '
      || case v_violations
           when 0 then 'Warning 1 of 2 — continuing triggers an automatic timeout.'
           else 'Final warning (2 of 2) — the next attempt triggers an automatic timeout.'
         end;

    insert into public.moderation_events (user_id, event_type, action, scope, context, reason)
    values (new.user_id, 'warning', 'rate', 'rating', new.combo_id, '[Automatic] ' || v_user_msg);

    return null;
  end if;

  v_until := now()
    + case when v_violations = 2 then interval '1 hour' else interval '24 hours' end;
  v_user_msg := 'Timed out from rating for '
    || case when v_violations = 2 then '1 hour' else '24 hours' end
    || ' — the same combo was re-rated repeatedly within minutes. Rating different combos is unlimited once the timeout ends. You can appeal from the restriction popup or your profile.';

  insert into public.moderation_events (user_id, event_type, action, scope, context, reason, until, expires_at)
  values (new.user_id, 'timeout', 'rate', 'rating', new.combo_id, '[Automatic] ' || v_user_msg, v_until, now() + interval '24 hours');

  update public.profiles
     set ban_scope = 'rating',
         ban_until = v_until,
         ban_reason = '[Automatic] ' || v_user_msg,
         ban_at = now(),
         appeal_status = 'none',
         appeal_text = null,
         appeal_at = null
   where id = new.user_id;

  return null;
end;
$$;

drop trigger if exists ratings_rating_limit on public.ratings;
create trigger ratings_rating_limit
  before insert or update on public.ratings
  for each row execute function public.check_rating_limit();

-- ---------- automatic timeout lifecycle ----------
-- Any profile write re-checks the ban: if the restriction is an expired
-- automatic one, clear it (and auto-uphold a still-pending appeal).
create or replace function public.auto_ban_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ban_scope is null or (new.ban_until is not null and new.ban_until <= now()) then
    if new.ban_reason like '[Automatic]%' then
      new.ban_scope := null;
      new.ban_until := null;
      new.ban_reason := null;
      new.ban_at := null;
      if new.appeal_status = 'pending' then
        new.appeal_status := 'upheld';
        new.appeal_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_auto_ban_lifecycle on public.profiles;
create trigger profiles_auto_ban_lifecycle
  before insert or update on public.profiles
  for each row execute function public.auto_ban_lifecycle();

-- ---------- what the API reads after a blocked write ----------
-- Returns the caller's rate-limit event from the last few seconds, so
-- the API can answer 429 with the right message (null = not limited).
create or replace function public.my_last_rate_limit_event(p_action text, p_context uuid default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'event_type', event_type,
    'action', action,
    'scope', scope,
    'reason', reason,
    'until', until
  )
  from public.moderation_events
  where user_id = auth.uid()
    and action = p_action
    and context is not distinct from p_context
    and created_at > now() - interval '5 seconds'
  order by id desc
  limit 1;
$$;

-- ---------- staff view of recent automatic actions ----------
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
  created_at timestamptz
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
         e.event_type, e.action, e.scope, e.reason, e.until, e.expires_at, e.created_at
  from public.moderation_events e
  left join public.profiles p on p.id = e.user_id
  order by e.created_at desc
  limit 50;
end;
$$;

-- ---------- locks ----------
revoke execute on function public.check_posting_limit() from anon, authenticated;
revoke execute on function public.check_rating_limit() from anon, authenticated;
revoke execute on function public.auto_ban_lifecycle() from anon, authenticated;
revoke execute on function public.my_last_rate_limit_event(text, uuid) from anon;
revoke execute on function public.admin_recent_moderation() from anon, authenticated;
grant execute on function public.my_last_rate_limit_event(text, uuid) to authenticated;
grant execute on function public.admin_recent_moderation() to authenticated;

-- Sanity (optional, read-only):
-- select * from public.admin_recent_moderation();
