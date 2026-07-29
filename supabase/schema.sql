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
