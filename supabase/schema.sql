-- ============================================================
-- SSG CENTRAL — Database Schema (Supabase / PostgreSQL)
-- Integrated Financial and Attendance Management with
-- Real-Time Oversight and Monitoring
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PEOPLE (Officers / Users)
-- ------------------------------------------------------------
create table if not exists people (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid references auth.users(id) on delete set null,
  officers_id   varchar unique not null,
  first_name    varchar not null,
  last_name     varchar not null,
  full_name     varchar generated always as (first_name || ' ' || last_name) stored,
  email         varchar,
  phone         varchar,
  position      varchar,
  type          varchar not null default 'officer', -- 'admin' | 'officer'
  permissions   jsonb not null default '{}',
  is_active     boolean not null default true,
  qr_data       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. COUNTERS (for auto-generated officers_id: SSG-XXXX, student_no: STU-XXXX)
-- ------------------------------------------------------------
create table if not exists counters (
  id             uuid primary key default gen_random_uuid(),
  name           varchar unique not null,
  current_value  integer not null default 0,
  created_at     timestamptz not null default now()
);
insert into counters (name, current_value)
  values ('officers_id', 0), ('student_no', 0) on conflict (name) do nothing;

create or replace function next_officers_id()
returns varchar language plpgsql as $$
declare v int;
begin
  update counters set current_value = current_value + 1
    where name = 'officers_id' returning current_value into v;
  return 'SSG-' || lpad(v::text, 4, '0');
end; $$;

create or replace function next_student_no()
returns varchar language plpgsql as $$
declare v int;
begin
  update counters set current_value = current_value + 1
    where name = 'student_no' returning current_value into v;
  return 'STU-' || lpad(v::text, 4, '0');
end; $$;

-- Generates N sequential student numbers at once — used by Bulk Import
-- so a batch upload doesn't need one round trip per row.
create or replace function next_student_no_batch(n int)
returns setof varchar language plpgsql as $$
declare
  i int;
  v int;
begin
  for i in 1..n loop
    update counters set current_value = current_value + 1
      where name = 'student_no' returning current_value into v;
    return next ('STU-' || lpad(v::text, 4, '0'));
  end loop;
  return;
end; $$;

-- ------------------------------------------------------------
-- 2b. STUDENTS (directory — distinct from Users & Officers)
-- ------------------------------------------------------------
create table if not exists students (
  id           uuid primary key default gen_random_uuid(),
  student_no   varchar unique not null,
  first_name   varchar not null,
  last_name    varchar not null,
  full_name    varchar generated always as (first_name || ' ' || last_name) stored,
  email        varchar,
  phone        varchar,
  course       varchar not null,
  year_level   integer not null default 1,
  status       varchar not null default 'active', -- active|inactive|graduated
  qr_data      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Promotes every active student a year level; anyone already at or past
-- max_year graduates instead of rolling over. Called once per school year.
create or replace function rollover_students_year(max_year int default 4)
returns table(promoted int, graduated int) language plpgsql as $$
declare
  v_graduated int;
  v_promoted int;
begin
  update students set status = 'graduated', updated_at = now()
    where status = 'active' and year_level >= max_year;
  get diagnostics v_graduated = row_count;

  update students set year_level = year_level + 1, updated_at = now()
    where status = 'active';
  get diagnostics v_promoted = row_count;

  return query select v_promoted, v_graduated;
end; $$;

create index if not exists ix_students_course on students(course);
create index if not exists ix_students_year_level on students(year_level);
create index if not exists ix_students_status on students(status);

-- ------------------------------------------------------------
-- 3. EVENTS
-- ------------------------------------------------------------
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  title       varchar not null,
  type        varchar,
  date        date not null,
  location    varchar,
  description text,
  status      varchar not null default 'upcoming', -- upcoming|ongoing|completed|cancelled
  created_by  uuid references people(id),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. ATTENDANCE (Officers)
-- ------------------------------------------------------------
create table if not exists attendance (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  person_id       uuid not null references people(id) on delete cascade,
  status          varchar not null default 'present', -- present|absent
  method          varchar, -- qr_code|manual
  check_in_time   timestamptz,
  check_out_time  timestamptz,
  created_at      timestamptz not null default now(),
  unique (event_id, person_id)
);

-- ------------------------------------------------------------
-- 5. STUDENT ATTENDANCE (linked to the students directory; falls back
--    to a freeform name/course snapshot if a student isn't on file yet)
-- ------------------------------------------------------------
create table if not exists student_attendance (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  student_id      uuid references students(id) on delete cascade,
  student_name    text not null,
  course          text not null,
  status          text not null default 'present', -- present|absent
  check_in_time   timestamptz,
  check_out_time  timestamptz,
  method          text not null default 'qr_scan', -- qr_scan|manual
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One attendance row per student per event when the student is on file;
-- falls back to name+course matching for walk-ins without a directory record.
create unique index if not exists ux_student_attendance_by_student
  on student_attendance (event_id, student_id) where student_id is not null;
create unique index if not exists ux_student_attendance_by_name
  on student_attendance (event_id, student_name, course) where student_id is null;

-- ------------------------------------------------------------
-- 6. FINE SETTINGS (configurable fine rules)
-- ------------------------------------------------------------
create table if not exists fine_settings (
  id          uuid primary key default gen_random_uuid(),
  fine_type   varchar not null,
  amount      decimal(10,2) not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. FINES
-- ------------------------------------------------------------
create table if not exists fines (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid references people(id) on delete cascade,
  student_id  uuid references students(id) on delete cascade,
  event_id    uuid references events(id) on delete set null,
  reason      text not null,
  amount      decimal(10,2) not null,
  status      varchar not null default 'unpaid', -- unpaid|partial|paid
  due_date    date,
  created_at  timestamptz not null default now(),
  constraint fines_exactly_one_subject check (
    (person_id is not null)::int + (student_id is not null)::int = 1
  )
);

-- ------------------------------------------------------------
-- 8. FINE PAYMENTS
-- ------------------------------------------------------------
create table if not exists fine_payments (
  id              uuid primary key default gen_random_uuid(),
  fine_id         uuid not null references fines(id) on delete cascade,
  amount          decimal(10,2) not null,
  payment_date    date not null default current_date,
  payment_method  varchar default 'cash',
  received_by     uuid references people(id),
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 9. AUDIT LOGS
-- ------------------------------------------------------------
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references people(id),
  action      varchar not null, -- create|update|delete|login
  entity_type varchar,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------

-- keep updated_at fresh
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_people_touch on people;
create trigger trg_people_touch before update on people
  for each row execute function touch_updated_at();

drop trigger if exists trg_student_attendance_touch on student_attendance;
create trigger trg_student_attendance_touch before update on student_attendance
  for each row execute function touch_updated_at();

drop trigger if exists trg_students_touch on students;
create trigger trg_students_touch before update on students
  for each row execute function touch_updated_at();

-- recompute fine status whenever a payment is made
create or replace function recompute_fine_status()
returns trigger language plpgsql as $$
declare
  total_paid decimal(10,2);
  fine_amount decimal(10,2);
begin
  select coalesce(sum(amount), 0) into total_paid
    from fine_payments where fine_id = new.fine_id;
  select amount into fine_amount from fines where id = new.fine_id;

  update fines set status = case
      when total_paid >= fine_amount then 'paid'
      when total_paid > 0 then 'partial'
      else 'unpaid'
    end
    where id = new.fine_id;
  return new;
end; $$;

drop trigger if exists trg_fine_payment_status on fine_payments;
create trigger trg_fine_payment_status after insert or update on fine_payments
  for each row execute function recompute_fine_status();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table people enable row level security;
alter table students enable row level security;
alter table events enable row level security;
alter table attendance enable row level security;
alter table student_attendance enable row level security;
alter table fine_settings enable row level security;
alter table fines enable row level security;
alter table fine_payments enable row level security;
alter table audit_logs enable row level security;
alter table counters enable row level security;

-- Any authenticated SSG officer/admin can read & write.
-- Tighten these per-role once your admin/officer permission model is finalized.
create policy "authenticated read people" on people for select using (auth.role() = 'authenticated');
create policy "authenticated write people" on people for all using (auth.role() = 'authenticated');

create policy "authenticated all students" on students for all using (auth.role() = 'authenticated');
create policy "authenticated all events" on events for all using (auth.role() = 'authenticated');
create policy "authenticated all attendance" on attendance for all using (auth.role() = 'authenticated');
create policy "authenticated all student_attendance" on student_attendance for all using (auth.role() = 'authenticated');
create policy "authenticated all fine_settings" on fine_settings for all using (auth.role() = 'authenticated');
create policy "authenticated all fines" on fines for all using (auth.role() = 'authenticated');
create policy "authenticated all fine_payments" on fine_payments for all using (auth.role() = 'authenticated');
create policy "authenticated read audit_logs" on audit_logs for select using (auth.role() = 'authenticated');
create policy "authenticated insert audit_logs" on audit_logs for insert with check (auth.role() = 'authenticated');
create policy "authenticated all counters" on counters for all using (auth.role() = 'authenticated');

-- Returns true if the signed-in user is an active admin. Used to gate the
-- Audit Logs "Purge 30d+" action to admins only.
create or replace function is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from people where auth_id = auth.uid() and type = 'admin' and is_active = true
  );
$$;

create policy "admin purge audit_logs" on audit_logs for delete using (is_admin());
