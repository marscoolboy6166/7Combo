-- ============================================================
-- Ban-permission hierarchy: owner > admin
--  - The owner can ban/timeout ANYONE except themselves.
--  - Admins cannot ban admins or the owner (only the owner can).
--  - Lifting restrictions and deciding appeals on admins is
--    likewise owner-only, so nobody can undo the owner's call.
-- Run once in Supabase -> SQL Editor. Idempotent (safe to re-run).
-- ============================================================

create or replace function public.admin_set_ban(
  p_target uuid, p_scope text, p_until timestamptz, p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_target = auth.uid() then
    raise exception 'You cannot ban yourself';
  end if;
  if exists (select 1 from public.profiles where id = p_target and role = 'owner') then
    raise exception 'The owner cannot be banned';
  end if;
  if exists (select 1 from public.profiles where id = p_target and is_admin)
     and not public.is_owner() then
    raise exception 'Only the owner can restrict an admin';
  end if;
  if p_scope not in ('posting', 'rating', 'both') then
    raise exception 'Invalid scope';
  end if;
  update public.profiles
     set ban_scope = p_scope,
         ban_until = p_until,
         ban_reason = nullif(p_reason, ''),
         ban_at = now(),
         appeal_status = 'none',
         appeal_text = null,
         appeal_at = null
   where id = p_target;
  return found;
end;
$$;

create or replace function public.admin_lift_ban(p_target uuid, p_appeal text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
  return found;
end;
$$;

create or replace function public.admin_deny_appeal(p_target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if exists (select 1 from public.profiles where id = p_target and is_admin)
     and not public.is_owner() then
    raise exception 'Only the owner can decide an admin appeal';
  end if;
  update public.profiles
     set appeal_status = 'denied', appeal_at = now()
   where id = p_target and appeal_status = 'pending';
  return found;
end;
$$;
