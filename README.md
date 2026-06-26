# 🦘 AusWise Migration

A simple, friendly, full-stack web app for applying for **Australian visas** — onshore
and offshore. Built to be usable by absolutely anyone: plain language, big buttons,
one job per screen, and engaging floating visuals.

It bundles everything a migration business needs on the front door:

| Feature | What it does |
| --- | --- |
| 🔎 **Visa finder** | A 4-question wizard that recommends the visas worth exploring. |
| 🗂️ **Visa catalogue** | 24 visa subclasses across every category, with plain-language guides, requirements, steps, documents, indicative fees and an official Home Affairs link. Filter by onshore/offshore, category and search. |
| 📝 **SOP builder** | Generates a structured **Statement of Purpose** / Genuine Student statement from a few prompts, with tailored tips and a checklist. Copy or download as `.txt`. |
| ✅ **VEVO entitlement check** | Implements the official **Home Affairs "(Visa) Entitlements"** API contract so organisations can verify a visa holder's work/study rights and conditions. |
| 📰 **News & updates** | Source-linked summaries of significant immigration changes, plus deep-links to the Home Affairs newsroom for anything newer. |
| 💳 **Fees & payments** | Explains how to pay **government charges directly to the official bodies** (ImmiAccount, BPAY, PayPal) — AusWise never collects government fees. Includes scam-safety guidance. |
| 🚀 **Enquiry + contact** | Lightweight intake forms persisted on the backend, each returning a reference number. |

## Tech

- **Backend:** Node.js + Express (ES modules), zero-dependency JSON store for submissions.
- **Frontend:** Self-contained HTML/CSS/vanilla JS — **no build step, no CDN runtime dependency**, so it loads fast and works anywhere. Custom design system with glassmorphism and floating background elements.
- **Data:** Accurate, source-linked visa data curated from the Department of Home Affairs.

## Run it

```bash
npm install
npm start
# open http://localhost:3000
```

Dev mode with auto-reload:

```bash
npm run dev
```

Run the smoke tests (19 checks across every endpoint):

```bash
npm test
```

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/visas?location=&category=&q=` | List/filter visas |
| GET | `/api/visas/:code` | One visa (e.g. `189`, `820-801`) |
| GET | `/api/categories` | Visa categories |
| GET | `/api/news?category=&impact=` | Immigration news + live sources |
| GET | `/api/payments` | Official payment bodies + safety tips |
| GET | `/api/eligibility/questions` | Visa-finder questions |
| POST | `/api/eligibility` | `{ answers }` → ranked recommendations |
| POST | `/api/sop` | SOP fields → generated draft + tips |
| POST | `/api/applications` | Visa enquiry intake |
| POST | `/api/contact` | Contact message |
| GET | `/api/vevo/info` | VEVO mode + entitlement categories |
| POST | `/api/vevo/check` | `{ data: {...} }` → entitlement result |
| GET | `/api/stats` | Catalogue + submission counts |

## VEVO — Visa Entitlement Verification (for organisations)

The **Check visa** feature implements the official Department of Home Affairs
**"(Visa) Entitlements"** API contract (`server/data/visa-entitlements.openapi.json`,
v1.0.34). It validates requests against the official schema (required fields,
ICAO country code, passport length, date format) and returns the entitlement
shape (visa status, work/study conditions, Medicare eligibility, residence, etc.).

- **Demo mode (default):** returns a **clearly-labelled simulated** result so the
  feature works end-to-end. It never presents fabricated data as real.
- **Live mode:** if `VEVO_ACCESS_TOKEN` and `VEVO_CLIENT_ID` are set (organisation
  enrolment via [Home Affairs Access Manager](https://am.homeaffairs.gov.au) is
  required), requests are forwarded to
  `https://api.public.homeaffairs.gov.au/visa/v1/entitlements/checks`.

Copy `.env.example` to `.env` to configure.

## Deploy

The app is a standard Node server that binds to `$PORT` on `0.0.0.0`, so it runs
on essentially any host. CI (`.github/workflows/ci.yml`) runs the test suite and a
boot check on every push/PR.

**Docker (works anywhere):**

```bash
docker build -t auswise-migration .
docker run -p 3000:3000 auswise-migration
# → http://localhost:3000   (healthcheck: GET /api/health)
```

**Render** — push the repo and use the included `render.yaml` (New + → Blueprint),
or deploy the `Dockerfile` as a Web Service. Health check path: `/api/health`.

**Railway / Heroku-style** — the `Procfile` (`web: node server/index.js`) is picked
up automatically; the platform injects `$PORT`.

**Any VPS:**

```bash
npm ci --omit=dev && NODE_ENV=production npm start
```

Submissions persist to `server/data/db.json` (override the dir with `DATA_DIR`).
On read-only/ephemeral filesystems the store automatically falls back to
in-memory for the life of the process, so requests never fail.

## ⚠️ Important disclaimer

AusWise Migration is an **information and document-preparation tool**. It is **not** a
government agency and does **not** provide legal or migration advice. All information
is general only and **may change** — always confirm visa details and current fees on
the [Department of Home Affairs](https://immi.homeaffairs.gov.au/) website. Government
Visa Application Charges are paid **directly to Home Affairs via ImmiAccount**. For
advice tailored to your situation, consult a registered migration agent
([OMARA](https://www.mara.gov.au/)) or an Australian legal practitioner.

Visa fees shown are **indicative base charges** only and change regularly (often on
1 July). This project is a demo and is not affiliated with the Australian Government.
