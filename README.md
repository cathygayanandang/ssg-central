# SSG Central

Integrated Financial and Attendance Management with Real-Time Oversight and
Monitoring — built for the Supreme Student Government of Southern Mindanao
Institute of Technology, Inc. (SMIT).

Theme: cream, navy blue, and gray — clean, professional, user-friendly.

## Stack
- React 19 + Vite 7
- Supabase (PostgreSQL + Row Level Security + Auth)
- Bootstrap 5 + Bootstrap Icons
- `html5-qrcode` for scanning, `qrcode.react` for badge generation
- `papaparse` + `xlsx` for CSV/Excel bulk student import
- Chart.js for dashboard analytics
- `vite-plugin-pwa` so the attendance scanner installs on officers' phones

## Modules
- **Dashboard** — live stats (users & officers, students, events, fines),
  attendance-by-event bar chart, overall attendance doughnut chart, Quick
  Actions, Recent Events, Recent Student Attendance.
- **Officers** (Users & Officers) — roster CRUD, auto-generated `SSG-XXXX`
  IDs, QR badge generation/preview, active/inactive toggling, admin/officer
  roles.
- **Students Directory** — student roster separate from Users & Officers,
  auto-generated `STU-XXXX` IDs, List/Grouped-by-course views, search +
  course/year filters, Student Details (attendance + fine history), QR
  badges, and **Year Rollover** (promotes active students a year level,
  marks final-year students graduated).
- **Bulk Import Students** — upload a `.csv` or `.xlsx` file
  (`first_name`, `last_name`, `course` required; `year_level`, `email`,
  `phone` optional) with row-by-row validation before importing.
- **Events** — CRUD with status (upcoming/ongoing/completed/cancelled).
- **Attendance** — per-event officer check-in via camera QR scan or manual
  select; upserts to prevent duplicates.
- **Student Attendance** — event overview → per-event Scan page (QR or
  manual, with IN/OUT toggling against the Students Directory so a second
  scan of the same student updates their record instead of duplicating
  it) → Records page (search/filter, Attendance by Course, CSV export).
- **Fines & Payments** — issue a fine against either a **Student**
  (filterable by course) or an **Officer**, record partial/full payments;
  fine status (`unpaid` → `partial` → `paid`) recomputes automatically via
  a database trigger.
- **Fine Settings** (admin) — configurable standard fine amounts.
- **Audit Logs** (admin) — read-only trail of create/update/delete/login
  actions.

## Setup

1. **Create a Supabase project**, then run `supabase/schema.sql` in the SQL
   editor. It creates all tables (including `students`), the
   `officers_id`/`student_no` counter functions, the fine-status trigger,
   the year-rollover function, and baseline RLS policies.
   - Already have an older deployment from before the Students Directory
     existed? Run `supabase/migration_002_students.sql` instead — it adds
     the `students` table and the new `fines`/`student_attendance` columns
     without touching your existing data.
2. **Copy environment variables**:
   ```bash
   cp .env.example .env
   ```
   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your
   Supabase project settings.
3. **Install & run**:
   ```bash
   npm install
   npm run dev
   ```
4. **Create your first admin account** in Supabase Auth (Authentication →
   Users → Add user), then insert a matching row into `people` with that
   user's `auth_id` and `type = 'admin'` so they can sign in and see the
   Fine Settings / Audit Logs pages.

## Deploying
The project is set up for **Vercel**: `npm run build` outputs a static
`dist/` bundle. Add the two `VITE_SUPABASE_*` env vars in the Vercel
project settings before deploying.

## Notes on QR formats
- **Officer badges** encode `SSGC|OFFICER|<officers_id>|<full_name>` —
  generated automatically when an officer is added, viewable/printable from
  the Officers page.
- **Student badges** (generated from the Students Directory) encode
  `SSGC|STUDENT|<student_no>|<full_name>` — scanning one resolves directly
  to the student's directory record.
- **School-issued or unrecognized QR codes** fall back to a
  `<name>|<course>` payload, or treat the whole scanned string as the
  student's name; the scan page also tries to match the decoded name
  against the Students Directory so attendance still links to the right
  record. Anything that doesn't match can be corrected via manual entry.

## Extending
- Row Level Security currently allows any authenticated user to read/write
  most tables. Once your admin/officer permission matrix is finalized,
  tighten these policies (e.g. restrict fine issuance and fine settings to
  `type = 'admin'` using a `people` lookup in the policy's `USING` clause).
- Add password-reset / officer self-registration flows via Supabase Auth
  as needed — the schema already links `people.auth_id → auth.users.id`.
