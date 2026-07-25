# Salty Skins CRM

Retreat operations tool: retreats, attendees (with flight details), expenses, and to-dos.
Same stack/pattern as SafeHavenCRM — Vite + React (single `App.jsx`), Supabase for data, deployed to Vercel via `push.py`.

## 1. Reuse the existing Supabase project (no new project needed)

A Supabase project is just a Postgres database + API — it can hold tables for as many apps as you want, so this reuses the same project Safe Haven CRM already runs on rather than creating a new one.

1. Open that project → **SQL Editor** and run the contents of `supabase/schema.sql`. Every table is prefixed `ssr_` (`ssr_retreats`, `ssr_attendees`, `ssr_expenses`, `ssr_todos`), so there's no chance of colliding with Safe Haven's own tables, and its RLS policies are untouched.
2. Go to **Project Settings → API** and copy the same values Safe Haven CRM uses:
   - Project URL
   - `anon` `public` key

(If you ever do want it fully isolated later, spin up a separate Supabase project and rerun the same schema there — the app doesn't care which project it points at, just which URL/key are in the env vars.)

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the three values:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_APP_PASSCODE=...
```

`VITE_APP_PASSCODE` is a lightweight click-through gate for the whole app (not real auth — see the security note below). Leave it blank to disable the gate.

## 3. Run it locally

```bash
npm install
npm run dev
```

## 4. Set up Vercel

```bash
npm i -g vercel      # once, if you don't have it
vercel login         # once
vercel link          # links this folder to a Vercel project
```

In the Vercel dashboard → your project → **Settings → Environment Variables**, add the same three vars from `.env` (Production + Preview). Vercel doesn't read your local `.env` file.

## 5. Point a subdomain at it

In Vercel → your project → **Settings → Domains**, add `crm.ssyogaretreats.com` (or whatever subdomain you want). Vercel will show you a DNS record to add — typically a `CNAME` record:

```
crm   CNAME   cname.vercel-dns.com.
```

Add that record wherever `ssyogaretreats.com`'s DNS is managed (Hostinger, GoDaddy, Cloudflare, etc. — wherever the domain's nameservers point). Propagation is usually a few minutes to an hour.

If `PROJECT_DOMAIN` at the top of `push.py` doesn't match the subdomain you chose, update it — it's only used for the closing message, not functionality.

## 6. Deploy

```bash
python3 push.py "Initial deploy"
```

This installs deps, builds, commits, pushes to git, then runs `vercel --prod`. Flags:

- `python3 push.py "message" --skip-deploy` — commit/push only
- `python3 push.py --deploy-only` — deploy only, no git step

## Data model

- **retreats** — name, location, dates, price, capacity, status, description
- **attendees** — linked to a retreat; contact info, arrival/departure flight details, payment status/amount, dietary notes
- **expenses** — optionally linked to a retreat (blank = general/overhead); category, amount, paid-by, reimbursed flag
- **todos** — optionally linked to a retreat; task, due date, priority, done flag

The "Viewing" dropdown in the header filters attendees/expenses/todos to one retreat, or shows everything across all retreats.

## Security note

This uses a client-side passcode (`VITE_APP_PASSCODE`) plus permissive Supabase Row Level Security policies on the `anon` key — the same lightweight model as SafeHavenCRM. That's fine for a small internal tool, but the passcode is visible in the built JS bundle and the anon key can read/write all rows directly if someone has both. If this ever needs to be shared beyond the two of you, swap in real Supabase Auth (email/password or magic link) and scope RLS policies to authenticated users instead of `true`.
