# Base44 design review of ANCHOR

Base44's builder AI wrote this review on 2026-10-24 after reading the brief in [base44-prompt.md](base44-prompt.md). It is copied verbatim from `docs/design-review.md` in the Base44 app. Base44 then built the shell (theme, header, grouped navigation, alert strip, Home and Messages) and applied several of these recommendations.

---

## A. The ten highest-impact UX risks

1. **A 12-item sidebar with three badge types plus an alert strip and a 72px header is a lot of competing signals.** Fix: cluster nav into three labelled groups — *Read* (Home, Messages, Search), *Act* (Subscriptions, Briefings, Watch Turnover, Offline), *Govern* (Reports, Audit, Admin, Profile) — with hairline section rules; collapse to icon rail under 1280px, drawer under 1024px. Badges only for items a watch officer must act on (acknowledgements, approvals), never for vanity counts.
2. **The inbox table can't survive mobile.** Eight columns at 390px is unusable. Fix: three tiers — desktop table; tablet drops originator/type to a second line; mobile becomes a card list with a precedence stripe on the left edge, two-line subject, `ref · DTG` in mono. Never horizontally scroll message traffic.
3. **Precedence and lifecycle are encoded in colour alone, and muted-on-page fails AA.** Fix: every chip keeps its text label *and* gets a distinct glyph (FLASH ▲▲, IMMEDIATE ▲, PRIORITY ●, ROUTINE ○), plus a coloured left rule on rows — meaning survives greyscale and colour blindness. I've darkened the muted text token from #5B6B82 to #4A5A72 (~6:1 on the page colour) and reserved #5B6B82 for non-text.
4. **A full-width alert strip under the header becomes invisible ("banner blindness") and eats the mobile fold.** Fix: one compact sticky line — `2 mandatory acknowledgements · 1 OVERDUE — next due 14:05Z` with a jump action — plus a permanent counter in the header so it can't be lost. Escalate to an unmissable modal *only* for unacknowledged FLASH.
5. **Countdowns to the second create anxiety and break when the client clock is wrong.** Fix: always show the Zulu DTG *and* a relative `DUE 3h 12m` / `OVERDUE 2h 14m`, state once in the UI that all times are Zulu, and compute deadlines server-side — never from the browser clock.
6. **The message detail screen is overloaded: 5 tabs plus AI panel plus integrity plus attachments, and the AI panel competes visually with authoritative text — the exact inverse of your non-negotiable.** Fix: one column, official text first and always top; AI summary in a neutral tinted panel *below* it, never above and never in print or search snippets; move Metadata/Related/References/Distribution into a right-hand detail rail on desktop and accordions on mobile. Tabs also break deep-linking into a record.
7. **Full-width monospace is unreadable** (~140 characters per line at 1440px). Fix: cap official text at ~88 characters, 15px/1.7, preserve real line breaks and whitespace, offer a wide toggle.
8. **One-click acknowledge on an irreversible, audited action invites mis-clicks.** Fix: two-step — Acknowledge → confirmation showing reference, precedence, rule, due time, and "this acknowledgement is recorded and cannot be withdrawn" — then a committed state with the Zulu timestamp.
9. **"Offline Mode" is nav item #8 but it's a global mode, not a destination.** Fix: make the header status dot the control (with confirmation), keep one Offline page for cache/queue management, and when EMCON is on show a persistent amber page frame with network-only buttons *disabled with a reason*, never removed.
10. **AI summaries feel privileged by styling, and every screen that surfaces them needs the caveat.** Fix: neutral panel, an icon plus literal "Not authoritative — AI-generated", and the same label in briefings and search results; exclude AI text from official-text search and from the print rendition.

Two more worth folding in: the preview pane on Messages needs `Esc` to close and keyboard row navigation for triage, and print output must carry the classification banner on every page plus a per-copy watermark — otherwise your markings requirement fails the moment someone prints.

## B. Unclear, contradictory, or hard on this platform

