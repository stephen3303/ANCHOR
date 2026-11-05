<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Global Codex instructions

Operate as a disciplined coding team. Prefer clear, minimal, tested changes. Never assume permission to modify unrelated repositories.

- Treat repository `AGENTS.md` as the source of project-specific requirements.
- Keep tasks, branches, worktrees, artifacts, and secrets isolated by repository.
- Never expose secrets, tokens, private keys, or sensitive source code in status reports.
- Do not modify project priority; only the owner may set it.
- For nontrivial work, write a brief plan, acceptance criteria, and test strategy first.
- Developer may automatically fix issues raised by code review, security, and QA and resubmit, for at most three correction cycles. Escalate unresolved findings.
- Never self-approve. Require independent review before requesting merge.
- Never merge to protected branches, release, deploy, or perform destructive operations without explicit owner approval.
- Run available tests and report results accurately; never claim tests passed without execution.
- Prefer least privilege, dependency pinning, and local-first development.
- Do not initiate continuous background activity unless a persistent runner has been explicitly configured.

## ANCHOR project context

ANCHOR is a local, UNCLASSIFIED hackathon prototype for naval message handling,
not a production C2OIX replacement or verified CAC/PKI system. Never enter real
operational/classified data or describe simulated transport as real delivery.

Start with `git status`, `package.json`, `README.md`, and the relevant source.
Branches have diverged substantially: do not assume earlier conversation history
matches this checkout. Preserve unrelated work and main's message-store, role,
and transmission features rather than restoring an old branch wholesale.

### Stack and startup

- Node 22+, Next.js 16.4.3 App Router, React 19, TypeScript, Tailwind CSS 4.
- Next.js Route Handlers and `pg` provide the Node API; PostgreSQL 17 runs in
  Docker Compose. Server modules live in `src/lib/server/` and use `server-only`.
- `next.config.ts` enables Cache Components, Partial Prefetching, and standalone
  output. Do not disable navigation validation/caching features to hide errors.
- Copy `.env.example` only if `.env` is absent. Keep credentials out of source
  control. Local Node uses `DATABASE_URL` or PG environment variables; the Docker
  app connects to `postgres:5432`. The example host port is **5433**, since 5432
  may belong to another local database. Keep the port and connection URL aligned.
- HTTPS for LAN teammates: `npm run https:certs -- <hostname> <IP>` requires mkcert
  and explicit `mkcert -install` by the owner; teammates must trust that CA's public
  root certificate, never receive either private key. `npm run dev:https` forces
  Secure cookies (default loopback:3443). Docker uses `docker-compose.https.yml`
  with the base file, a pinned Caddy TLS proxy, read-only leaf cert/key mounts and
  no published plaintext app port. Certificates are ignored by Git/Docker builds.
  LAN binding is explicit via `ANCHOR_HTTPS_BIND`; preserve the override on restart
  and use `app:update -- -Https -Url https://<bound-host>:<port>` on Windows.
  Do not auto-install trust or replace a running app without owner approval.
- Local demo switches: `ENABLE_DEMO_LOGIN=true`,
  `ENABLE_TEMPLATE_AUTHORING=true`, `SESSION_COOKIE_SECURE=false` for HTTP only.
  Passwordless account selection is impersonation, not proof of identity.

First-time setup, from the repository root:

```sh
npm ci
docker compose up -d --wait postgres
npm run db:migrate
npm run db:seed:commands
npm run db:seed:users
npm run db:seed:routing
npm run db:seed:messages
npm run dev
```

Run only one app on port 3000. Alternatively use
`docker compose up -d --build anchor`; plain `up -d anchor` does not rebuild code.
For routine restarts, start PostgreSQL and the app only. Migrate after pulling
new migrations; do not reseed/reset just because the computer restarted.
`postgres_data` is persistent live data. **Never use `docker compose down -v`,
truncate tables, delete migration ledgers, or reset the database without explicit
approval.** Back up before risky data changes.

