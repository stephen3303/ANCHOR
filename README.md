# ANCHOR

**Authoritative Naval Communications Hub for Official Records**, a clickable front-end prototype.

ANCHOR is a proposed Commander, Submarine Force capability that ingests official message traffic from C2OIX into an immutable, CAC/PKI-protected repository and gives users one interface to read, search, subscribe to, acknowledge and audit it. It complements C2OIX, NC2 and Designated Release Authority processes rather than replacing them.

> **Prototype only.** Every message, person, unit, address and metric in this app is fictional mock data. Nothing here is an official record.

## Run it

### Docker (recommended, keeps it isolated)

```powershell
docker compose up --build
```

Then open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

### Node (for development)

Requires Node 20.9 or newer.

```powershell
npm install
npm run dev
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

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, lucide-react icons. All state is in memory (`src/lib/store.tsx`) and resets on reload. Mock data lives in `src/lib/data.ts`.
