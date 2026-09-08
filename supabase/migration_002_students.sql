-- ============================================================
-- Migration: Students Directory (run only if you already applied
-- the original supabase/schema.sql before this feature existed)
--
-- Safe to run once. If you're setting up a brand-new Supabase
-- project, skip this file and just run schema.sql — it already
-- includes everything below.
-- ============================================================

insert into counters (name, current_value) values ('student_no', 0) on conflict (name) do nothing;

create or replace function next_student_no()
returns varchar language plpgsql as $$
declare v int;
begin
  update counters set current_value = current_value + 1
    where name = 'student_no' returning current_value into v;
  return 'STU-' || lpad(v::text, 4, '0');
end; $$;

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
  status       varchar not null default 'active',
  qr_data      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

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

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_students_touch on students;
create trigger trg_students_touch before update on students
  for each row execute function touch_updated_at();

alter table students enable row level security;
drop policy if exists "authenticated all students" on students;
create policy "authenticated all students" on students for all using (auth.role() = 'authenticated');

-- ---- student_attendance: add the FK link + IN/OUT timestamps ----
alter table student_attendance add column if not exists student_id uuid references students(id) on delete cascade;
alter table student_attendance add column if not exists check_in_time timestamptz;
alter table student_attendance add column if not exists check_out_time timestamptz;

-- Backfill check_in_time from the old time_in column if it still exists.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'student_attendance' and column_name = 'time_in') then
    update student_attendance set check_in_time = time_in where check_in_time is null;
    alter table student_attendance drop column time_in;
  end if;
end $$;

drop index if exists student_attendance_event_id_student_name_course_key;
create unique index if not exists ux_student_attendance_by_student
  on student_attendance (event_id, student_id) where student_id is not null;
create unique index if not exists ux_student_attendance_by_name
  on student_attendance (event_id, student_name, course) where student_id is null;

-- ---- fines: allow attaching to a student instead of only an officer ----
alter table fines alter column person_id drop not null;
alter table fines add column if not exists student_id uuid references students(id) on delete cascade;
alter table fines drop constraint if exists fines_exactly_one_subject;
alter table fines add constraint fines_exactly_one_subject check (
  (person_id is not null)::int + (student_id is not null)::int = 1
);

-- ---- audit logs: admin-gated purge ----
create or replace function is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from people where auth_id = auth.uid() and type = 'admin' and is_active = true
  );
$$;

drop policy if exists "admin purge audit_logs" on audit_logs;
create policy "admin purge audit_logs" on audit_logs for delete using (is_admin());
