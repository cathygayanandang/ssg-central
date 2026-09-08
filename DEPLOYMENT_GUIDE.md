# Deploying SSG Central — Supabase + Vercel

This walks you through taking the `ssg-central` project from your machine
to a live, working URL: a Supabase backend (database + auth) and a Vercel
frontend deployment.

Total time: ~20–30 minutes the first time.

---

## Part 1 — Set up Supabase (your backend)

### 1. Create the project
1. Go to [supabase.com](https://supabase.com) and sign in (GitHub login is easiest).
2. Click **New Project**.
3. Pick your organization, give it a name (e.g. `ssg-central`), set a
   strong **database password** — save this somewhere, you won't need it
   day-to-day but you will if you ever connect a DB client directly.
4. Choose the region closest to your users (e.g. Southeast Asia /
   Singapore for the Philippines) and click **Create new project**.
5. Wait ~2 minutes while Supabase provisions the database.

### 2. Run the schema
1. In your project's left sidebar, open **SQL Editor**.
2. Click **New query**.
3. Open `supabase/schema.sql` from the project folder, copy its entire
   contents, and paste it into the editor.
4. Click **Run**. You should see "Success. No rows returned."
5. Confirm the tables exist: go to **Table Editor** in the sidebar — you
   should see `people`, `counters`, `events`, `attendance`,
   `student_attendance`, `fine_settings`, `fines`, `fine_payments`, and
   `audit_logs`.

If you ever need to reset and re-run the schema, note that `create table
if not exists` won't overwrite existing tables — drop them first
(`drop table people cascade;` etc.) if you want a clean slate.

**Already deployed before the Students Directory module existed?** Don't
re-run `schema.sql` — instead run `supabase/migration_002_students.sql`
once. It adds the `students` table, the `student_no` counter, the
year-rollover function, and the new `fines`/`student_attendance` columns
without touching any data you already have.

### 3. Grab your API credentials
1. Go to **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** (looks like `https://xxxxx.supabase.co`).
3. Copy the **anon / public** key (a long string starting with `eyJ...`).
   You'll paste both into your `.env` file and, later, into Vercel.

Keep the **service_role** key private — you won't need it for this app;
the frontend only ever uses the anon key, which respects your RLS
policies.

### 4. Create your first admin account
The app needs at least one real login before it's usable.

1. In Supabase, go to **Authentication → Users → Add user → Create new user**.
2. Enter an email and password for yourself. Leave "Auto Confirm User"
   checked so you don't need to click an email link.
3. Copy the new user's **UID** (shown in the users table).
4. Go to **Table Editor → people → Insert row**, and fill in:
   - `auth_id` → paste the UID you copied
   - `officers_id` → e.g. `SSG-0001`
   - `first_name`, `last_name`
   - `type` → `admin`
   - `is_active` → `true`
   - leave the rest as defaults
5. Save the row.

You now have one admin who can log into the app and see every module,
including the admin-only Fine Settings and Audit Logs pages.

---

## Part 2 — Push the project to GitHub

Vercel deploys straight from a Git repository, so the project needs to
live on GitHub (or GitLab/Bitbucket) first.

1. Create a new empty repository on GitHub (don't initialize it with a
   README — you already have one).
2. From inside the `ssg-central` folder on your computer:
   ```bash
   cd ssg-central
   git init
   git add .
   git commit -m "Initial commit — SSG Central"
   git branch -M main
   git remote add origin https://github.com/<your-username>/ssg-central.git
   git push -u origin main
   ```
   (`.env` is already excluded via `.gitignore` — your Supabase keys never
   get pushed to GitHub. Environment variables live in Vercel instead, see
   below.)

---

## Part 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New… → Project**.
3. Select your `ssg-central` repository from the list (click **Import**).
4. Vercel auto-detects it as a Vite project. Leave the defaults:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build` (auto-filled)
   - **Output Directory:** `dist` (auto-filled)
5. Expand **Environment Variables** and add exactly these two:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL from Supabase |
   | `VITE_SUPABASE_ANON_KEY` | your anon/public key from Supabase |

   Make sure they're spelled exactly like that — Vite only exposes env
   vars to the browser if they're prefixed with `VITE_`.
6. Click **Deploy**. Vercel builds and deploys — first build usually
   takes 1–2 minutes.
7. When it finishes, click the preview thumbnail (or **Visit**) to open
   your live URL — something like `ssg-central.vercel.app`.

### Verify it works
- Open the live URL, log in with the admin account you created in
  Supabase.
- You should land on the Dashboard with all-zero stats (expected — no
  data yet).
- Try adding an Officer from the Officers page; if it saves and appears
  in the table, your frontend and Supabase are talking to each other
  correctly.
- On your phone, open the same URL over the live HTTPS domain (not
  `localhost`) and try the Attendance page's **Start Scanner** button —
  camera access for QR scanning only works over HTTPS or `localhost`,
  which Vercel gives you automatically.

---

## Part 4 — Everyday updates

Once this is wired up, shipping a change is just:
```bash
git add .
git commit -m "describe your change"
git push
```
Vercel automatically rebuilds and redeploys on every push to `main` — no
manual redeploy step needed. If you open a pull request instead, Vercel
also builds a separate preview URL for that branch so you can test before
merging.

---

## Troubleshooting

**Blank page / console error about `supabaseUrl` or `supabaseAnonKey`**
→ The environment variables are missing or misspelled in Vercel. Go to
**Project Settings → Environment Variables**, fix them, then trigger a
redeploy (**Deployments → ⋯ → Redeploy**) — env var changes don't apply
retroactively to old deployments.

**Login works but the Dashboard shows nothing / "permission denied" errors**
→ Check that your `people` row's `auth_id` exactly matches the
`Authentication → Users` UID. A mismatch means the app can't find your
profile, so `isAdmin` and RLS-authenticated writes behave unexpectedly.

**"new row violates row-level security policy"**
→ You're not signed in (session expired) or the schema's RLS policies
weren't created. Re-run `supabase/schema.sql` and confirm the policies
appear under **Authentication → Policies** for each table.

**QR scanner won't open the camera**
→ Confirm you're on the `https://` Vercel URL, not `http://` or a raw IP.
Browsers block camera access on insecure origins except `localhost`.

**Icons missing / manifest errors in browser console**
→ The project already ships `public/icon-192.png`, `icon-512.png`, and
`favicon.svg` — if you replace them with your own branding later, keep
the same filenames or update `vite.config.js`'s `manifest.icons` to match.

---

## Optional — Custom domain

If your SSG has a domain (e.g. `ssgcentral.smit.edu.ph`):
1. In Vercel, go to your project → **Settings → Domains → Add**.
2. Enter the domain and follow Vercel's instructions to add a `CNAME` (or
   `A`) record with your domain registrar.
3. Vercel issues a free SSL certificate automatically once the DNS
   propagates (usually within an hour).
