-- ============================================================
-- HanziNA — Supabase Database Schema
-- Run this in your Supabase Project -> SQL Editor
-- ============================================================

-- 1. PROFILES TABLE (Linked to Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) on profiles
alter table public.profiles enable row level security;

-- Policies for profiles: allow public lookup for username signin, allow user to manage profile
drop policy if exists "Allow public read of profiles" on public.profiles;
create policy "Allow public read of profiles" on public.profiles
  for select using (true);

drop policy if exists "Allow insert of own profile" on public.profiles;
create policy "Allow insert of own profile" on public.profiles
  for insert with check (auth.uid() = id or auth.uid() is null);

drop policy if exists "Allow update of own profile" on public.profiles;
create policy "Allow update of own profile" on public.profiles
  for update using (auth.uid() = id);

-- Case-insensitive index for fast username login lookup
create index if not exists idx_profiles_username_lower
  on public.profiles (lower(username));

-- Trigger: Automatically create or update profile upon user registration in Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(nullif(excluded.username, ''), public.profiles.username),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. READING SESSIONS TABLE
create table if not exists public.reading_sessions (
  id text primary key,
  user_id uuid references auth.users on delete cascade,
  title text not null,
  text text not null,
  mapping text not null,
  char_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) on reading_sessions
alter table public.reading_sessions enable row level security;

-- Policies for reading_sessions
drop policy if exists "Allow public read" on public.reading_sessions;
create policy "Allow public read" on public.reading_sessions
  for select using (true);

drop policy if exists "Allow public insert" on public.reading_sessions;
create policy "Allow public insert" on public.reading_sessions
  for insert with check (true);

drop policy if exists "Allow public update" on public.reading_sessions;
create policy "Allow public update" on public.reading_sessions
  for update using (true);

drop policy if exists "Allow public delete" on public.reading_sessions;
create policy "Allow public delete" on public.reading_sessions
  for delete using (true);

-- Index for fast ordering by creation timestamp
create index if not exists idx_reading_sessions_created_at
  on public.reading_sessions (created_at desc);