- **CAC/PKI.** Real PKI isn't available here. The pilot uses the platform's sign-in; command, role and groups become user fields, with PKI as a gateway integration later. I'm telling you plainly rather than implying CAC is simulated faithfully.
- **"Every view writes an AuditEvent."** At pilot scale raw view-logging floods the table and slows accountability queries. Fix: audit *consequential* actions (open message, acknowledge, search-with-query, print, export, subscription request/approval, sync, admin change) and keep a daily read rollup.
- **"Append-only, no edit or delete" is a policy control, not a database guarantee.** I enforce it with access rules (no update or delete path for anyone, admin included) and add a hash chain for tamper *evidence* — that combination is defensible; claiming technical immutability wouldn't be.
- **Mandatory delivery contradicts subscription approval.** FLASH/IMMEDIATE "delivered without a subscription" can't also be a Subscription row that admins approve. Fix: **AlertRule** owns mandatory delivery and acknowledgement. **Subscription** is only for user-requested topic feeds, with an admin-set `mandatory` flag for role-based feeds that can't be paused.
- **`ack_due` and `ack_window_hours` are two sources of truth.** Fix: the rule holds the window; the resolved due time is written once, per recipient, at delivery. Reports then becomes a simple count.
- **True offline is not achievable** in a browser app without a service worker. EMCON becomes honest graceful degradation: queue acknowledgements/annotations locally, block network-only actions, sync on reconnect. I won't label it "offline cache" when it isn't.
- **Teams channel** needs a connector and tenant consent — out of scope for the pilot.
- **C2OIX ingestion doesn't exist yet.** The pilot must display ingest status as *not connected* rather than implying live traffic.
- Smaller: `relates_to`/`replaced_by` need one relationship model (add `supersedes`/`superseded_by` explicitly); precedence sorts alphabetically — needs a numeric rank; Watch Turnover ownership is undefined (I'd make it one turnover per watch, authored by the watch officer); retention is display-only for the pilot.

## C. Data model changes

- **Message:** add `precedence_rank` (1–4) for sorting; keep one canonical ordered `sections` array *plus* a flattened `body_text` for reliable keyword search (one source for print, one for search); add `ingested_at`; make `sha256`/`c2oix_id` read-only display fields.
- **Split acknowledgement out of MessageUserState.** Acks are audited facts with due dates, escalation and accountability reporting; read/star is trivial UI state. New **Acknowledgement**: message, user, rule, due_at, acknowledged_at, status (Pending/Overdue/Escalated), escalated_to. Reports becomes a count, and escalation is auditable — which is the whole point.
- **AlertRule:** structured `condition` (types[], originators[], precedence[], communities[], roles[]) instead of free text, plus `priority`, `active`, `ack_required`, `ack_window_hours`, `escalate_to_role`, `escalate_after_hours`.
- **AuditEvent:** add `seq`, `prev_hash`, `hash` (chain over canonical payload), `actor_email`, `actor_role`, `command`, `session_id`.
- **SyncItem:** add `operation`, `payload`, `attempts`, `last_error`, `audit_event_id`.
- **Subscription:** structured `criteria`, plus `mandatory`, `requested_by`, `approver`, `decision_comment`.
- **Add** `MessageDelivery` (message, user, reason: rule | subscription | manual) so a user can always answer "why did I get this?" — cheap, and it's the difference between a trusted system and a black box.

## D. Cut, merge, defer for a first pilot

- **Merge:** Search into Messages (one search surface, one set of saved searches — a separate Search route fragments both). References into Related. Distribution into Metadata.
- **Defer:** Teams channel, natural-language search (LLM cost + labelling + audit), true offline document cache, generated PDF (browser print first), the Tailored Briefing *builder* (ship read-only generated briefing), access-groups admin (use roles), charts beyond the two that matter.
- **Keep:** Home, Messages + detail, acknowledgement with escalation, subscription request/approval, audit log + integrity check, basic EMCON queue, acknowledgement accountability report.
- **Missing, and I'd add:** ingest health banner; "why am I seeing this"; **ack vs merely-read shown separately in reports**; who-hasn't-acknowledged roster (that's what actually drives accountability); keyboard triage shortcuts; empty/error states for failed ingestion; print watermark; and an explicit "preview, not recorded" affordance anywhere a flow isn't wired yet.

## E. How I'd handle the hard requirements

- **Precedence-driven mandatory alerts:** delivery is *computed* from AlertRule at read time (precedence, type, community, role) — mandatory traffic always surfaces on Home and in the alert strip and has no mute control anywhere. Only the acknowledgement obligation is stored.
- **Acknowledgement + escalation:** due time resolved per recipient at delivery; a scheduled job flips Pending→Overdue past due, writes the escalation audit event and notifies the escalation role. Escalation is server-side, never client logic.
- **Subscription approval:** users create requests only; access rules make approval admin-only; mandatory subscriptions are flagged and unpausable in both UI and write path; every request, approval and denial is audited with the comment.
- **AI separation:** `ai_summary` is its own field, rendered only in its labelled panel, excluded from print and from search-snippet generation; generation itself is audited.
- **Offline/EMCON:** a mode flag with queued actions in local storage, network-only actions disabled with reasons, replay on reconnect with acknowledgements first, each replay audited.
- **Append-only audit:** create-only, admin-read rules, no update/delete path, hash-chained rows, plus an integrity screen that recomputes the chain and reports the first break.
