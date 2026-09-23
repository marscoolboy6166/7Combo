-- ============================================================
-- 7Combo — database schema
-- Run this in the Supabase SQL Editor (or `supabase db push`).
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / ON CONFLICT guards where the syntax allows it.
--
-- Companion migrations (run after this file, in order):
--   1. supabase/admin-ban-hierarchy.sql  — owner/admin ban permissions
--   2. supabase/anti-spam.sql            — warnings + auto-timeouts
--   3. supabase/comments.sql             — combo comments
--   4. supabase/filter-appeals.sql       — filter appeals + phrase whitelist
-- ============================================================

-- ---------- profiles: mirrors auth.users, auto-created on signup ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Snacker',
  username text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Upgrade path for projects where the table already exists
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;

drop policy if exists "Public read profiles" on public.profiles;
create policy "Public read profiles"
  on public.profiles for select
  using (true);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Column-level lock: users may only edit their own display fields.
-- Without this, any signed-in user could set is_admin = true on their
-- own row (RLS only restricts WHICH rows, not WHICH columns).
revoke update on public.profiles from anon, authenticated;
grant update (display_name, username, avatar_url) on public.profiles to authenticated;

-- Auto-create a profile whenever a new auth user appears
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  meta_name text;
  email_prefix text;
begin
  -- OAuth providers (Google) put the profile name in user metadata; email
  -- magic-link sign-ups have none, so fall back to the email prefix
  -- ("jane@x.com" -> "Jane") and finally the generic default.
  meta_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  );
  email_prefix := left(
    coalesce(nullif(split_part(new.email, '@', 1), ''), ''),
    24
  );

  -- Username: letters/digits from the name, else email prefix, else id-based.
  base_username := left(
    coalesce(
      nullif(
        regexp_replace(lower(coalesce(meta_name, email_prefix, '')), '[^a-z0-9]+', '', 'g'),
        ''
      ),
      'user-' || left(new.id::text, 8)
    ),
    24
  );

  insert into public.profiles (id, display_name, avatar_url, username)
  values (
    new.id,
    coalesce(
      nullif(meta_name, ''),
      nullif(initcap(email_prefix), ''),
      'Snacker'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    base_username
  )    on conflict (id) do nothing;
    return new;
exception
  when unique_violation then
    -- Username already taken: append a short id suffix and retry once.
    -- (No separator: profile validation requires letters/digits only.)
    insert into public.profiles (id, display_name, avatar_url, username)
    values (
      new.id,
      coalesce(
        nullif(meta_name, ''),
        nullif(initcap(email_prefix), ''),
        'Snacker'
      ),
      new.raw_user_meta_data ->> 'avatar_url',
      left(base_username, 20) || left(new.id::text, 4)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- profile name / username validation ----------
-- Display names are free-form (symbols welcome, duplicates allowed) but must
-- not contain links or profanity. Usernames are the public handle in the
-- /u/<username> URL: globally unique (unique index), 3-24 ASCII letters and
-- digits only, never a reserved route word. Staff (owner/admin/moderator) MAY
-- claim reserved words. INSERTs (auto-created profiles from Google/magic-link
-- claimed reserved words (owner/admins: all; moderators: only "moderator"
-- and "mod"; everyone else: none). INSERTs (auto-created profiles from
-- Google/magic-link signups) are sanitized silently instead of rejected, so
-- a weird provider name can never break sign-in. Profanity list mirrors
-- src/lib/text-filter.ts (short words like "yed" excluded to avoid false
-- positives inside names).

create or replace function public.validate_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Role of the writer, straight from their profile (auth.uid() works inside
  -- security-definer; null for brand-new signups = regular user).
  my_role text := (
    select role from public.profiles where id = auth.uid()
  );
  name_clean text := regexp_replace(lower(coalesce(new.display_name, '')), '[^a-z0-9]', '', 'g');
  username_clean text := regexp_replace(lower(coalesce(new.username, '')), '[^a-z0-9]', '', 'g');
  -- Route words nobody below owner/admin may claim.
  reserved text[] := array[
    'admin','api','settings','profile','u','login','submit',
    'combos','products','users','auth','callback',
    'moderator','mod'
  ];
  -- The only reserved words moderators may claim for themselves.
  mod_ok text[] := array['moderator','mod'];
  name_bad boolean;
  username_bad boolean;
  name_changed boolean;
  username_changed boolean;
begin
  -- Only judge values the writer actually changed, so grandfathered legacy
  -- names never block an unrelated edit (INSERT judges everything).
  if tg_op = 'INSERT' then
    name_changed := true;
    username_changed := true;
  else
    name_changed := new.display_name is distinct from old.display_name;
    username_changed := new.username is distinct from old.username;
  end if;
  -- Profanity + link checks apply to everyone, staff included. Matching uses
  -- the collapsed form so "sh!t" or "f u c k" are caught too. Unchanged
  -- (grandfathered) values are not re-judged, so legacy names never block an
  -- unrelated edit.
  name_bad := name_changed
    and (name_clean ~ '(fuck|shit|bitch|bastard|cunt|dickhead|asshole|nigger|nigga|faggot|whore|slut|kway|kwai|sommook|aihia)'
      or coalesce(new.display_name, '') ~ '(https?://|www\.)');
  username_bad := username_changed
    and username_clean ~ '(fuck|shit|bitch|bastard|cunt|dickhead|asshole|nigger|nigga|faggot|whore|slut|kway|kwai|sommook|aihia)';

  if name_bad then
    if tg_op = 'INSERT' then
      new.display_name := 'Snacker';
    else
      raise exception 'Your display name contains language or links we don''t allow. Please pick another.'
        using errcode = 'check_violation';
    end if;
  end if;

  if username_bad then
    if tg_op = 'INSERT' then
      new.username := null;
    else
      raise exception 'That username contains language we don''t allow. Please pick another.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.username is not null and username_changed then
    if tg_op = 'UPDATE' then
      if new.username !~ '^[a-z0-9]{3,24}$' then
        raise exception 'Usernames must be 3-24 characters: English letters and numbers only (no symbols).'
          using errcode = 'check_violation';
      end if;
      -- Reserved-word hierarchy: owner/admins claim anything; moderators may
      -- claim only "moderator"/"mod"; everyone else is blocked from the list.
      if my_role not in ('owner', 'admin') then
        if my_role = 'moderator'
           and lower(new.username) = any (mod_ok) then
          null; -- moderators claiming their own title: allowed
        elsif lower(new.username) = any (reserved) then
          raise exception 'That username is reserved. Please pick another.'
            using errcode = 'check_violation';
        end if;
      end if;
    else
      -- INSERT (auto-created profile): sanitize instead of rejecting.
      if new.username !~ '^[a-z0-9]{3,24}$'
         or (my_role not in ('owner', 'admin')
             and lower(new.username) = any (reserved)
             and not (my_role = 'moderator' and lower(new.username) = any (mod_ok))) then
        new.username := null;
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and name_changed and btrim(coalesce(new.display_name, '')) = '' then
    raise exception 'Display name can''t be empty.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_profile_fields_trg on public.profiles;
create trigger validate_profile_fields_trg
  before insert or update of display_name, username on public.profiles
  for each row execute function public.validate_profile_fields();

-- ---------- helper: is the current user an admin? ----------
-- (defined AFTER the profiles table it reads)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- ---------- products: the 7-Eleven catalog ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_en text not null,
  name_th text,
  category text not null default 'other',
  price_thb numeric(8,2) not null default 0,
  description text,
  emoji text,
  image_url text,
  cities text[] not null default '{all}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Upgrade path for projects where the table already exists
alter table public.products add column if not exists image_url text;
create index if not exists products_category_idx on public.products (category);
create index if not exists products_active_idx on public.products (is_active);

-- ---------- combos: user-submitted product hacks ----------
create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  steps text,
  photo_url text,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  avg_rating numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Upgrade path for projects where the table already exists
alter table public.combos add column if not exists author_name text;

alter table public.combos enable row level security;

drop policy if exists "Public read combos" on public.combos;
create policy "Public read combos"
  on public.combos for select
  using (true);

drop policy if exists "Signed-in users create combos" on public.combos;
create policy "Signed-in users create combos"
  on public.combos for insert
  with check (auth.uid() = author_id);

-- Authors may edit only their own combo's content — never rating stats
-- (the trigger maintains those) or other people's rows.
revoke update on public.combos from anon, authenticated;
grant update (title, description, steps, photo_url) on public.combos to authenticated;

drop policy if exists "Authors update own combos" on public.combos;
create policy "Authors update own combos"
  on public.combos for update
  using (auth.uid() = author_id);

drop policy if exists "Authors delete own combos" on public.combos;
create policy "Authors delete own combos"
  on public.combos for delete
  using (auth.uid() = author_id);

create index if not exists combos_author_idx on public.combos (author_id);
create index if not exists combos_rating_idx on public.combos (avg_rating desc);

-- ---------- combo_items: which products make up a combo ----------
create table if not exists public.combo_items (
  combo_id uuid not null references public.combos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1,
  notes text,
  primary key (combo_id, product_id)
);

alter table public.combo_items enable row level security;

drop policy if exists "Public read combo items" on public.combo_items;
create policy "Public read combo items"
  on public.combo_items for select
  using (true);

drop policy if exists "Combo authors manage items" on public.combo_items;
create policy "Combo authors manage items"
  on public.combo_items for all
  using (
    exists (
      select 1 from public.combos c
      where c.id = combo_id and c.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.combos c
      where c.id = combo_id and c.author_id = auth.uid()
    )
  );

-- ---------- ratings: one 1-5 star rating per user per combo ----------
create table if not exists public.ratings (
  combo_id uuid not null references public.combos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (combo_id, user_id)
);

alter table public.ratings enable row level security;

drop policy if exists "Public read ratings" on public.ratings;
create policy "Public read ratings"
  on public.ratings for select
  using (true);

drop policy if exists "Users insert own ratings" on public.ratings;
create policy "Users insert own ratings"
  on public.ratings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own ratings" on public.ratings;
create policy "Users update own ratings"
  on public.ratings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own ratings" on public.ratings;
create policy "Users delete own ratings"
  on public.ratings for delete
  using (auth.uid() = user_id);

-- Keep the denormalized avg_rating / rating_count in sync
create or replace function public.refresh_combo_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.combo_id, old.combo_id);
  update public.combos c
  set
    avg_rating = coalesce((select round(avg(stars)::numeric, 2) from public.ratings where combo_id = target), 0),
    rating_count = (select count(*) from public.ratings where combo_id = target)
  where c.id = target;
  return null;
end;
$$;

drop trigger if exists ratings_changed on public.ratings;
create trigger ratings_changed
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_combo_rating();

-- ---------- storage: combo photos + product images ----------
insert into storage.buckets (id, name, public)
values ('combo-photos', 'combo-photos', true)
on conflict (id) do nothing;

-- Public bucket for catalog product photos (admins upload, everyone reads)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public bucket for user avatars (users upload their own, everyone reads)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies are created defensively: on some projects the SQL role
-- is not allowed to create policies on storage.objects (must be done via
-- the dashboard instead). If you see notices instead of errors, all good.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read combo photos'
  ) then
    execute 'create policy "Public read combo photos" on storage.objects for select using (bucket_id = ''combo-photos'')';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Signed-in users upload combo photos'
  ) then
    execute 'create policy "Signed-in users upload combo photos" on storage.objects for insert with check (bucket_id = ''combo-photos'' and auth.uid() is not null)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users update own uploads'
  ) then
    execute 'create policy "Users update own uploads" on storage.objects for update using (bucket_id = ''combo-photos'' and owner = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users delete own uploads'
  ) then
    execute 'create policy "Users delete own uploads" on storage.objects for delete using (bucket_id = ''combo-photos'' and owner = auth.uid())';
  end if;

  -- Product images: everyone reads, admins write
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read product images'
  ) then
    execute 'create policy "Public read product images" on storage.objects for select using (bucket_id = ''product-images'')';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins upload product images'
  ) then
    execute 'create policy "Admins upload product images" on storage.objects for insert with check (bucket_id = ''product-images'' and public.is_admin())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins manage product images'
  ) then
    execute 'create policy "Admins manage product images" on storage.objects for update using (bucket_id = ''product-images'' and public.is_admin())';
    execute 'create policy "Admins delete product images" on storage.objects for delete using (bucket_id = ''product-images'' and public.is_admin())';
  end if;

  -- Avatars: everyone reads; users manage only their own file (path = auth.uid + ext)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read avatars'
  ) then
    execute 'create policy "Public read avatars" on storage.objects for select using (bucket_id = ''avatars'')';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users upload own avatar'
  ) then
    execute 'create policy "Users upload own avatar" on storage.objects for insert with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
    execute 'create policy "Users update own avatar" on storage.objects for update using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
    execute 'create policy "Users delete own avatar" on storage.objects for delete using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
  end if;