The bundled directory is `database/seeds/PLADS.txt` (29,970 names); no Downloads
file is needed. Seeds preserve existing IDs and later edits. Routing seeds must
not reset release counters or overwrite administrators' workflow changes.

### Where to work

| Area | Main files |
| --- | --- |
| Workspace/session boundary | `src/app/(workspace)/layout.tsx`, `src/app/login/page.tsx`, `src/proxy.ts`, `src/lib/current-user.tsx`, `src/lib/server/session.ts` |
| App chrome and scrolling | `src/components/shell.tsx`, `src/app/layout.tsx`, `src/app/globals.css` |
| Template library/editor | `src/app/(workspace)/templates/page.tsx`, `src/lib/message-templates.ts`, `src/lib/server/template-versions.ts` |
| Shared generated form / PLADS picker | `src/components/template-preview.tsx`, `src/lib/command-search.ts` |
| Draft composer and custom chains | `src/app/(workspace)/drafting/page.tsx`, `src/components/draft-composer.tsx`, `src/components/draft-routing-editor.tsx`, `src/lib/routing-store.tsx` |
| Draft persistence and transitions | `src/lib/server/outgoing-messages.ts`, `src/lib/server/message-routing.ts`, `src/lib/server/routing-data.ts`, `src/lib/server/routing-config.ts` |
| Pub/sub topics and preferences | `src/app/(workspace)/subscriptions/page.tsx`, `src/lib/message-topics.ts`, `src/lib/topic-subscriptions.ts`, `src/lib/server/message-topics.ts`, `src/app/api/subscriptions/`, `database/migrations/009-message-topic-subscriptions.sql`, `database/migrations/010-template-message-topics.sql` |
| Transmission queue | `src/app/(workspace)/transmissions/`, `src/lib/server/transmissions.ts` |
| Published traffic, ingest, integrity, acknowledgements | `src/lib/server/messages.ts`, `src/lib/naval.ts`, `src/lib/ingest-record.ts` |
| Roles, users, admin | `src/lib/roles.ts`, `src/lib/demo-users.ts`, `src/lib/server/user-admin.ts`, `src/components/routing-admin.tsx` |
| Formatting and input validation | `src/lib/message-format.ts`, `src/lib/message-inputs.ts`, `src/lib/generated-inputs.ts`, `src/lib/format.ts` |
| Watch Handoff on Home | `src/components/watch-handoff.tsx`, `src/lib/watch-handoff.ts`, `src/lib/server/watch-handoffs.ts`, `/api/watch-handoffs`, `/api/watch-stations` |

`(workspace)` is a route group, not a URL prefix. `/drafting` is the single
message-creation flow; `/messages/create` is only a compatibility redirect.
`/admin#users` and `/admin#routing` are tabs; preserve main's shared column order
in `src/lib/message-columns.ts` and `src/components/message-columns.tsx`.

### Sessions and permissions

- Workspace session lookup must run server-side **inside Suspense** and pass the
  validated user to the client provider. Providers must always render Next's
  children route slot. Replacing children with an effect-driven login/loading
  screen causes Next 16.4 **dropped segment / instant-navigation** errors.
- `src/proxy.ts`, layouts, and APIs each enforce the appropriate session checks.
  Sign-in/out perform full navigations; account changes must not reuse another
  user's router, store, or previews. Do not use static `CURRENT_USER` as the
  acting user; it is seed/demo source data only.
- Sessions use random HttpOnly, SameSite=Strict cookies, hashed DB tokens, and
  eight-hour expiry. Check current user activity and privileges on the server.
  Never trust client actor IDs, roles, generated values, or workflow status.
- Use the centralized role helpers in `src/lib/roles.ts`. **System Admin is not
  Message Admin or Release Authority.** Report Viewer and Auditor gate their
  screens/APIs; Message Viewer is the baseline role for every account.
- System Admin manages users, workflows, and sequence settings. The command's
  single **Release Authority** (CO) can release all types and manage designations.
  A **Designated Release Authority** releases only within their designation's
  scope. Designations, not ordinary user-role edits, manage that role.
