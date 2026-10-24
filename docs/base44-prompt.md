# ANCHOR: Base44 design review and build brief

This file hands the ANCHOR design to Base44's builder AI. It has three parts:

1. **Prompt 1 (review first).** Asks Base44 for feedback and recommendations on the design before it builds anything big.
2. **Spec.** The reference the builder works from: screens, theme, entities, flows and the requirements that must hold.
3. **Follow-up prompts.** Short prompts to send one at a time after the review, so each turn stays small.

Attach the mockups (in the project files) and this file to Prompt 1. Everything in the app is fictional mock data and UNCLASSIFIED.

---

## Prompt 1: review the design, then build the shell

> You are reviewing the design for ANCHOR (Authoritative Naval Communications Hub for Official Records), a proposed Commander, Submarine Force (COMSUBLANT) web app for reading, searching, subscribing to, acknowledging and auditing official naval message traffic ingested from C2OIX. The attached screenshots are the UI mockups, and the attached spec lists the screens, data entities, flows and requirements.
>
> **Step 1: give feedback and recommendations before building.** Reply with:
> - The 5 to 10 most important UX problems or risks in the mockups (navigation, information density, readability, accessibility, mobile), each with a concrete fix.
> - Anything in the spec that is unclear, contradictory or hard to build on Base44, and how you would resolve it.
> - Recommended data model changes to the entities in the spec.
> - Features you would cut, merge or defer for a first pilot, and features you think are missing.
> - How you would handle the hard requirements: precedence-driven mandatory alerts, acknowledgement with escalation, subscription approval, AI summaries kept separate from official text, offline/EMCON mode, and the append-only audit log.
>
> **Step 2: build the app shell** using your recommendations where they improve the design: the navy theme, header, left navigation, and the Home and Messages screens with seeded mock data from the spec. Stop after the shell so I can review before the remaining screens.

---

## Spec

### Context and non-negotiables

- ANCHOR complements C2OIX, NC2 and Designated Release Authority (DRA) processes. It does not replace them. **No Reply or Forward buttons**: release of traffic stays with DRAs. Offer "Share link" instead.
- Every message is an immutable official record. Users never edit message text. Status changes (amended, cancelled, etc.) come from newer messages, shown as labels and links.
- Users are CAC/PKI authenticated (simulate with normal sign-in). Access is by command, role and group.
- Submarine force first: mock traffic and the default user are COMSUBLANT, not surface warfare, even where mockups say otherwise.
- All data is fictional. Show an "UNCLASSIFIED // PROTOTYPE" marking in the header and footer.

### Theme

| Token | Value | Use |
|---|---|---|
| navy-950 | `#06142B` | Header gradient start, sidebar |
| navy-900 | `#0A1F3F` | Header gradient middle |
| navy-800 | `#0F2D5C` | Header gradient end, primary buttons |
| navy-600 | `#1A56B0` | Active nav, links on dark |
| navy-100 | `#E3ECF8` | Selected rows, chips |
| gold | `#F2B705` | Anchor logo, accent rule, sidebar motto |
| page | `#EEF2F7` | App background |
| line | `#DBE2EC` | Borders |
| ink / muted | `#0F1B2D` / `#5B6B82` | Text |

- Fonts: Segoe UI / system sans for UI, a monospace font for message text, DTGs and hashes.
- Precedence colors: FLASH red, IMMEDIATE orange, PRIORITY blue, ROUTINE gray.
- Lifecycle colors: ACTIVE green, AMENDED and CORRECTED amber, SUPERSEDED and EXPIRED gray, CANCELLED red with strike-through subject.
- AI summary panels: dashed purple border, labeled "AI-generated summary, not authoritative".

### Layout

- **Header (72px, navy gradient):** gold anchor icon and "ANCHOR" wordmark, gold vertical rule, "AUTHORITATIVE NAVAL COMMUNICATIONS HUB FOR OFFICIAL RECORDS". Right side: connection status dot (green UNCLASSIFIED online, amber EMCON / OFFLINE), unit name, date and Zulu time, user avatar menu.
- **Left sidebar (navy):** Home, Messages (unread badge), Subscriptions, Search, Briefings, Watch Turnover, Offline Mode (pending-sync badge), Reports, Audit & Integrity, Admin (pending-approvals badge), Profile & Settings. Motto at bottom in gold: "PEOPLE · INFORMATION · DECISIONS · MISSION SUCCESS". Collapses to a drawer on mobile.
- **Alert strip** under the header whenever the user has overdue or pending mandatory acknowledgements.
- **Footer:** classification marking and "SECURE · RELIABLE · MISSION READY".