exception
  when insufficient_privilege then
    raise notice 'Storage policies skipped (insufficient privilege). Create them in Dashboard > Storage > Policies instead.';
end $$;

-- ============================================================
-- Combo moderation (admins): archived column + admin policies
-- Safe to re-run. Also runs as part of a full schema run.
-- ============================================================

alter table public.combos add column if not exists archived boolean not null default false;
create index if not exists combos_archived_idx on public.combos (archived);

-- Public visitors see only live combos; admins also see archived ones
-- (needed for the moderation list and unarchive).
drop policy if exists "Public read combos" on public.combos;
create policy "Public read combos"
  on public.combos for select
  using (archived = false or public.is_admin());

drop policy if exists "Admins update any combos" on public.combos;
create policy "Admins update any combos"
  on public.combos for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete any combos" on public.combos;
create policy "Admins delete any combos"
  on public.combos for delete
  using (public.is_admin());

-- Column-level grants: authors may edit their own content fields and may
-- archive their own combo; only admins can unarchive (they are the only
-- ones who can see archived rows to act on them).
revoke update on public.combos from anon, authenticated;
grant update (title, description, steps, photo_url, archived) on public.combos to authenticated;

-- ============================================================
-- User system: bans/timeouts + one-appeal system
-- Safe to re-run. Also runs as part of a full schema run.
-- ============================================================