- Only **Message Admin** transmits, changes communication links, or acknowledges
  received traffic. Demo accounts include LTaylor (System Admin), RWalsh
  (Release Authority), and DHarper (Message Admin after the role migration).
- Directory/template read endpoints are public prototype data. Template editing
  requires the creator or a System Admin in the creator's command; library
  `canEdit` is a hint, not the server's authorization check.

### Message lifecycle: do not collapse release and transmission

1. `POST /api/messages` creates a template-driven **private draft**. It accepts
   input values and an idempotency request UUID, not rendered text/sender context.
   Draft identity, inputs, reference snapshots, generated output and initial
   history are saved atomically. Retries must not create duplicate drafts.
2. `GET /api/messages?view=drafts` returns authorized drafts/history. Ordinary
   `GET /api/messages` returns the published feed plus read/ack state; drafts and
   queued releases must not leak into that feed.
3. The creator may edit any unreleased draft, including during review or after
   withdrawal. Content/chain changes stop review, reset **all approvals**, and
   require resubmission. Only the current assigned account may endorse/return/
   release. All changes use the expected outgoing revision and row locks; stale
   requests return 409. Preserve unsaved editor input across background refreshes.
4. Per-draft chains can be dragged, reordered, added to, or pruned. They contain
   1–20 distinct active command users and exactly one final release step. Changes
   do not modify the command's shared workflow. Saved chains survive resubmission.
5. **Current main behavior:** release assigns the serial/DTG and enqueues a row in
   `transmissions`; it does **not** immediately publish into `messages`. Released
   content is locked. Before transmission, only the releaser or Release Authority
   may revoke the release with a reason. This returns the draft for fresh review;
   the consumed serial is never reused.
6. Message Admin transmission atomically stores the approved text/artifact under
   the same message ID, stamps the outgoing row, records history, and closes the
   queue entry. Only then does it appear in Messages. This is local prototype
   publication/bookkeeping, not a live C2OIX transport integration. Transmitted messages,
   artifacts, saved inputs and reference snapshots remain immutable. A new
   message is required for later changes. Read state is per person;
   acknowledgements are command-wide and separate from canonical message data.

The immutable outgoing trigger from 007 is deliberately refined by
`008-roles-and-transmissions.sql` for a one-time transmission stamp and queued
release revocation. Preserve those narrow exceptions; never broadly remove
publication/append-only guards. Local artifacts use `ANCHOR-…` identities and
real hashes, not invented C2OIX receipts. `SimProvider` remains an in-memory
network demonstration, not proof of external delivery.

`src/lib/store.tsx` loads published messages from the API but can fall back to
bundled demo data if the store is unavailable/empty. Check `messageSource` and
API responses before claiming persistence works. Legacy session notes/action updates, some preferences, and simulation state
are still in memory. Formal Watch Handoff records and station assignments use
PostgreSQL (migration 013); do not present handoff acceptance, watch-reported
completion, or message acknowledgements as task closure.

### Watch Handoff

- Home displays the handoff section only for its built-in Watch Officer view.
  `/watch-turnover` redirects to `/?view=watch&handoff=open#watch-handoff`; it
  does not change the user's saved default. View selection grants no authority.
- System Admin configures station/team assignments. Current assigned officers
  participate; administrative privileges alone cannot edit/accept a handoff.
  Command Report Viewers, Auditors, and Release Authority can read only when the
  station enables command visibility; System Admin can always inspect/configure.
- Outgoing officer owns Draft edits/readiness; only the designated incoming
  officer accepts Ready records. Incomplete checklist items require documented
  acceptance exceptions. All writes are authenticated, command-scoped, and
  revision-checked. Do not bypass conflicts or replace unsaved local input.
- Accepted records, events, and corrections are immutable/append-only. Corrections
  are separate attributed entries, not edits to accepted content. New handoffs
  inherit only unresolved issues from the station's latest accepted record and
  retain lineage/source/history links. Canonical message state is unaffected.
