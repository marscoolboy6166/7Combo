-- ============================================================
-- 7Combo — database schema
-- Run this in the Supabase SQL Editor (or `supabase db push`).
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE
-- / ON CONFLICT guards where the syntax allows it.
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
begin
  -- Derive a username from the Google display name (letters/digits only);
  -- fall back to a short id-based handle if the name has no alphanumerics.
  base_username := left(
    coalesce(
      nullif(
        regexp_replace(
          lower(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')),
          '[^a-z0-9]+', '', 'g'
        ),
        ''
      ),
      'user-' || left(new.id::text, 8)
    ),
    24
  );

  insert into public.profiles (id, display_name, avatar_url, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Snacker'),
    new.raw_user_meta_data ->> 'avatar_url',
    base_username
  )
  on conflict (id) do nothing;
  return new;
exception
  when unique_violation then
    -- Username already taken: append a short id suffix and retry once.
    insert into public.profiles (id, display_name, avatar_url, username)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Snacker'),
      new.raw_user_meta_data ->> 'avatar_url',
      left(base_username, 19) || '-' || left(new.id::text, 4)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
