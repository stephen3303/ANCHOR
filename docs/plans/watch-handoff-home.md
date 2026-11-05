# Watch Handoff on Watch Officer Home

## Scope and decisions

Home owns the message picture. Only its built-in Watch Officer view displays a
compact, expandable Watch Handoff section; personal views do not grant duties.
The old Watch Turnover URL redirects to that view and section. Its duplicate
traffic/action panels and navigation entry are retired.

Handoffs belong to a command's administrator-configured watch station/team.
System Admin assigns active command users as official watch officers. Assigned
members can read their station; System Admin can configure/read it, and command
Report Viewers, Auditors, and the Release Authority can read when command visibility
is enabled. Administrative/read privileges alone do not authorize handing over.

The outgoing assigned officer creates/edits a draft, identifies a different assigned
incoming officer, and enters the incoming watch's UTC/Zulu start/end. They mark it
Ready for review; only that incoming officer can accept. The outgoing officer can
return Ready to Draft for changes. Acceptance requires a reason for any incomplete
checklist items and records identities and server time. Acknowledgements, task
completion, and canonical messages are unaffected.

Accepted records are immutable. Participants who still hold the station duty can
append attributed corrections with reasons. New handoffs inherit unresolved issues
from the latest accepted handoff at that station, retaining lineage, owner, source,
and the predecessor link. Resolved issues are not inherited. No previous session
note or demo duty is silently converted into an official record.

## Implementation and acceptance

- Add additive PostgreSQL schema with one open handoff per station, revisions,
  source snapshots, append-only events, corrections, and immutable accepted rows.
- Add authenticated command-scoped APIs; validate participants, source IDs, UTC
  dates, transitions, and expected revisions on the server, never the view selector.
- Add station setup for System Admin, record history, structured issues/notes,
  incomplete-first checklist, ready/accept/exception/correction controls on Home.
- Preserve unsaved edits on refresh/conflict; show backend and offline limitations.
- Preserve older Home links/defaults and redirect `/watch-turnover` before React
  renders so Next instant-navigation validation remains enabled.

## Validation

Use pure validation/transition tests and an isolated database API integration suite
for permissions, cross-command isolation, two-user handover, persistence, carryover,
exceptions, stale updates, corrections, and database immutability. Browser checks
exercise station setup, editing, Home-only visibility, legacy redirect, and responsive
layout against that isolated service. Run targeted lint and production build/types.
Do not mutate live users, messages, or station assignments to make tests pass.
