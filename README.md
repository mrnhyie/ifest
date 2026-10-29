# iFESTIVAL 2026 — Registration Portal

Landing + documentation page and participant registration portal for **iFESTIVAL '26**
(The Tertiary Innovation & Technology Festival, SparkLab Africa · KAAF University · 16–20 Nov 2026),
implementing the *Participant Registration Portal: Question Set* PDF.

## Run

```bash
npm install
cp .env.example .env.local     # fill in real DATABASE_URL + ADMIN_TOKEN
npm start                      # listens on :8090 (override with PORT=:port)
```

- Site: http://localhost:8090/
- Admin (view registrations): http://localhost:8090/admin — unlock with `ADMIN_TOKEN`
  (admin routes return 401 while it is unset)

## Stack

- **Backend:** single Node.js app. `server.js` serves `web/` statically and routes
  `/api/*` to the same handlers in `api/` used on Vercel. Database is
  **Neon Postgres** (`pg` pool in `api/_lib/db.js`): registrations, member-email
  index, uploads as `bytea`. Schema is created automatically on first call.
- **Frontend:** static files in `web/` (Tailwind CDN + vanilla JS). No build step.

## Deploy to Vercel (Neon)

1. Create a Neon project; copy the **pooled** connection string (`...pooler...`).
2. Set env vars (see `.env.example`):
   `vercel env add DATABASE_URL` and `vercel env add ADMIN_TOKEN` (or the dashboard).
   `ADMIN_TOKEN` is required — the Node port refuses admin access without it.
3. `vercel --prod`. `vercel.json` rewrites `/`, `/admin`, `/assets/*` to `web/`;
   functions come from `api/`. `.vercelignore` keeps `data/` and env files out
   of the deploy. `server.js` is not used on Vercel (functions only).
4. Schema (`registrations`, `member_emails`, `uploads`) is created automatically on
   the first function call.

Behavior notes:
- Uploads are stored in Neon (`bytea`) and served admin-side at
  `/api/file/<code>/<field>/<secret>` — capability URLs surfaced as clickable
  "open" links in `/admin`.
- Admin auth is `X-Admin-Token` only (no `?token=` in URLs); CSV export downloads
  via an authenticated fetch.
- The duplicate-email check runs inside the registration transaction (advisory lock
  on each email) so two concurrent teams cannot claim the same member. There is no
  cap on how many teams one institution may enter.
- Per-file limit 6 MB, total 20 MB, types jpeg/png/webp/pdf — Vercel's own request
  body cap may reject larger uploads earlier; compress big scans.

## API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/register` | public | multipart: `payload` (JSON) + files (`consent`, `robotPhoto`, `pitchDeck`) → `{code: IF26-XXXXXX}` |
| `GET /api/check-member?email=` | public | duplicate-registration auto-check |
| `GET /api/registrations?q=&category=` | admin | list / search |
| `GET /api/registrations/{id}` | admin | full detail incl. files |
| `GET /api/export.csv` | admin | CSV export (`X-Admin-Token` header) |

Legacy `data/` (old Go/SQLite database + uploaded files) is no longer read by the
app and remains git-ignored; the real IF26-YTDH2B registration lives there only.

## Enforced rules (client + server)

- AI Hackathon ⇄ Robot Wars mutually exclusive; Pitch combinable with either.
- Team size 2–5. Eligible participants: enrolled students, recent graduates, and non-tertiary learners (SHS, bootcamp, self-taught, working) — each member declares one status; enrolled members must give institution, institution type and student ID number (no ID photo upload — physical cards verified on-site).
- No member email may appear in two teams. No limit on teams per institution.
- Robot Wars limits: ≤5 kg, 30 cm box, ≤60 cm extension, ≤14.8 V, kill switch = Yes, 5 safety declarations + inspection confirmation.
- Pitch: student-led, valid demo link, primary SDG, ≥1 "ask".
- All 5 core declarations required; parental consent upload required if minors flagged.
