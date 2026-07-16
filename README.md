# QueueWise

A live token/queue management system for walk-in businesses (clinics, salons, service
counters, etc). Patients get a token by email, watch the live queue from anywhere, and only
walk in when their number is close. Vendors get a one-screen panel to call the next number,
skip no-shows, pause the queue, and see basic analytics.

## Stack

- **Backend:** Node.js + Express + MySQL (`mysql2`) + Socket.io (live updates)
- **Frontend:** React (Vite) + React Router
- **Auth:** Magic-link email for patients (passwordless), email/password for vendors

## How the queue logic works (read this before deploying)

- Each vendor gets one `queue_sessions` row **per calendar day** — the token counter resets
  to 1 every day, and `daily_capacity` (set in Settings) caps how many tokens can be issued.
- **Push:** a patient can push their own waiting token back by `push_bump_positions` places
  (default 4), **once per token**. Only the people who move up as a result are notified.
- **Skip / no-show:** if a called token isn't served, the vendor can hit **Skip**, or the
  background job (`src/jobs/queueJobs.js`, runs every 30s) auto-skips it once
  `grace_window_minutes` has passed with no action. First skip sends the token back into the
  queue; a second skip on the same token **forfeits** it entirely, so the line always keeps
  moving.
- **Expiry:** every token has its own `expires_at`, computed from the vendor's expiry policy
  (fixed hours from issue, or end-of-day). The same background job expires anything stale.
- **Live wait estimate:** shown to patients as vendor's manual `default_wait_minutes` until
  there's enough real serve-time data *today*, then it shifts to a live average
  (`src/utils/estimator.js`), bounded so one slow/fast outlier can't skew it too far.

## Project layout

```
queuewise/
  backend/
    src/
      db/schema.sql        <- run this to create the database
      config/db.js          <- MySQL connection pool
      controllers/           <- business logic
      routes/                 <- Express routes
      middleware/             <- patient/vendor session auth
      jobs/queueJobs.js       <- background auto-skip/expiry loop
      sockets/                <- Socket.io room broadcasting
      server.js                <- entry point
  frontend/
    src/
      pages/patient/QueuePage.jsx   <- patient sign-in + live token dashboard
      pages/vendor/AdminPanel.jsx   <- receptionist's next/skip/pause screen
      pages/vendor/Settings.jsx     <- hours, capacity, expiry, push/skip config
      pages/vendor/Analytics.jsx
      pages/PublicBoard.jsx         <- big-screen waiting-room display, no login
      styles/index.css              <- design system (CSS variables)
```

## Local setup

### 1. Database

You need a running MySQL 8+ server. Create a dedicated user, then run the schema:

```sql
CREATE USER 'queuewise_user'@'%' IDENTIFIED BY 'a-strong-password';
GRANT ALL PRIVILEGES ON queuewise.* TO 'queuewise_user'@'%';
FLUSH PRIVILEGES;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# edit .env: set DB_USER/DB_PASSWORD to match what you created above,
# and generate two long random strings for JWT_SECRET and MAGIC_LINK_SECRET
# (e.g. `openssl rand -hex 32`)

npm install
npm run migrate     # applies schema.sql — creates the database & tables
npm run seed         # optional but recommended: adds demo vendors + queue history
npm run dev          # starts on http://localhost:4000
```

**Demo data:** `npm run seed` creates 4 demo vendors across different categories, with
`GreenLeaf Clinic` seeded with 6 days of realistic queue history (so the Analytics page has
something to chart) plus a live "today" with served, called, and waiting tokens already in the
mix. The other three vendors get a lighter live snapshot so the home directory looks populated.
All demo vendor accounts share one password:

| Business | Login email | Password |
|---|---|---|
| GreenLeaf Clinic | demo.clinic@queuewise.test | Demo@1234 |
| Glow Salon & Spa | demo.salon@queuewise.test | Demo@1234 |
| Metro Bank Branch | demo.bank@queuewise.test | Demo@1234 |
| City Registrar Office | demo.gov@queuewise.test | Demo@1234 |

It's safe to re-run `npm run seed` any time — it deletes and recreates these four demo
vendors (matched by email) rather than duplicating them, so you can reset the demo data
whenever you want a clean slate.

**Email in development:** if you leave `SMTP_HOST` blank in `.env`, magic links are printed
to the backend console instead of emailed — useful for testing without setting up SMTP first.
When you're ready to go live, plug in any SMTP provider's credentials (e.g. a transactional
email service) into the `SMTP_*` variables.

### 3. Frontend

```bash
cd frontend
cp .env.example .env    # points at your backend; edit if not running on localhost:4000
npm install
npm run dev              # starts on http://localhost:5173
```

Open `http://localhost:5173`, sign up as a vendor, then visit
`http://localhost:5173/q/<your-slug>` (shown in the admin panel) to try the patient flow in
another browser tab.

## Deploying

- **Backend:** deploy as a normal Node process (PM2, systemd, Docker — your call) behind a
  reverse proxy (nginx/Caddy) with HTTPS. Set `NODE_ENV=production`, a real `APP_BASE_URL`
  (your frontend's domain), and real SMTP credentials.
- **Frontend:** `npm run build` produces a static `dist/` folder — serve it from nginx, or any
  static host. Set `VITE_API_BASE_URL` to your backend's public URL before building.
- **Cookies:** vendor and patient sessions are httpOnly cookies. In production
  (`NODE_ENV=production`) they're marked `secure`, so both frontend and backend must be served
  over HTTPS, and `COOKIE_DOMAIN` in the backend `.env` should match your real domain.
- **MySQL:** any managed MySQL 8+ instance works — just point `DB_HOST`/`DB_USER`/etc. at it
  and run `npm run migrate` once.

## What's intentionally out of scope for this MVP (phase 2)

Booking a token for someone else as a distinct flow, priority tokens (elderly/pregnant/
emergency), walk-in kiosk/tablet support, multiple queues per vendor, role-based staff
accounts, SMS/WhatsApp notifications (paid patient feature), and deeper data-privacy hardening
ahead of a wider rollout. The code is structured (separate controllers/routes per concern) so
each of these can be added without reworking the core queue engine.

## Customer discovery flow

The home page (`/`) is a searchable, filterable directory of active vendors — this is the
actual customer entry point: browse or search by name, filter by category, see each vendor's
live "now serving" number and an estimated wait for a new token, and tap through to `/q/:slug`
to get one. Browsing the directory is read-only: it doesn't create a queue session for a
vendor just because someone looked. `/for-business` holds the vendor-facing marketing/signup
page (what used to be at `/`).

This pilot intentionally has no city/location selection — it's built to run in a single city
first. The `vendors` table still has a nullable `city` column in case you want it later, but
nothing in the UI asks for or filters on it right now.

If you already ran `npm run migrate` before this update, run
`backend/src/db/migrations/002_vendor_category_city.sql` once against your database to add the
new `category`/`city` columns — a fresh `npm run migrate` on a brand-new database already
includes them.