alter table public.profiles add column if not exists ban_scope text check (ban_scope in ('posting','rating','both'));
alter table public.profiles add column if not exists ban_until timestamptz;
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists ban_at timestamptz;

alter table public.profiles add column if not exists appeal_status text not null default 'none' check (appeal_status in ('none','pending','denied','upheld'));
alter table public.profiles add column if not exists appeal_text text;
alter table public.profiles add column if not exists appeal_at timestamptz;

-- True when the caller is currently banned from a given scope
-- ('posting', 'rating', or 'both'). Permanent ban = ban_until is null.
create or replace function public.is_banned(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and ban_scope is not null
      and ban_scope in (p_scope, 'both')
      and (ban_until is null or ban_until > now())
  );
$$;

-- DB-level ban enforcement: a banned user's writes fail even if a future
-- bug bypasses the API checks.
drop policy if exists "Signed-in users create combos" on public.combos;
create policy "Signed-in users create combos"
  on public.combos for insert
  with check (
    auth.uid() = author_id
    and not public.is_banned('posting')
  );

drop policy if exists "Users insert own ratings" on public.ratings;
create policy "Users insert own ratings"
  on public.ratings for insert
  with check (
    auth.uid() = user_id
    and not public.is_banned('rating')
  );

drop policy if exists "Users update own ratings" on public.ratings;
create policy "Users update own ratings"
  on public.ratings for update
  using (auth.uid() = user_id and not public.is_banned('rating'))
  with check (auth.uid() = user_id and not public.is_banned('rating'));

