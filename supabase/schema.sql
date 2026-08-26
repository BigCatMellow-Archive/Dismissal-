-- Production schema proposal for the Dismissal app.
-- Do not deploy with real school records until authentication, RLS policies,
-- retention rules, and school privacy requirements have been reviewed.

create extension if not exists pgcrypto;

create type public.staff_role as enum ('scanner', 'runner', 'dispatcher', 'admin');
create type public.dismissal_status as enum (
  'CALLED',
  'CLAIMED',
  'ON_WAY',
  'CANT_FIND',
  'CALL_AGAIN',
  'AT_PICKUP',
  'COMPLETE'
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.staff_role not null default 'runner',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  external_student_id text unique,
  display_name text not null,
  grade text,
  homeroom text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pickup_groups (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  barcode_token text not null unique,
  group_type text not null default 'family',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pickup_group_students (
  pickup_group_id uuid not null references public.pickup_groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  active boolean not null default true,
  primary key (pickup_group_id, student_id)
);

create table public.dismissal_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null default current_date,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references auth.users(id),
  unique(session_date)
);

create table public.dismissals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dismissal_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id),
  pickup_group_id uuid not null references public.pickup_groups(id),
  status public.dismissal_status not null default 'CALLED',
  scanned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id),
  completed_at timestamptz
);

-- Prevent the same student from having two simultaneous active calls in one session.
create unique index one_open_dismissal_per_student
  on public.dismissals(session_id, student_id)
  where status <> 'COMPLETE';

create table public.dismissal_events (
  id bigint generated always as identity primary key,
  dismissal_id uuid not null references public.dismissals(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id),
  event_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index dismissals_session_status_idx on public.dismissals(session_id, status, scanned_at);
create index dismissal_events_dismissal_idx on public.dismissal_events(dismissal_id, event_at);
create index pickup_group_barcode_idx on public.pickup_groups(barcode_token) where active = true;

alter table public.staff_profiles enable row level security;
alter table public.students enable row level security;
alter table public.pickup_groups enable row level security;
alter table public.pickup_group_students enable row level security;
alter table public.dismissal_sessions enable row level security;
alter table public.dismissals enable row level security;
alter table public.dismissal_events enable row level security;

-- Intentionally no permissive RLS policies are included here.
-- Before production, define policies around authenticated staff and role-specific
-- access instead of making student or dismissal tables readable by anonymous users.

-- Supabase Realtime should eventually publish only the tables needed by the live UI,
-- normally dismissals and dismissal_events. Keep roster/admin tables out of Realtime
-- unless there is a specific operational need.