- `test:handoff` runs validation tests. `test:handoff:api` and
  `test:handoff:browser` require a fresh build and PostgreSQL create/drop privileges;
  they use a disposable database, never live station assignments.

### Personal pub/sub feeds

- Messages defaults to All Messages (unchanged full published feed). Subscriptions
  filters by exact saved Type/MSGID topic IDs, alongside the existing filters.
  No subscriptions means no subscribed rows; never fall back to All Messages.
- `/subscriptions` allows every signed-in viewer to freely subscribe/unsubscribe,
  persisted by session user in `message_topic_subscriptions`. No approval, mandatory
  lock or client actor IDs. Existing legacy admin approval demos do not gate this.
- Migration 010 advertises a template's fixed Type atomically on publication
  (creation or revision), before any traffic is sent. List zero-message types and
  allow users to subscribe in advance; never automatically subscribe users.
  Backfill only the latest published fixed Type of active templates.
- Migration 009 remains the second creation path: on insertion into `messages`
  (local transmission, not draft/release), register the topic only if absent and
  link the message. Both paths share the unique case-sensitive topic name and
  `ON CONFLICT DO NOTHING`; preserve existing IDs, memberships and counts.
  Resolve local Type from pinned definitions/saved legacy inputs; received traffic
  uses MSGID. Backfill derived metadata only; preserve all canonical artifacts.
- Workflow `MessageType` categories remain separate. API responses expose derived
  `subscriptionTopicId`/`subscriptionType`; templates can be edited/deleted without
  changing old topics. Preferences filter a feed, not message access permissions.
- `topic-subscriptions.ts` loads server preferences with no demo/offline fallback;
  never claim a failed write was saved. The existing account-keyed store refresh
  reloads them; no new persistent background runner is introduced.

### Template and output invariants

- Templates are plaintext `{{ Named Variables }}` with strict named substitution,
  not executable expressions or HTML. Repeated names share an input.
- New publications/updates require author-fixed `Type` plus Precedence, DateTime,
  Origin, Recipients, Info, Classification, Subject, POC and Message Number. The
  latter nine use exact locked configurations from `database/seeds/standard-message.json`;
  Origin uses the version-1 `sending-command` generator (legacy Originator/Origin
  Command names are renamed in editable copies). DateTime remains manual text,
  Recipients/Info are required newline-separated
  multi-command pickers. Require standard field order, exactly two standalone
  literal BT lines and final NNNN. New authoring is prefilled from that seed.
  `src/lib/standard-template.ts` prepares legacy-name/config changes in editable
  copies only; preserve published versions, existing draft pins and saved output.
- Edits create a new published version under the same template ID via
  `PATCH /api/message-templates/:id` with `{ expectedVersionId, definition }`.
  Lock the parent, reject stale versions, and preserve all existing message pins
  and saved text. Do not update a published version in place.
- Body in Standard Message is a **textarea**. Its source is
  `database/seeds/standard-message.json`; the new-template prefill omits the old
  header TODO. Preserve manual fields unless the user requests changing them. 006 handles fresh seeds;
  `008-standard-message-body-textarea.sql` appends the correction for old DBs.
- Template controls have **no Number type**: use text. Dropdown/radio/checkbox
  group labels and checkbox YES/NO states support optional output overrides;
  blank means the displayed label. Multiple-command separators are semicolon,
  space or newline, in selection order.
- Commands are selected by directory UUID and persisted with save-time snapshots.
  Never infer operational routing addresses or rewrite old output when names change.
  Command pickers return **50 results per page** and highlight literal,
  case-insensitive matches safely as React text/mark nodes, never raw HTML.
- Automatic sender command comes from the session (stored binding key remains
  `sending-command`); resolve automatic values once per save with one server UTC
  clock. Labels say **Sender command**. Display military/Zulu times, not local
  12-hour time. Keep legacy binding versions compatible; do not rewrite old pins.