-- A user's own ban/appeal state, readable without exposing ban columns to
-- broad SELECT (only the caller's own row is returned).
create or replace function public.my_ban_state()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'banned', ban_scope is not null and (ban_until is null or ban_until > now()),
    'scope', case when ban_scope is not null and (ban_until is null or ban_until > now()) then ban_scope end,
    'until', case when ban_scope is not null and (ban_until is null or ban_until > now()) then ban_until end,
    'reason', case when ban_scope is not null and (ban_until is null or ban_until > now()) then ban_reason end,
    'appeal_status', appeal_status,
    'appeal_text', appeal_text,
    'appeal_at', appeal_at,
    'can_appeal', ban_scope is not null and (ban_until is null or ban_until > now()) and appeal_status = 'none'
  )
  from public.profiles
  where id = auth.uid();
$$;

-- Public profile visibility: everything as today, minus the ban columns.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, username, avatar_url, is_admin, created_at) on public.profiles to anon, authenticated;

-- Column-level updates stay locked to the profile-editable trio; ban and
-- appeal columns are written exclusively by admins (RLS + grants below).
revoke update on public.profiles from anon, authenticated;
grant update (display_name, username, avatar_url) on public.profiles to authenticated;

-- Ban management (RLS-level enforcement so even a crafted API call fails)
drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Appeals: exactly one per user. Enforced in the database.
-- ============================================================

