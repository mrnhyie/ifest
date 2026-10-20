# iFESTIVAL 2026 — Registration Portal

Landing + documentation page and participant registration portal for **iFESTIVAL '26**
(The Tertiary Innovation & Technology Festival, SparkLab Africa · KAAF University · 16–20 Nov 2026),
implementing the *Participant Registration Portal: Question Set* PDF.

## Run

```bash
go build -o bin/ifest .
ADMIN_TOKEN=choose-a-secret ./bin/ifest        # listens on :8090 (override with ADDR=:port)
```

- Site: http://localhost:8090/
- Admin (view registrations): http://localhost:8090/admin — unlock with `ADMIN_TOKEN`
  (if unset, the server prints a one-time token at startup)

## Stack

- **Backend (local):** single Go binary, SQLite via pure-Go `modernc.org/sqlite` (no cgo).
  Data in `data/ifest.db`, uploads in `data/uploads/<TEAM-CODE>/`.
- **Backend (hosted):** Node.js Vercel functions in `api/` on **Neon Postgres**
  (registrations, member-email index, uploads as `bytea`). Same public API paths,
  so `web/` is identical for both backends.
- **Frontend:** static files in `web/` (Tailwind CDN + vanilla JS). No build step.

## Deploy to Vercel (Neon)

1. Create a Neon project; copy the **pooled** connection string (`...pooler...`).
2. Set env vars (see `.env.example`):
   `vercel env add DATABASE_URL` and `vercel env add ADMIN_TOKEN` (or the dashboard).
   `ADMIN_TOKEN` is required — the Node port refuses admin access without it.
3. `vercel --prod`. `vercel.json` rewrites `/`, `/admin`, `/assets/*` to `web/`;
   functions come from `api/`. `.vercelignore` keeps `data/` (real local records)
   and Go files out of the deploy.
4. Schema (`registrations`, `member_emails`, `uploads`) is created automatically on
   the first function call.

Ported behavior differences vs the Go server:
- Uploads are stored in Neon (`bytea`) and served admin-side at
  `/api/file/<code>/<field>/<secret>` — capability URLs surfaced as clickable
  "open" links in `/admin`.
- Admin auth is `X-Admin-Token` only (no `?token=` in URLs); CSV export downloads
  via an authenticated fetch.
- Duplicate email / 2-teams-per-institution checks run inside one transaction with
  advisory locks (no read-then-write race).
- Per-file limit 6 MB, total 20 MB, types jpeg/png/webp/pdf — Vercel's own request
  body cap may reject larger uploads earlier; compress big scans.

## API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/register` | public | multipart: `payload` (JSON) + files (`memberId_N`, `consent`, `robotPhoto`, `pitchDeck`) → `{code: IF26-XXXXXX}` |
| `GET /api/check-member?email=` | public | duplicate-registration auto-check |
| `GET /api/registrations?q=&category=` | admin | list / search |
| `GET /api/registrations/{id}` | admin | full detail incl. files |
| `GET /api/export.csv` | admin | CSV export (`?token=` or `X-Admin-Token`) |

## Enforced rules (client + server)

- AI Hackathon ⇄ Robot Wars mutually exclusive; Pitch combinable with either.
- Team size 2–5; every member needs details + student ID scan upload.
- No member email may appear in two teams; max 2 teams per institution per competition.
- Robot Wars limits: ≤5 kg, 30 cm box, ≤60 cm extension, ≤14.8 V, kill switch = Yes, 5 safety declarations + inspection confirmation.
- Pitch: student-led, valid demo link, primary SDG, ≥1 "ask".
- All 5 core declarations required; parental consent upload required if minors flagged.