- Use `renderGeneratedMessage` and `src/lib/message-format.ts` for generated
  previews/persistence: actual LF lines of **at most 69 Unicode code points**,
  wrapping on whitespace where possible, hard-breaking long tokens without loss
  otherwise. Original form values stay intact. Actual formatting is recorded in
  render metadata (profile version 2). This is not CSS-only wrapping.
- Do not silently wrap text at release/transmit or modify published messages.
  Overlong legacy drafts must be resaved and reviewed again.

### Database safety and migration traps

- Drafts live in `message_drafts` + `outgoing_messages`; canonical published
  traffic lives in `messages` + append-only `message_artifacts`. History is in
  `outgoing_message_events`; configuration is `command_routing`. Do not replace
  main's artifact store with the older branch's incompatible draft/feed table.
- `003a-legacy-message-creation.sql` archives that old table as
  `legacy_message_creation_records`; 005 imports saved drafts/history. Preserve
  archived data and IDs; do not drop/reset to resolve branch incompatibilities.
- Some legacy creator columns (notably template tables) are **text**, whereas
  `users.id` is UUID. Inspect the schema and cast appropriately (`u.id::text`)
  instead of causing `uuid = text` errors or hiding orphaned legacy templates.
- `scripts/migrate-db.mjs` sorts full filenames, uses a transaction/advisory lock,
  and checks applied-file SHA-256 values. Both **008** files are intentional and
  distinct; do not renumber them. Add a new migration for future schema changes.
- Do not edit applied migrations or bypass checksum failures. The sole existing
  exception is the exact allowlisted 006 Body textarea amendment; old/new hashes
  are recorded in `schema_migration_amendments`. Keep that exception narrow.
- `--sql` on the migration runner/seed scripts supports isolated test databases.
  Read server logs for generic 503 responses: bad SQL/schema/type mismatches can
  look like an unavailable DB. Do not reset the DB as a first troubleshooting step.

### Validation and common pitfalls

Use scripts actually present in `package.json`; report which ran and their real
results. Baseline checks:

```sh
npm run build
npx tsc --noEmit
npm run test:templates
npm run test:columns
npm run test:messages
npm run test:templates:seed
npm run test:templates:api
npm run test:messages:api
npm run test:drafting:api
E2E_BROWSER_CHANNEL=chrome npm run test:templates:browser
E2E_BROWSER_CHANNEL=chrome npm run test:drafting:browser
E2E_BROWSER_CHANNEL=chrome npm run test:navigation
```

- API/browser integration scripts need a **fresh production build** and PostgreSQL
  database-creation privileges. They create/drop their own isolated databases;
  do not replace them with tests that mutate live project messages/users.
- `test:navigation` runs Playwright against `next dev` (starts/reuses port 3000).
  Dev mode is necessary to detect dropped-segment diagnostics. Install Playwright
  Chromium or use installed Chrome via the environment override above.
- Watch browser tests need current role migrations: DHarper must actually hold
  Message Admin. Reseeding preserves existing role edits; inspect the ledger and
  user roles rather than weakening permission checks to make tests pass.
- Older test assumptions can lag main's release→queue→transmit flow or retired
  roles. Verify current code/specification before reverting main to satisfy them.
- After changing branches, stale `.next/types` may reference removed routes.
  Regenerate with `npx next typegen` or rebuild before treating that as a source
  error; do not rewrite working code just to satisfy stale generated validators.
- Full lint has previously reported unrelated CommonJS `require()` errors in
  `docs/brand/render.js`. Distinguish baseline failures from new ones; do not
  claim a fully clean lint run if it failed.
- For scrolling work, keep the footer within the viewport and scroll application
  panes rather than the outer document. Check mobile navigation, session-error
  banners, short sign-in screens, dialogs, and unrestricted printing. Verify the
  current checkout rather than assuming an earlier session's layout fix exists.

More detail: `README.md`, `database/README.md`, `database/seeds/README.md`, and
`docs/plans/server-message-store.md`. Update this handoff when core workflows or
permissions change; do not turn it into a log of unverified test results.