create or replace function public.submit_appeal(p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set appeal_status = 'pending',
         appeal_text = left(p_text, 2000),
         appeal_at = now()
   where id = auth.uid()
     and ban_scope is not null
     and (ban_until is null or ban_until > now())
     and appeal_status in ('none', 'denied');
  return found;
end;
$$;

-- Users can NEVER directly update appeal columns (no grant exists) —
-- appeals go exclusively through submit_appeal(), which enforces the
-- one-appeal rule server-side. Admins write ban/appeal columns through
-- the admin API (owner role), also unreachable by users directly.

revoke execute on function public.submit_appeal(text) from anon, authenticated;
grant execute on function public.submit_appeal(text) to authenticated;

revoke execute on function public.my_ban_state() from anon;
revoke execute on function public.my_ban_state() from anon;
grant execute on function public.my_ban_state() to authenticated;

-- ============================================================
-- Admin functions for ban management.
-- Direct table writes on ban columns are NOT granted to any user role
-- (only the function owner), so all admin moderation flows through
-- these security-definer functions. The app verifies is_admin() before
-- calling them; the functions re-verify as a second lock.
-- ============================================================

create or replace function public.admin_set_ban(
  p_target uuid,
  p_scope text,
  p_until timestamptz,   -- null = permanent
  p_reason text
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

-- Full profiles list for the admin user page (ban/appeal columns included).
create or replace function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  is_admin boolean,
  created_at timestamptz,
  ban_scope text,
  ban_until timestamptz,
  ban_reason text,
  ban_at timestamptz,
  appeal_status text,
  appeal_text text,
  appeal_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, display_name, username, avatar_url, is_admin, created_at,
         ban_scope, ban_until, ban_reason, ban_at,
         appeal_status, appeal_text, appeal_at
  from public.profiles
  order by created_at desc
  limit 500;
$$;

revoke execute on function public.admin_set_ban(uuid, text, timestamptz, text) from anon, authenticated;
revoke execute on function public.admin_lift_ban(uuid, text) from anon, authenticated;
revoke execute on function public.admin_deny_appeal(uuid) from anon, authenticated;
revoke execute on function public.admin_list_users() from anon, authenticated;
grant execute on function public.admin_set_ban(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_lift_ban(uuid, text) to authenticated;
grant execute on function public.admin_deny_appeal(uuid) to authenticated;
grant execute on function public.admin_list_users() to authenticated;

-- UPDATE on ban/appeal columns is deliberately NOT granted to any user
-- role: admins write those columns only through the functions above,
-- which verify is_admin() internally as a second lock.

-- ============================================================
-- Roles: user / moderator / admin / owner + official test-account flag.
-- is_admin stays as the enforced admin bit and is kept in sync with
-- role in ('admin','owner') by the trigger below, so all existing RLS
-- keeps working. There is exactly one owner, assignable ONLY by direct
-- SQL (the app has no code path that grants or removes it).
-- ============================================================

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_test boolean not null default false;

-- Hard domain constraint on roles (blocks arbitrary values even via SQL).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('user', 'moderator', 'admin', 'owner'));
  end if;
end $$;

-- At most one owner, enforced at the index level — even direct SQL
-- cannot create a second owner row.
create unique index if not exists profiles_single_owner
  on public.profiles (role)
  where role = 'owner';

-- One-time data migration: existing admins get role='admin'.
-- (role = 'user' guard keeps this safe on re-runs — never touches owner.)
update public.profiles set role = 'admin' where is_admin = true and role = 'user';

-- Keep is_admin consistent with role on every write.
create or replace function public.sync_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_admin := (new.role in ('admin', 'owner'));
  return new;
end;
$$;

drop trigger if exists profiles_sync_is_admin on public.profiles;
create trigger profiles_sync_is_admin
  before insert or update on public.profiles
  for each row execute function public.sync_is_admin();

-- Owner protection: the owner row can never be demoted/role-changed, and
-- no second owner can ever be created (INSERT included).
create or replace function public.owner_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    raise exception 'The owner role cannot be changed or demoted';
  end if;
  if new.role = 'owner' and coalesce(old.role, '') <> 'owner' then
    if exists (select 1 from public.profiles where role = 'owner' and id <> new.id) then
      raise exception 'There can only be one owner';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_owner_guard on public.profiles;
create trigger profiles_owner_guard
  before insert or update on public.profiles
  for each row execute function public.owner_role_guard();

-- One-time data migration: existing admins get role='admin'.
-- (role = 'user' guard keeps this safe on re-runs — never touches owner.)
update public.profiles set role = 'admin' where is_admin = true and role = 'user';

-- >>> OWNER ASSIGNMENT — run once, by hand, in the SQL Editor: <<<
-- update public.profiles set role = 'owner' where id = '<your-user-uuid>';

-- Staff = owner, admin or moderator (catalog + combo moderation powers).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role in ('owner', 'admin', 'moderator') or is_admin = true)
  );
