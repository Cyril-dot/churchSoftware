# Church Bookshop — Serverless Revamp

A complete rebuild of the church bookshop ledger as a **purely serverless** app:
**Next.js 16** (App Router) + **Neon Postgres**, deployed on **Vercel**.

## Demo mode (no database needed)

Open the homepage — if `DATABASE_URL` is **not** set, the app runs in **demo mode**
with 16 sample products, 14 days of sales history, and one-click logins:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@church.org` | `password123` |
| Manager | `manager@church.org` | `password123` |
| Cashier | `cashier@church.org` | `password123` |

Demo mode covers: dashboard, POS checkout, sales list, inventory browsing, and reports.
Actions that need a real database (user admin, purchases, settings) show a friendly
"connect Neon" notice. Set `DATABASE_URL` to switch to production mode automatically.

## Quick start (production)

### 1. Database (Neon)

1. Create a free account at [neon.tech](https://neon.tech) and create a project.
2. In Vercel: **Storage → Connect → Neon** (auto-sets `DATABASE_URL` + `DATABASE_URL_UNPOOLED`),
   or copy the pooled connection string manually.

### 2. Environment variables (Vercel → Settings → Environment Variables)

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Neon **pooled** string (auto-set by the integration) |
| `DATABASE_URL_UNPOOLED` | Neon **direct** string — migrations only (auto-set) |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `SETUP_TOKEN` | Random string for first-admin setup (rotate after) |
| `APP_URL` | e.g. `https://bookshop.yourchurch.org` |

### 3. Migrate + seed

```bash
npm install
npm run db:migrate   # runs db/migrations in order
npm run db:seed      # demo data (optional)
```

`vercel-build` runs migrations automatically on every deploy.

### 4. First admin

Visit `/setup`, enter your `SETUP_TOKEN`, create the admin account.
**Rotate/remove `SETUP_TOKEN` afterwards.**

### 5. Demo logins (after `db:seed`, password `password123`)

- `admin@church.org` — full access
- `manager@church.org` — inventory, purchases, reports
- `cashier@church.org` — POS only

## Architecture

```
Browser ──► Vercel (Next.js: UI + /api/v1 route handlers) ──► Neon Postgres
              httpOnly cookie session      @neondatabase/serverless (HTTP)
```

- **Money-critical logic in Postgres functions** (`record_sale`, `void_sale`,
  `receive_purchase`, `adjust_stock`) — atomic, race-free, single HTTP call.
- **Auth:** httpOnly cookie + JWT (`jose`), scrypt passwords (legacy hashes still verify),
  per-request active/session_version check, DB-backed login rate limiting.
- **UI:** parchment/wine/gold design system, Material Symbols icons, Motion animations,
  responsive (sidebar → icon rail → bottom nav), WCAG AA contrast.

## Project layout

```
app/
  (auth)/login, (auth)/setup      # public
  (app)/dashboard, sell, sales,   # authenticated app shell
        inventory, purchases,
        reports, users, settings
  api/v1/...                      # serverless route handlers
components/  lib/  db/migrations/ scripts/
```

## Scripts

| Command | What |
|---------|------|
| `npm run dev` | Local dev server |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Demo data |
| `npm run build` | Production build |
