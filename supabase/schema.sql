-- Salty Skins Retreats CRM — schema
-- Safe to run in an existing Supabase project (e.g. the same one Safe Haven
-- CRM uses) — all tables are prefixed ssr_ so they won't collide with
-- anything already there. Run this once in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists ssr_retreats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  start_date date,
  end_date date,
  price numeric,
  capacity int,
  description text,
  status text not null default 'planning'
    check (status in ('planning','open','full','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists ssr_attendees (
  id uuid primary key default gen_random_uuid(),
  retreat_id uuid references ssr_retreats(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  arrival_airline text,
  arrival_flight_number text,
  arrival_datetime timestamptz,
  arrival_airport text,
  departure_airline text,
  departure_flight_number text,
  departure_datetime timestamptz,
  departure_airport text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','deposit','paid')),
  amount_paid numeric not null default 0,
  dietary_notes text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists ssr_expenses (
  id uuid primary key default gen_random_uuid(),
  retreat_id uuid references ssr_retreats(id) on delete set null,
  category text not null default 'other',
  description text,
  amount numeric not null default 0,
  expense_date date,
  paid_by text,
  reimbursed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists ssr_todos (
  id uuid primary key default gen_random_uuid(),
  retreat_id uuid references ssr_retreats(id) on delete cascade,
  task text not null,
  done boolean not null default false,
  due_date date,
  priority text not null default 'medium'
    check (priority in ('low','medium','high')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ssr_attendees_retreat on ssr_attendees(retreat_id);
create index if not exists idx_ssr_expenses_retreat on ssr_expenses(retreat_id);
create index if not exists idx_ssr_todos_retreat on ssr_todos(retreat_id);

-- RLS: this app is protected by an app-level passcode gate (VITE_APP_PASSCODE),
-- not Supabase Auth, so policies below allow the anon key full access to
-- these ssr_ tables only — it has no effect on Safe Haven's own tables.
-- Do not reuse the anon key for anything public-facing without adding real
-- Supabase Auth and scoping policies to authenticated users.
alter table ssr_retreats enable row level security;
alter table ssr_attendees enable row level security;
alter table ssr_expenses enable row level security;
alter table ssr_todos enable row level security;

create policy "anon full access" on ssr_retreats for all using (true) with check (true);
create policy "anon full access" on ssr_attendees for all using (true) with check (true);
create policy "anon full access" on ssr_expenses for all using (true) with check (true);
create policy "anon full access" on ssr_todos for all using (true) with check (true);

-- Leads & Subscribers — populated by the marketing site's contact form and
-- newsletter signup, via direct inserts using the anon key (see README).
create table if not exists ssr_leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists ssr_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  created_at timestamptz not null default now()
);

alter table ssr_leads enable row level security;
alter table ssr_subscribers enable row level security;

create policy "anon full access" on ssr_leads for all using (true) with check (true);
create policy "anon full access" on ssr_subscribers for all using (true) with check (true);

-- Applications — populated by the marketing site's retreat application
-- form, via a direct insert using the anon key (see README).
create table if not exists ssr_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  date_of_birth date,
  instagram text,
  retreat text not null,
  room_preference text,
  experience_level text,
  dietary text,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  referral_source text,
  notes text,
  primary_motivation text,
  experience_goals text,
  alcohol_plans text,
  culture_acknowledged boolean not null default false,
  waiver_acknowledged boolean not null default false,
  status text not null default 'new'
    check (status in ('new','contacted','confirmed','declined')),
  created_at timestamptz not null default now()
);

alter table ssr_applications enable row level security;

create policy "anon full access" on ssr_applications for all using (true) with check (true);

-- Private client booking requests — populated by the marketing site's
-- "Private Clients" page, via a direct insert using the anon key (see
-- README). These are requests, not confirmed bookings — Marci follows up
-- by email/text to lock in the actual session.
create table if not exists ssr_private_bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  preferred_date date,
  preferred_time text,
  message text,
  status text not null default 'new'
    check (status in ('new','contacted','confirmed','declined')),
  created_at timestamptz not null default now()
);

alter table ssr_private_bookings enable row level security;

create policy "anon full access" on ssr_private_bookings for all using (true) with check (true);