### Entities

**Message** (immutable after ingestion)
- `reference` (e.g. "NAVADMIN 234/26"), `dtg` ("151830Z OCT 26"), `received` (datetime), `subject`
- `type`: NAVADMIN, ALNAV, OPNAVINST, MARADMIN, NAVSEAINST, COMSUBLANT MSG, COMSUBFOR INST, FLEET MSG, SAFETY MSG
- `originator`, `to`, `info`, `source`
- `precedence`: FLASH, IMMEDIATE, PRIORITY, ROUTINE
- `classification`: UNCLASSIFIED (prototype only uses this)
- `lifecycle`: ACTIVE, AMENDED, CORRECTED, CANCELLED, SUPERSEDED, EXPIRED
- `relates_to` (reference this message amends/corrects/supersedes/cancels), `replaced_by`
- `communities` (list: Submarine Warfare, Readiness, Cybersecurity, Safety, Personnel, Training & Education, Maintenance, Policy, ...)
- `sections` (list of {heading, body}), `attachments` (list of {name, size, kind})
- `ack_required` (bool), `ack_due` (datetime), `action_item` ({text, suspense, assigned_to})
- Integrity: `c2oix_id`, `sha256`, `size_kb`, `retention`
- `ai_summary` (text, optional, never merged into `sections`)

**MessageUserState**: `message_id`, `user_email`, `read_state` (new, unread, read), `starred`, `acknowledged_at`.

**Subscription**: `name`, `category`, `description`, criteria (`message_types`, `originators`, `keywords`, `precedence`), `frequency` (Real-time, Daily Digest, Weekly), `status` (Pending Approval, Active, Paused, Denied), `mandatory` (bool, assigned by role/command, cannot be paused), channels (`in_app`, `email`, `teams`), `requested_by`, `approver`, `justification`, dates.

**AlertRule** (admin): `name`, condition (precedence and/or type and/or role/command), `ack_required`, `ack_window_hours`, `escalate_to` (role).

**AuditEvent** (append-only, no edit or delete in UI): `timestamp`, `user`, `action`, `resource`, `result` (Success, Failed, Warning), `device`, `location`, `details`, `hash`.

**SyncItem**: `type` (Acknowledgement, Annotation, Watch Notes, Briefing, Subscription, Action Item), `description`, `created`, `status` (Pending, Synced).

**Briefing**: `title`, `purpose`, date range, `communities`, filters, sections included, generated content. **WatchTurnover**: `watch`, notes, checklist items, linked high-priority messages and open actions.

Seed about 16 messages including: Submarine Deployment Readiness Reporting Requirements (IMMEDIATE, ack required), Cybersecurity Controls Update plus its Corrected Copy, Submarine Safety Stand-Down Guidance (FLASH, ack required), Deployment Readiness Reporting (Interim, SUPERSEDED), Holiday Leave Policy plus a CANCELLED initial version, Port Visit Coordination (Amendment 1), Watch Team Qualification Standards, Maintenance Availability Reporting and Official Records Management Reminder. Default user: "LT Taylor", COMSUBLANT staff, role Watch Officer.

### Screens

