-- ============================================================
-- 7Combo — comments on combos (roadmap #6)
-- Run once in the Supabase SQL Editor. Idempotent.
--
--   * combo_comments: flat comments on a combo, max 2000 chars
--   * public reads live (non-hidden) comments; authors manage their own
--   * posting a comment requires NOT being banned from posting — the
--     existing posting-scope ban covers comments too
--   * burst limit wired into the anti-spam system: 8 comments per
--     combo per rolling 5 minutes triggers a posting-scope event with
--     the same warning -> auto-timeout escalation, logged to
--     moderation_events (shows in the admin popup + Auto-mod card)
--   * staff (moderator+) can hide/unhide/delete any comment
-- ============================================================

create table if not exists public.combo_comments (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.combos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  hidden boolean not null default false,
  hidden_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists combo_comments_combo_idx
  on public.combo_comments (combo_id, created_at desc);
create index if not exists combo_comments_author_idx
  on public.combo_comments (author_id);

alter table public.combo_comments enable row level security;

-- ---------- RLS: comments ----------

-- Public reads live comments; staff also see hidden ones (moderation).
drop policy if exists "Public read live comments" on public.combo_comments;
create policy "Public read live comments"
  on public.combo_comments for select
  using (hidden = false or public.is_staff());

-- A signed-in user posts their own comments only while not banned from
-- posting (posting scope covers comments).
drop policy if exists "Users comment while not posting-banned" on public.combo_comments;
create policy "Users comment while not posting-banned"
  on public.combo_comments for insert
  with check (
    auth.uid() = author_id
    and not public.is_banned('posting')
  );

-- Authors edit their own comment text; staff may edit any (unhide).
drop policy if exists "Authors update own comments" on public.combo_comments;
create policy "Authors update own comments"
  on public.combo_comments for update
  using (auth.uid() = author_id or public.is_staff())
  with check (auth.uid() = author_id or public.is_staff());

-- Authors delete their own; staff delete any.
drop policy if exists "Authors or staff delete comments" on public.combo_comments;
create policy "Authors or staff delete comments"
  on public.combo_comments for delete
  using (auth.uid() = author_id or public.is_staff());

-- Column-level lock: users may only edit their own comment's body.
revoke update on public.combo_comments from anon, authenticated;
grant update (body, updated_at) on public.combo_comments to authenticated;

-- ---------- comment burst limit (anti-spam integration) ----------
-- Log ledger mirrors post_log: rows survive comment deletion, so
-- delete-and-repost cannot farm quota.
create table if not exists public.comment_log (
  user_id uuid not null,
  combo_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists comment_log_user_idx on public.comment_log (user_id, created_at desc);
create index if not exists comment_log_created_idx on public.comment_log (created_at);
alter table public.comment_log enable row level security; -- internal only

create or replace function public.check_comment_limit()
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
  if new.author_id is null then
    return new;
  end if;

  -- Staff roles only are exempt (is_test is a badge, not an exemption).
  if public.excluded_from_limits(new.author_id) then
    return new;
  end if;

  -- An active posting restriction (admin or auto) means RLS blocks the
  -- insert anyway; the API explains via my_ban_state().
  if exists (
    select 1 from public.profiles
    where id = new.author_id
      and ban_scope in ('posting', 'both')
      and (ban_until is null or ban_until > now())
  ) then
    return null;
  end if;

  -- Self-cleaning ledger for this (user, combo) pair.
  delete from public.comment_log where created_at < now() - interval '5 minutes';

  v_count := (
    select count(*) from public.comment_log
    where user_id = new.author_id and combo_id = new.combo_id
  );

  if v_count < 8 then
    insert into public.comment_log (user_id, combo_id)
    values (new.author_id, new.combo_id);
    return new;
  end if;

  v_violations := (
    select count(*) from public.moderation_events
    where user_id = new.author_id
      and action = 'comment'
      and created_at > now() - interval '24 hours'
  );

  if v_violations < 2 then
    v_user_msg := 'You have posted several comments on this combo in a very short time. Slow down a little. '
      || case v_violations
           when 0 then 'Warning 1 of 2 — continuing triggers an automatic timeout.'
           else 'Final warning (2 of 2) — the next attempt triggers an automatic timeout.'
         end;

    insert into public.moderation_events (user_id, event_type, action, scope, context, reason)
    values (new.author_id, 'warning', 'comment', 'posting', new.combo_id, '[Automatic] ' || v_user_msg);

    return null;
  end if;

  v_until := now()
    + case when v_violations = 2 then interval '1 hour' else interval '24 hours' end;
  v_user_msg := 'Timed out from posting for '
    || case when v_violations = 2 then '1 hour' else '24 hours' end
    || ' — comments were being flooded on one combo. Browsing and rating stay open. You can appeal from the restriction popup or your profile.';

  insert into public.moderation_events (user_id, event_type, action, scope, context, reason, until, expires_at)
  values (new.author_id, 'timeout', 'comment', 'posting', new.combo_id, '[Automatic] ' || v_user_msg, v_until, now() + interval '24 hours');

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

drop trigger if exists combo_comments_limit on public.combo_comments;
create trigger combo_comments_limit
  before insert on public.combo_comments
  for each row execute function public.check_comment_limit();

-- The anti-spam action check constraint only knows 'post' and 'rate' —
-- widen it to accept 'comment' too.
alter table public.moderation_events
  drop constraint if exists moderation_events_action_check;
alter table public.moderation_events
  add constraint moderation_events_action_check
  check (action in ('post', 'rate', 'comment'));

-- ---------- staff moderation ----------
create or replace function public.admin_set_comment_hidden(p_comment uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  update public.combo_comments
     set hidden = p_hidden,
         hidden_by = case when p_hidden then auth.uid() else null end,
         updated_at = now()
   where id = p_comment;
  return found;
end;
$$;

-- ---------- what the API reads after a blocked comment ----------
-- action='comment', context=combo id — reuse my_last_rate_limit_event.
-- (No new function needed; the widened action constraint covers it.)

-- ---------- locks ----------
revoke execute on function public.check_comment_limit() from anon, authenticated;
revoke execute on function public.admin_set_comment_hidden(uuid, boolean) from anon, authenticated;
grant execute on function public.admin_set_comment_hidden(uuid, boolean) to authenticated;
