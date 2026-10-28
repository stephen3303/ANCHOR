# ANCHOR

**Authoritative Naval Communications Hub for Official Records**, a working prototype: a Next.js front end on a real server and database that ingests raw naval message traffic, hashes and stores it immutably, and records every action in a hash-chained audit log.

ANCHOR is a proposed Commander, Submarine Force capability that ingests official message traffic from C2OIX into an immutable, CAC/PKI-protected repository and gives users one interface to read, search, subscribe to, acknowledge and audit it. It complements C2OIX, NC2 and Designated Release Authority processes rather than replacing them.

> **Prototype only.** Every message, person, unit, address and metric in this app is fictional mock data. Nothing here is an official record.

## Run it

### Docker (recommended, keeps it isolated)

```powershell
docker compose up --build
```

Then open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

The database lives in the `anchor-data` Docker volume, so acknowledgements, subscriptions and ingested traffic survive a restart. To start over from the demo data, `docker compose down -v`.

### Node (for development)

Requires Node 22.13 or newer (ANCHOR uses Node's built-in SQLite).

```powershell
npm install
npm run dev
```

The database is created at `data/anchor.db` on first run and seeded with the demo traffic. Delete the `data` folder to reset. Set `ANCHOR_DB` to put it elsewhere.

### Checks

```powershell
npm run lint
npm test
npm run build
```

## Screens

| Route | Screen |
|---|---|
| `/` | Home: mandatory acknowledgements, status changes, latest traffic |
| `/messages` | Messages inbox with filters and preview pane |
| `/messages/[id]` | Message detail: official text, AI summary (separate), metadata, integrity, attachments |
| `/messages/[id]/print` | Official print / PDF rendition with integrity block |
| `/search` | Basic, advanced, natural-language and saved searches |
| `/subscriptions` | Subscriptions; new ones are requested and need approval |
| `/briefings` | Tailored Briefing Builder with live preview |
| `/briefings/generated` | Generated briefing |
| `/watch-turnover` | Watch Turnover with notes and checklist |
| `/offline` | Offline / EMCON mode with sync queue (toggle "Simulate EMCON") |
| `/reports` | Acknowledgement accountability and traffic measures |
| `/audit` | Audit & Integrity log (append-only) |
| `/admin` | Subscription approval queue, mandatory alert rules, access groups |
| `/profile` | Profile & Settings |

## How the requirements show up

The UI follows the mockups. Where they differ from the ANCHOR requirements package, the requirements win:

- **COMSUBLANT first.** Mock traffic and the user are submarine force, not surface.
- **Precedence** (FLASH, IMMEDIATE, PRIORITY, ROUTINE) on every message. FLASH and IMMEDIATE drive mandatory alerts.
- **Lifecycle status** labels for AMENDED, CORRECTED, SUPERSEDED, CANCELLED and EXPIRED, with links to the replacing message and a banner on the message itself.
- **Mandatory acknowledgement** with due time and escalation, a site-wide alert strip, and a roll-up in Reports.
- **Approved subscriptions only.** Users request; the unit Subscription Approver approves in Admin. Command- and precedence-assigned subscriptions are locked on.
- **Integrity.** Each message shows its C2OIX ID and SHA-256 from ingestion, and the print rendition carries the same block.
- **AI summaries** are dashed, purple, labeled "Not authoritative", and never mixed into the official text.
- **Disconnected / EMCON.** Actions taken offline are queued and replicate on sync, with bandwidth-aware priority.
- **Audit.** Every action in the prototype is written to the audit log.
- **No Reply / Forward.** The mockups show them, but releasing traffic stays with Designated Release Authorities, so the prototype offers Share Link instead.

## How it works

```
raw C2OIX text ──► parse (src/lib/naval.ts) ──► SHA-256 ──► artifacts table (append-only)
                         │                                      │
                         ├─► lifecycle directive applied        └─► official text is always parsed back from here
                         │   to the message it names
                         └─► full-text index (FTS5)

every user action ──► /api/actions ──► SQLite ──► audit table (append-only, hash-chained)
offline (EMCON)   ──► browser queue ──► /api/sync replays in order, same code path
```

- **Ingestion.** `src/lib/naval.ts` parses a simplified GENADMIN: precedence prosign and DTG, FM/TO/INFO, classification, serial, `SUBJ/`, `REF/`, `NARR/`, `RMKS/` numbered paragraphs, plus `ACK/` (mandatory acknowledgement due time) and `EXPIRES/`. A `NARR/THIS MSG SUPERSEDES|CANCELS|CORRECTS|AMENDS REF A` line updates the referenced message, even when the two arrive out of order. Identical text re-ingested is a no-op; different text under an existing serial is refused, because changes to official traffic arrive as new messages.
- **Integrity.** Source artifacts and the audit log are protected by database triggers that refuse UPDATE and DELETE. Each audit event's hash covers the previous one, so the chain check catches an edit to a past event made around the triggers. It does not, on its own, catch someone with direct database access who rewrites every later hash or drops the newest events, and a message's recorded hash sits beside its text; the integrity check shows the chain head so it can be compared with a copy kept outside ANCHOR (production would sign it). Admin > Audit & Integrity > Run Integrity Check recomputes every message hash and walks the chain; each message's Integrity tab does the same for one message and shows the raw source.
- **Sign-in.** Production uses CAC/PKI. The prototype has three demo accounts (user menu, top right): LT Taylor (Comms Officer, approver and admin), ITC Ramirez (Leading Chief, no approver role) and CDR Hale (CO, approver). Nobody can approve their own subscription request.
- **Acknowledgement rules.** An `ACK/` line sets the due time. Otherwise FLASH and IMMEDIATE traffic must be acknowledged within 2 hours and SAFETY traffic within 24, matching the Admin alert rules. The first acknowledgement stands.
- **EMCON.** Turn on "Simulate EMCON" on the Offline Mode screen. Actions are applied on screen, queued in the browser (survives a reload), and replayed in order by Sync Now. An offline acknowledgement keeps the time it was made.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, lucide-react icons, SQLite via Node's built-in `node:sqlite`. Server code is in `src/server/`, route handlers in `src/app/api/`. Demo data (`src/lib/data.ts`) is rendered to raw message text and ingested through the normal path on first run, so it gets real hashes and lifecycle links. Tests run with Node's built-in test runner (`tests/`).

## Not in the prototype

Real CAC/PKI client-certificate login, a live C2OIX feed, originator signature checks, email and Teams delivery, and classified enclaves. The prototype accepts UNCLAS and CUI text only.
