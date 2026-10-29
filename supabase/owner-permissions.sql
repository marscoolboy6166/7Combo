-- ============================================================
-- Owner-only identity management
--   owner:     roles + official test-account flag
--   admin:     ban / timeout / appeals only
--   moderator: catalog + combos
--
-- Paste this whole file into Supabase -> SQL Editor -> Run.
-- Safe to run more than once. It also removes the older admin
-- functions (admin_grant_role, admin_set_role, admin_set_test)
-- so the schema cache cannot fall back to them.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Role-change log — powers the one-time "your role changed" popup
-- ------------------------------------------------------------
create table if not exists public.role_change_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  old_role text not null,
  new_role text not null,
  created_at timestamptz not null default now()
);
create index if not exists role_change_events_user_idx
  on public.role_change_events (user_id, created_at desc);

alter table public.role_change_events enable row level security;
-- Written only by the security-definer functions below and read only
-- through my_recent_role_changes(): no grants for anon/authenticated.
revoke all on public.role_change_events from anon, authenticated;

-- ------------------------------------------------------------
-- 2) Delete every older role entry point (both parameter orders)
-- ------------------------------------------------------------
drop function if exists public.admin_grant_role(text, uuid);
drop function if exists public.admin_grant_role(uuid, text);
drop function if exists public.admin_set_role(uuid, text);
drop function if exists public.owner_grant_role(text, uuid);

-- ------------------------------------------------------------
-- 3) The only role function: owner-only.
--    Accepts user / moderator / admin; refuses the owner role,
--    self-changes, and owner targets; logs every real change.
-- ------------------------------------------------------------
create or replace function public.owner_grant_role(p_target uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  if p_role is null or p_role not in ('user', 'moderator', 'admin') then
    raise exception 'Invalid role';
  end if;
  if p_target = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  select role into v_old from public.profiles where id = p_target;
  if v_old is null then
    return false;
  end if;
  if v_old = 'owner' then
    raise exception 'The owner role cannot be changed';
  end if;
  if v_old = p_role then
    return true;
  end if;
  update public.profiles set role = p_role where id = p_target;
  insert into public.role_change_events (user_id, changed_by, old_role, new_role)
  values (p_target, auth.uid(), v_old, p_role);
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 4) Official test-account flag: owner-only
-- ------------------------------------------------------------
drop function if exists public.admin_set_test(uuid, boolean);

create or replace function public.owner_set_test(p_target uuid, p_is_test boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  update public.profiles set is_test = p_is_test where id = p_target;
  return found;
end;
$$;

-- ------------------------------------------------------------
-- 5) Popup query: latest role change for the signed-in user.
--    Only returns a row while the logged change still matches
--    the current role, so a later demotion shows nothing stale.
-- ------------------------------------------------------------
create or replace function public.my_recent_role_changes()
returns table (user_id uuid, event_type text, role text, changed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id, 'role_change'::text, e.new_role, e.created_at
  from public.role_change_events e
  join public.profiles p on p.id = e.user_id
  where e.user_id = auth.uid()
    and p.role = e.new_role
    and e.created_at > now() - interval '24 hours'
  order by e.created_at desc
  limit 1;
$$;

-- ------------------------------------------------------------
-- 6) Permissions: callable by signed-in users only, and each
--    function re-checks is_owner() internally.
-- ------------------------------------------------------------
revoke execute on function public.owner_grant_role(uuid, text) from public, anon, authenticated;
grant execute on function public.owner_grant_role(uuid, text) to authenticated;
revoke execute on function public.owner_set_test(uuid, boolean) from public, anon, authenticated;
grant execute on function public.owner_set_test(uuid, boolean) to authenticated;
revoke execute on function public.my_recent_role_changes() from public, anon, authenticated;
grant execute on function public.my_recent_role_changes() to authenticated;

-- ------------------------------------------------------------
-- 7) Make the API see the change immediately
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 8) Check it worked (optional, ~5 seconds).
--    Expected result: exactly two rows —
--      owner_grant_role | p_target uuid, p_role text
--      owner_set_test   | p_target uuid, p_is_test boolean
-- ------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('owner_grant_role', 'owner_set_test',
                    'admin_grant_role', 'admin_set_role', 'admin_set_test')
order by p.proname;
