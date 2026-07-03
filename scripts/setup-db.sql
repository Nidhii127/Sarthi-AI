-- scripts/setup-db.sql
-- Run this ONCE in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- before starting the app.
--
-- Creates the `profiles` table for storing seller name linked to their auth.users row.
-- Also sets up Row Level Security so each seller can only access their own profile.

-- ─────────────────────────────────────────────
-- 1. Profiles table
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users not null primary key,
  full_name   text,
  email       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- 2. Row Level Security
-- ─────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Each seller can only read their own profile
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Each seller can insert their own profile (called after OTP verification)
create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- Each seller can update their own profile
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- ─────────────────────────────────────────────
-- 3. Optional: auto-update `updated_at` on changes
-- ─────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- ─────────────────────────────────────────────
-- 4. Listings table (Phase 8)
-- ─────────────────────────────────────────────
create table if not exists public.listings (
  id                  uuid primary key default gen_random_uuid(),
  seller_id           uuid references auth.users not null,
  category            text not null,
  sub_category        text,
  title               text not null,
  description         text,
  attributes          jsonb,
  size_chart          jsonb,
  variants            jsonb,
  pricing_inputs      jsonb,
  title_seo_keywords  text[],
  source_log          jsonb,
  confidence_flags    jsonb,
  status              text default 'live',
  created_at          timestamptz default now()
);

-- Row Level Security
alter table public.listings enable row level security;

-- Each seller can only read/write their own listings
create policy "Sellers can view own listings"
  on public.listings
  for select
  using (auth.uid() = seller_id);

create policy "Sellers can insert own listings"
  on public.listings
  for insert
  with check (auth.uid() = seller_id);

create policy "Sellers can update own listings"
  on public.listings
  for update
  using (auth.uid() = seller_id);

create policy "Sellers can delete own listings"
  on public.listings
  for delete
  using (auth.uid() = seller_id);
