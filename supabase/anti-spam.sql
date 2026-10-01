-- ============================================================
-- 7Combo — anti-spam v2: flood alerts + rating burst limits
-- Run once in the Supabase SQL Editor. Idempotent.
--
-- Rules (constants are inline in the triggers, documented here):
--   posting   UNLIMITED — posting is never blocked and never auto-
--             timed out (manual moderation is preferred). Instead,
--             whenever a non-staff user posts MORE than 5 combos
--             within a rolling 60 minutes, a "flood" alert is
--             logged once per hour for moderators to review. The
--             user is not blocked, warned, or notified.
--   rating    rating DIFFERENT combos is unlimited (that is the point
--             of the site); max 5 rating actions on ONE combo per
--             10 minutes. Every change counts: rating, re-rating,
--             AND removing a rating (unrate) all hit the same
--             ledger — so rapid rate/unrate cycling trips the
--             limit exactly like re-rate spam does.
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
--             admin panel surfaces as a popup and an overview card
--
--   the posting trigger never cancels a write: it always returns NEW.
--   the rating trigger escalates exactly like before and returns NULL
--   to cancel a violating write; the API notices via
--   my_last_rate_limit_event() and answers 429.
-- ============================================================

-- ---------- event log: every automatic action ----------
create table if not exists public.moderation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('warning', 'timeout')),
  action text not null check (action in ('post', 'rate')),
  scope text not null check (scope in ('posting', 'rating')),
  context uuid,               -- the combo for rate events, null for post
  reason text not null,       -- full user-facing message
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

-- Widen the event vocabulary (idempotent): comments added 'comment'
-- in comments.sql; this migration adds the 'flood' alert type.
alter table public.moderation_events
  drop constraint if exists moderation_events_event_type_check;
alter table public.moderation_events
  add constraint moderation_events_event_type_check
  check (event_type in ('warning', 'timeout', 'flood'));

alter table public.moderation_events
  drop constraint if exists moderation_events_action_check;
alter table public.moderation_events
  add constraint moderation_events_action_check
  check (action in ('post', 'rate', 'comment'));

alter table public.moderation_events
  drop constraint if exists moderation_events_scope_check;
alter table public.moderation_events
  add constraint moderation_events_scope_check
  check (scope in ('posting', 'rating'));

-- ---------- posting ledger: successful combo posts ----------
-- Counting ledger rows instead of the combos table means deleting
-- combos cannot change the flood count.
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

-- ---------- posting flood watcher (never blocks) ----------
-- Every successful combo post is logged. More than 5 posts within a
-- rolling hour raises ONE "flood" alert per user per hour for the
-- moderation feed. The insert always succeeds.
create or replace function public.check_posting_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count         integer;
  v_recent_floods integer;
begin
  if new.author_id is null then
    return new;
  end if;

  -- Staff and official test accounts are exempt from all limits.
  if public.excluded_from_limits(new.author_id) then
    return new;
  end if;

  -- Self-cleaning quota ledger: everything older than an hour is gone.
  delete from public.post_log where created_at < now() - interval '1 hour';
  insert into public.post_log (user_id) values (new.author_id);

  v_count := (
    select count(*) from public.post_log where user_id = new.author_id
  );

  -- Alert once per user per rolling hour so a flooder cannot bury
  -- the moderation feed; the event carries the post count at that
  -- moment. The post itself always goes through.
  if v_count > 5 then
    v_recent_floods := (
      select count(*) from public.moderation_events
      where user_id = new.author_id
        and event_type = 'flood'
        and action = 'post'
        and created_at > now() - interval '1 hour'
    );
    if v_recent_floods = 0 then
      insert into public.moderation_events
        (user_id, event_type, action, scope, reason)
      values
        (new.author_id, 'flood', 'post', 'posting',
         '[Flood alert] Posted ' || v_count::text ||
         ' combos within 60 minutes — flagged for manual review. Posting is not blocked; moderate manually if needed.');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists combos_posting_limit on public.combos;