$$;

-- Owner check (the one role the app can never grant).
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- Product image uploads: staff (was admin-only).
drop policy if exists "Admins upload product images" on storage.objects;
create policy "Staff upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_staff());

drop policy if exists "Admins manage product images" on storage.objects;
drop policy if exists "Admins delete product images" on storage.objects;
create policy "Staff manage product images"
  on storage.objects for update
  using (bucket_id = 'product-images' and public.is_staff());
create policy "Staff delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_staff());

-- Public profiles expose the role + test badge (read-only).
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, username, avatar_url, is_admin, role, is_test, created_at) on public.profiles to anon, authenticated;

-- Role / test-flag management: admin-only, through functions (users have
-- no direct UPDATE grant on these columns — self-promotion stays closed).
create or replace function public.admin_set_role(p_target uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_role = 'owner' then
    raise exception 'The owner role is assigned directly in the database and cannot be granted through the app';
  end if;
  if p_role not in ('user', 'moderator', 'admin') then
    raise exception 'Invalid role';
  end if;
  if p_target = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  if exists (select 1 from public.profiles where id = p_target and role = 'owner') then
    raise exception 'The owner role cannot be changed';
  end if;
  update public.profiles set role = p_role where id = p_target;
  return found;
end;
$$;

create or replace function public.admin_set_test(p_target uuid, p_is_test boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  update public.profiles set is_test = p_is_test where id = p_target;
  return found;
end;
$$;

-- Extended member list: now includes role + is_test.
-- (drop first: the return shape changed — Postgres cannot
-- change a function's OUT row type via CREATE OR REPLACE)
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  is_admin boolean,
  role text,
  is_test boolean,
  created_at timestamptz,
  ban_scope text,
  ban_until timestamptz,
  ban_reason text,
  ban_at timestamptz,
  appeal_status text,
  appeal_text text,
  appeal_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  return query
  select p.id, p.display_name, p.username, p.avatar_url, p.is_admin, p.role, p.is_test,
         p.created_at, p.ban_scope, p.ban_until, p.ban_reason, p.ban_at,
         p.appeal_status, p.appeal_text, p.appeal_at
  from public.profiles p
  order by p.created_at desc
  limit 500;
end;
$$;

revoke execute on function public.admin_set_role(uuid, text) from anon, authenticated;
revoke execute on function public.admin_set_test(uuid, boolean) from anon, authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_test(uuid, boolean) to authenticated;

-- ============================================================
-- Anti-spam auto-moderation (posting/rating limits, warnings,
-- automatic timeouts, moderation_events log, admin popup feed).
-- Kept in its own file because it was deployed standalone:
--   >>> supabase/anti-spam.sql — run it BEFORE the comments section
--   below on fresh setups (the comment burst trigger references its
--   excluded_from_limits() and my_last_rate_limit_event()).
-- ============================================================

-- ============================================================
-- Comments on combos (roadmap #6). Mirrors supabase/comments.sql.
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

drop policy if exists "Public read live comments" on public.combo_comments;
create policy "Public read live comments"
  on public.combo_comments for select
  using (hidden = false or public.is_staff());

drop policy if exists "Users comment while not posting-banned" on public.combo_comments;
create policy "Users comment while not posting-banned"
  on public.combo_comments for insert
  with check (
    auth.uid() = author_id
    and not public.is_banned('posting')
  );

drop policy if exists "Authors update own comments" on public.combo_comments;
create policy "Authors update own comments"
  on public.combo_comments for update
  using (auth.uid() = author_id or public.is_staff())
  with check (auth.uid() = author_id or public.is_staff());

drop policy if exists "Authors or staff delete comments" on public.combo_comments;
create policy "Authors or staff delete comments"
  on public.combo_comments for delete
  using (auth.uid() = author_id or public.is_staff());

revoke update on public.combo_comments from anon, authenticated;
grant update (body, updated_at) on public.combo_comments to authenticated;

-- Burst ledger: rows survive comment deletion (no delete-and-repost farming).
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

  if public.excluded_from_limits(new.author_id) then
    return new;
  end if;

  if exists (
    select 1 from public.profiles
    where id = new.author_id
      and ban_scope in ('posting', 'both')
      and (ban_until is null or ban_until > now())
  ) then
    return null;
  end if;

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

-- Widen the anti-spam action domain to include 'comment'.
alter table public.moderation_events
  drop constraint if exists moderation_events_action_check;
alter table public.moderation_events
  add constraint moderation_events_action_check
  check (action in ('post', 'rate', 'comment'));

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

revoke execute on function public.check_comment_limit() from anon, authenticated;
revoke execute on function public.admin_set_comment_hidden(uuid, boolean) from anon, authenticated;
grant execute on function public.admin_set_comment_hidden(uuid, boolean) to authenticated;