| Screen | Contents |
|---|---|
| Home | Mandatory acknowledgements due (with countdown), recent status changes (superseded, cancelled, corrected), latest traffic, open action items. |
| Messages | Inbox table (precedence, reference, subject, originator, DTG, lifecycle, read dot, star) with right-hand filters (date, precedence, type, status, read) and a preview pane. |
| Message detail | Header with precedence and lifecycle badges; banner linking to the replacing message when not ACTIVE; tabs Message, Metadata, Related, References, Distribution; official text in monospace; separate AI summary panel; Acknowledge button when required; integrity block (C2OIX ID, SHA-256, received time); attachments; Print / PDF; Share link. |
| Print rendition | Clean official layout with classification markings top and bottom and the integrity block. |
| Search | Basic, Advanced (date range, type, originator, precedence, community, status, keywords), natural-language search, and saved searches. |
| Subscriptions | My subscriptions table with status, category sidebar, recommended subscriptions, "Request subscription" form with justification. Mandatory rows are locked. |
| Briefings | Tailored Briefing Builder (purpose, date range, communities, filters) with a live preview; Generated Briefing with executive summary, key takeaways, high-priority messages and action items. |
| Watch Turnover | Situation overview, high-priority messages since last watch, open action items, ongoing topics, watch notes, turnover checklist, "Generate turnover package". |
| Offline Mode | EMCON toggle, connection status, local cache stats, sync queue, offline-capable actions, sync priority settings. |
| Reports | Acknowledgement accountability roll-up per message (acknowledged, pending, overdue, escalated), traffic volume by type and precedence. |
| Audit & Integrity | KPI cards, filterable append-only event log, events-by-action and by-classification charts, integrity check results. |
| Admin | Subscription approval queue (approve / deny with comment), mandatory alert rules, access groups. Visible to admin role only. |
| Profile & Settings | User profile (rank, unit, role, groups), notification preferences per channel and precedence, display preferences, security info. |

### Key flows and rules

1. **Precedence and mandatory alerts.** FLASH and IMMEDIATE traffic, and anything matching an AlertRule, is delivered to the user even without a subscription, raises the alert strip, and cannot be muted.
2. **Acknowledgement and escalation.** When `ack_required`, the user must click Acknowledge on the detail page. The time is stored and written to the audit log. Past `ack_due`, the item shows OVERDUE and is escalated to the role in the matching AlertRule; Reports shows who is pending, overdue or escalated.
3. **Subscription approval.** Users request; requests sit in Pending Approval until an admin approves or denies in Admin. No self-service activation. Mandatory subscriptions cannot be paused or removed by the user.
4. **Lifecycle labels.** When a message amends, corrects, supersedes or cancels another, the older one shows the label, a banner and a link to the newer one. Cancelled subjects are struck through.
5. **AI summary separation.** AI summaries appear only in their own labeled panel, never inside the official text, print rendition or search snippets of official text. The official text is always shown first.
6. **Offline / EMCON.** Toggling EMCON switches the header to amber, disables network-only actions, and queues acknowledgements, annotations and notes in the sync queue. Going back online replicates the queue in priority order (acknowledgements first) and records each sync in the audit log.
7. **Audit.** Every view, acknowledgement, search, export, print, subscription request, approval and sync writes an AuditEvent. The log has no edit or delete.
8. **Print / PDF.** Uses the print rendition, including integrity data and classification markings, and writes an audit event.

---

## Follow-up prompts

Send these one at a time after Prompt 1 finishes and you have reviewed its feedback.

**Prompt 2: message detail and integrity**
> Build the Message detail page and Print rendition from the spec: precedence and lifecycle badges, the replacement banner, tabs, monospace official text, the separate dashed-purple AI summary panel labeled "not authoritative", the Acknowledge button with audit event, and the integrity block. No Reply or Forward buttons.

**Prompt 3: subscriptions and admin approval**
> Build Subscriptions and Admin from the spec. Users request subscriptions with a justification and they stay Pending Approval until an admin approves or denies. Mandatory subscriptions are locked. Admin also manages AlertRules (precedence, type, role, ack window, escalate-to role).

**Prompt 4: acknowledgements, escalation and reports**
> Add the alert strip for pending mandatory acknowledgements, OVERDUE and escalation after the ack window, and the Reports page with acknowledgement accountability per message and traffic volume charts.

**Prompt 5: search, briefings and watch turnover**
> Build Search (basic, advanced, natural language, saved searches), the Tailored Briefing Builder with live preview and Generated Briefing, and Watch Turnover with notes, checklist and turnover package, using the spec.

**Prompt 6: offline / EMCON and audit**
> Build Offline Mode with an EMCON toggle that turns the header amber, disables network-only actions and queues acknowledgements, notes and annotations, then syncs in priority order when back online. Build Audit & Integrity as an append-only log with filters and charts, and make every action in the app write an audit event.

**Prompt 7: second-opinion review**
> Review the finished app against the spec's "Key flows and rules". List any rule that is not fully met and fix it. Then give your top recommendations for the pilot: usability, accessibility (WCAG 2.2 AA), mobile use aboard ship, and anything that would make this easier to demo to Commander, Submarine Force.