create trigger combos_posting_limit
  before insert on public.combos
  for each row execute function public.check_posting_limit();

-- ---------- rating burst limit trigger (rates + unrates) ----------
-- Fires on insert, update AND delete: removing a rating is a rating
-- action too, so rate/unrate cycling cannot dodge the burst limit.
-- The delete half uses OLD and returns OLD (returning NULL would
-- silently cancel the delete); banned users may still unrate, they
-- just do not refill the ledger.
create or replace function public.check_rating_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid;
  v_combo      uuid;
  v_count      integer;
  v_violations integer;
  v_user_msg   text;
  v_until      timestamptz;
begin
  v_user  := coalesce(new.user_id, old.user_id);
  v_combo := coalesce(new.combo_id, old.combo_id);

  if v_user is null then
    return coalesce(new, old);
  end if;

  if public.excluded_from_limits(v_user) then
    return coalesce(new, old);
  end if;

  -- An active rating restriction (admin or auto) blocks new ratings at
  -- RLS anyway. Removing a rating stays allowed in that state (it
  -- reduces their footprint) and does not refill the ledger. Rating
  -- DIFFERENT combos stays unlimited by design: this guard only
  -- watches bursts on one combo.
  if exists (
    select 1 from public.profiles
    where id = v_user
      and ban_scope in ('rating', 'both')
      and (ban_until is null or ban_until > now())
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return null;
  end if;

  -- Self-cleaning burst ledger for this (user, combo) pair.
  delete from public.rate_log where created_at < now() - interval '10 minutes';

  v_count := (
    select count(*) from public.rate_log
    where user_id = v_user and combo_id = v_combo
  );

  if v_count < 5 then
    insert into public.rate_log (user_id, combo_id) values (v_user, v_combo);
    return coalesce(new, old);
  end if;

  v_violations := (
    select count(*) from public.moderation_events
    where user_id = v_user
      and action = 'rate'
      and created_at > now() - interval '24 hours'
  );

  if v_violations < 2 then
    v_user_msg := 'You have rated, re-rated or removed ratings on this same combo '
      || (v_count + 1)::text
      || ' times within a few minutes. Rating different combos is unlimited — rapid rating changes on one combo are limited. '
      || case v_violations
           when 0 then 'Warning 1 of 2 — continuing triggers an automatic timeout.'
           else 'Final warning (2 of 2) — the next attempt triggers an automatic timeout.'
         end;

    insert into public.moderation_events (user_id, event_type, action, scope, context, reason)
    values (v_user, 'warning', 'rate', 'rating', v_combo, '[Automatic] ' || v_user_msg);

    if tg_op = 'DELETE' then
      return old;
    end if;
    return null;
  end if;

  v_until := now()
    + case when v_violations = 2 then interval '1 hour' else interval '24 hours' end;
  v_user_msg := 'Timed out from rating for '
    || case when v_violations = 2 then '1 hour' else '24 hours' end
    || ' — the same combo was rated and changed repeatedly within minutes. Rating different combos is unlimited once the timeout ends. You can appeal from the restriction popup or your profile.';

  insert into public.moderation_events (user_id, event_type, action, scope, context, reason, until, expires_at)
  values (v_user, 'timeout', 'rate', 'rating', v_combo, '[Automatic] ' || v_user_msg, v_until, now() + interval '24 hours');

  update public.profiles
     set ban_scope = 'rating',
         ban_until = v_until,
         ban_reason = '[Automatic] ' || v_user_msg,
         ban_at = now(),
         appeal_status = 'none',
         appeal_text = null,
         appeal_at = null
   where id = v_user;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists ratings_rating_limit on public.ratings;
create trigger ratings_rating_limit
  before insert or update or delete on public.ratings
  for each row execute function public.check_rating_limit();

-- ---------- automatic timeout lifecycle ----------
-- Any profile write re-checks the ban: if the restriction is an expired
-- automatic one, clear it (and auto-uphold a still-pending appeal).
-- Legacy automatic POSTING timeouts simply expire and clear here; no
-- new ones are ever created.
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
