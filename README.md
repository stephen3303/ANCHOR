# ANCHOR

**Authoritative Naval Communications Hub for Official Records**, a clickable front-end prototype.

ANCHOR is a proposed Commander, Submarine Force capability that ingests official message traffic from C2OIX into an immutable, CAC/PKI-protected repository and gives users one interface to read, search, subscribe to, acknowledge and audit it. It complements C2OIX, NC2 and Designated Release Authority processes rather than replacing them.

> **Prototype only.** Frontend messages, people, units, addresses and metrics are fictional mock data. The separate PostgreSQL command directory can be imported from PLADS. Nothing here is an official message record.

## Run it

Requires **Node 22+, npm, and a running Docker engine with Docker Compose**.
Run these commands from the repository root. Database setup uses host Node/npm
via the PostgreSQL container, even if you run the app itself in Docker.

### First-time setup — once per new database

1. Start Docker Desktop (or your Docker daemon).
2. Copy `.env.example` to `.env` **only if `.env` does not already exist**.
   Keep `POSTGRES_PORT` and `DATABASE_URL` consistent. The example uses port 5433
   to avoid conflicting with an existing local PostgreSQL instance.
3. Install dependencies, initialize the schema, and import the bundled data:

```sh
npm ci
docker compose up -d --wait postgres
npm run db:migrate
npm run db:seed:commands
npm run db:seed:users
npm run db:seed:routing
npm run db:seed:messages
```

`db:migrate` applies SQL from `database/init/` and `database/migrations/`.
`db:seed:commands` imports `database/seeds/PLADS.txt` into the `commands` table;
**no Downloads file or manual file copy is needed**. `db:seed:users` imports
the ten demo accounts and links each one to its command. `db:seed:routing`
initializes the command's workflows using those real accounts; reruns preserve
administrative changes and sequence counters. Migration 006 automatically
publishes the bundled **Standard Message** template on a fresh database; an
existing template with that name or seed key is never overwritten. `db:seed:messages` loads the
demo traffic into the message store through the C2OIX parser, plus acknowledgements
received from other commands. Until it runs, the app shows bundled demo messages and
says reads and acknowledgements are not saved. Seed commands are safe to rerun,
but are not required for routine startup.

4. Launch **one** app mode:

```sh
# Development: keep this terminal open.
npm run dev

# OR Docker: first build, then run in the background.
docker compose up -d --build anchor
```

Open http://localhost:3000 and continue as **LT Taylor**. For teammates connecting
by LAN hostname/IP, use the [HTTPS setup below](#https-for-teammates); browser
`crypto.randomUUID()` is unavailable on ordinary remote HTTP origins.

### HTTPS for teammates

Use trusted HTTPS for access from other computers. The HTTP commands above remain
available for localhost-only development/tests. Do not expose this passwordless
prototype to the public internet; HTTPS encrypts traffic but does not turn demo
account selection into verified authentication.

**One-time certificate setup on the server:** install
[mkcert](https://github.com/FiloSottile/mkcert#installation) (for example,
`brew install mkcert` on macOS or `winget install FiloSottile.mkcert` on Windows).
Replace the example hostname/IP below with the addresses teammates actually use:

```sh
mkcert -install
npm run https:certs -- anchor-host.local 192.168.1.20
```

`mkcert -install` explicitly installs a local development CA into this machine's
trust store. The helper only issues a certificate; it does not install trust or
start a server. It always includes localhost/loopback names, writes the leaf
certificate and private key to ignored `certificates/anchor.pem` and
`certificates/anchor-key.pem`, and refuses to overwrite existing files. Reissue
explicitly if the hostname/IP changes or the certificate expires.

**On each teammate's computer:** securely copy **only the public `rootCA.pem`**
from the server's `mkcert -CAROOT` directory and import it as a trusted root in
the OS/browser certificate store (Windows: Trusted Root Certification Authorities;
macOS: Keychain Access, trust for SSL). Confirm its fingerprint with the server
owner before trusting it, and restart the browser. Firefox may need its own CA
import. Installing a different CA on each client will not trust the server.
**Never share `rootCA-key.pem` or `anchor-key.pem`**, and never put any private
key or CA directory in Git, a Docker image, or a chat message. Do not rely on
clicking through browser certificate warnings. No scripts here automatically
change trust settings or install certificates on teammates' machines.

Choose **one** serving mode after stopping any existing app on port 3000:

**Node development:**

```sh
npm run dev:https -- --port 3443
# LAN access (explicitly expose only the server's private IP):
npm run dev:https -- --hostname 192.168.1.20 --port 3443
```

This uses Next's development HTTPS support with the existing cert/key and forces
Secure session cookies. Default binding is loopback only. Keep this terminal
open. Custom certificate paths can be set with `ANCHOR_HTTPS_CERT/KEY` in `.env`.
Missing/invalid certificates cause failure, not a silent HTTP fallback. Run only
one `next dev` instance per checkout (including HTTP mode).

**Docker / standalone app (recommended for sharing the prototype):**

Requires Docker Compose 2.24.4+ for the HTTPS override's `!reset` support. In `.env`,
set `ANCHOR_HTTPS_BIND=192.168.1.20` for LAN access and optionally
`ANCHOR_HTTPS_PORT=3443`. Leave the bind unset for localhost-only HTTPS. Then run:

```sh
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build anchor https
```

The pinned Caddy proxy serves TLS on port 3443, forwards the original Host and
HTTPS scheme to Next, and preserves streaming. The app's plaintext port is
**unpublished**, Secure session cookies are forced on, and only the leaf cert/key
are mounted read-only into the proxy—not the app image or the CA key. For plain
HTTP LAN sharing without TLS, set `ANCHOR_HTTP_BIND=0.0.0.0` (or the private LAN
IP) in `.env` instead; it defaults to loopback, and every `docker compose` run
(including `npm run app:update`) reads it. PostgreSQL
and existing database volumes are unchanged. Allow the chosen TLS port only from
trusted LAN clients in the host firewall. Keep the same `-f` options for restarts:

```sh
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d anchor https
# Windows updates must preserve HTTPS mode and use the bound LAN address:
npm run app:update -- -Https -Url https://192.168.1.20:3443
```

Open **`https://192.168.1.20:3443`** (or the matching hostname) and sign in again.
Use the certificate's exact hostname/IP, not `http://…:3000`. In the browser
console, `window.isSecureContext` should be `true` and
`typeof crypto.randomUUID` should be `"function"` without certificate warnings.
The local CA must be trusted on each client. With loopback-only binding and the
default port, `npm run app:update -- -Https` uses https://localhost:3443.
Do not use plain `app:update` or a
base-only Compose `up` in HTTPS mode: those select the original HTTP configuration.

Validation: `npm run test:https:config`; after a fresh build,
`E2E_BROWSER_CHANNEL=chrome npm run test:https` verifies a temporary TLS proxy,
redirects, Secure cookies, same-origin checks and browser UUID generation. The
smoke test uses an isolated temporary certificate (browser bypass in that test
context only), explicitly verifies it for Node requests, makes no database
changes, and stops/removes its test servers/container when done.

### Routine startup — after a computer restart or stopping containers

1. Start Docker Desktop (or your Docker daemon) and wait for it to be ready.
2. Start the database and wait for its health check:

```sh
docker compose up -d --wait postgres
```

3. Start **one** app mode:

```sh
# Node development server (must be relaunched after a reboot):
npm run dev

# OR the already-built Docker app:
docker compose up -d anchor
```

**Do not rerun migrations or seeds just because the computer restarted.** Existing
records, templates, users, and unexpired sessions remain in the database volume.
Both containers use `restart: unless-stopped`, so Docker may already restart them
when its engine starts; the `up` commands above are safe either way. Containers
explicitly stopped by you may need those commands to start again.

### Update to the latest main (Windows, Docker app)

```sh
npm run app:update            # pull main, migrate, rebuild and restart the app
npm run app:update -- -Seed   # also rerun the (idempotent) seed scripts
```

If PowerShell says `npm.ps1 cannot be loaded because running scripts is disabled`,
run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once (or use `npm.cmd`).

`scripts/update.ps1` stops if tracked files have uncommitted changes, fast-forwards
`main`, runs `npm ci` only when `package-lock.json` changed, applies new migrations
before rebuilding the `anchor` container, and waits until http://localhost:3000
answers. It never deletes database data.

### After pulling changes — only as needed

- Dependency changes: `npm ci`.
- New migration files: start PostgreSQL, then `npm run db:migrate`.
- Updated bundled PLADS data: `npm run db:seed:commands` (adds missing names).
- Missing initial demo account: `npm run db:seed:users`.
- Docker app code/dependency changes: `docker compose up -d --build anchor`.

### Stop, inspect, and reset

```sh
docker compose ps                        # Container status
docker compose logs --tail=50 postgres    # Database logs
docker compose stop                      # Stop containers; keep all data
# Or remove containers/networks but keep database data:
docker compose down
```

For Node development, also stop `npm run dev` with `Ctrl+C`.
**Do not use `docker compose down -v` unless you intend to delete the entire
project database**, including drafts/templates/users/sessions. After that reset,
start PostgreSQL and rerun migrations and both seed commands from first-time setup.

## Message-type subscriptions

New template publications and updates must contain the case-sensitive placeholder
`{{ Type }}` and a non-empty, single-line text value set by the template
editor (up to 200 characters). Configure this fixed value in step 2. It is saved
in the immutable version and rendered read-only for drafters; draft requests
cannot supply or override it. Leading/trailing whitespace is trimmed; case and
internal spacing are preserved. This value is the intended pub/sub topic, not a
unique template ID or workflow/release category. This is local feed selection,
not external transport delivery.
Existing published versions, including the historical Standard Message seed,
remain unchanged and usable. Their next editor publication must satisfy the new
rules. Opening an older template for editing renames legacy variables in the
editable copy, without changing its published version. The existing
workflow/release message-type categories are unchanged.

New templates are prefilled from `database/seeds/standard-message.json`, including
the Body textarea and standard field configurations, without a TODO header. Every
new publication/update must contain these case-sensitive variables in standard
order: Precedence, DateTime, Origin, Recipients, Info, Classification, Subject, POC and
Message Number, in addition to Type. Their configurations are locked in the
editor and validated server-side against the seed:

- Precedence is the required dropdown with R/P/O/Z output overrides.
- Origin is required and autogenerated with the version-1 sender-command binding.
  It comes from the signed-in account's command; authors cannot change its
  behavior and drafters cannot supply or override it.
- Recipients and Info are required multiple-command pickers, newline-separated.
- DateTime, Classification, Subject, POC and Message Number remain required text
  inputs, matching the standard (DateTime is **not** automatically generated).
- Precedence/DateTime/Origin/Recipients/Info precede the first standalone `BT` line;
  Classification/Subject/POC sit between the two `BT` lines; Message Number follows
  the second. Exactly two literal standalone `BT` lines are required, and the
  final nonblank line must be literal `NNNN`.

The editable legacy names Message DateTime, Recipient Commands, Info Commands
and Point of Contact become DateTime, Recipients, Info and POC respectively;
Msg Type becomes Type; Originator and Origin Command become Origin. Locked
configurations are restored in that editable copy.
If both an old and new name exist, resolve the conflict explicitly; the editor
will not silently merge them. Custom body variables remain configurable.

### Subscribe and choose your inbox

Apply pending migrations (including 009 and 010) with `npm run db:migrate`.
In **Subscriptions**, subscribe/unsubscribe freely to any listed available type;
no approval or mandatory subscription is required. Preferences are persisted per
signed-in person and survive reloads. Names match exactly (case-sensitive).

In **Messages**, the **Subscriptions / All Messages** selector defaults to
**All Messages**, preserving the existing full feed. **Subscriptions** shows only
published messages in your saved types, including older matching traffic, with
the existing search/filters still applied. An empty subscription list means an
empty subscription feed, never a fallback to all messages. Manage subscriptions
from the nearby link. Mark All Read in this mode affects only visible rows.
Subscriptions are a preference, not an authorization boundary: all published
messages remain available in All Messages and through direct reader links.

Types are registered atomically when a template is created/published or a new
version is published with a fixed Type (migration 010). They are immediately
available for subscription with **0 published messages**, before any traffic is
sent. Advertising a type never automatically subscribes any user.

Message transmission/ingest remains a second creation path (migration 009):
when a message enters `messages`, create its type only if it does not already
exist, then link the message to that existing type. Local publication still
happens at Message Admin transmission, **not** draft creation or release-to-queue.
The pinned template's fixed Type is authoritative even when rendered text wraps;
legacy manual Type values and received MSGID types are also supported. Both paths
share the same unique, case-sensitive type name and preserve existing topic IDs
and personal memberships. Template Type changes advertise an additional type;
editing/deleting a template never renames or deletes old topics or messages.

Migration 010 backfills the latest published fixed Type of each active template.
Unpublished versions, archived templates and legacy templates without a fixed
Type do not invent new topics during backfill. Existing advertised types are
retained. Migrations update derived metadata only, preserving canonical messages,
artifacts and template/message version pins.

Bundled fallback traffic and in-memory simulated deliveries do not advertise
persisted topics or appear in the subscription feed. If subscriptions cannot be
loaded/saved, the UI reports the failure rather than pretending a change was
saved. Legacy admin approval demos are separate and do not gate type subscriptions.

## PostgreSQL command directory

The source is bundled in **`database/seeds/PLADS.txt`** (29,970 command names).
This is a plaintext import file, not PostgreSQL's live data directory.
With the database running and migrated, import it on first setup or refresh it
when the source changes:

```sh
npm run db:seed:commands
# Optional: override the bundled source with another PLADS file:
npm run db:seed:commands -- /path/to/PLADS.txt
```

The default path is resolved from the script's project location, not a user's
Downloads folder. The importer skips the three-line PLADS header and blank lines,
trims names, and inserts each unique name into `commands`. Each row has a generated
UUID primary key (`id`) and a unique text `name`. Imports are transactional and
safe to rerun: existing IDs/names are preserved, and records absent from a later
file are not deleted.

Local connection defaults:

- Host: `127.0.0.1`, port: `5432`
- Database/user: `anchor`
- Password: `anchor-local-dev` (**local development only**)
- URL: `postgresql://anchor:anchor-local-dev@127.0.0.1:5432/anchor`

Override `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_PORT`
in a local `.env` file if needed. On this workstation, `.env` sets
`POSTGRES_PORT=5433` because another PostgreSQL instance already uses 5432;
use `127.0.0.1:5433` in the connection URL here. The database port is bound to loopback only.
Inside the Compose network the hostname is `postgres`, not `localhost`.
Changing database credentials after initial creation requires changing them in
PostgreSQL too; environment variables only initialize a new data volume.

Inspect the directory:

```sh
docker compose exec postgres psql -U anchor -d anchor -c 'SELECT id, name FROM commands ORDER BY name LIMIT 10;'
```

Live PostgreSQL files are stored in `/var/lib/postgresql/data` inside the container,
backed by the **`postgres_data` named Docker volume**. They are not stored in
`database/seeds/` or any Downloads folder. This existing volume is unchanged;
it persists across container/computer restarts and `docker compose down`.
**`docker compose down -v` deletes it.** Schema files in `database/init/` run only
on an empty volume. Run `npm run db:migrate` on first setup and when new migrations
are added, not on every launch. Applied migrations are checksum-tracked and must
not be edited.

Existing message screens still use their original mock messages. The template
builder searches the command directory through the reference-data API.

## Hackathon users and sessions

With `ENABLE_DEMO_LOGIN=true` in `.env`, the app presents a passwordless account
picker. Run `npm run db:seed:users` after migrations, then continue as **LT Taylor**.
The seed imports ten COMSUBLANT staff accounts from `src/lib/demo-users.ts`: the
full `CURRENT_USER` profile (login `LTaylor`) plus the people who hold steps in the
routing and release chains (Commander, Deputy, Chief of Staff, N1, N2, N3, N4,
N41 and the N6 ISSM). Each is mapped explicitly to the PLADS command
**COMSUBLANT NORFOLK VA**, reusing its ID (or creating that one directory entry on a
fresh database). Repeated seeds add missing accounts and preserve account IDs and
later edits. If no active account holds System Admin (a database seeded before the
Users tab existed), the seed restores LT Taylor's seeded roles so someone can
administer.

**Admin > Users** (`/admin#users`) lists every account and lets a System Admin add
users, change billet, unit and roles, and deactivate or reactivate accounts.
LT Taylor, YNC Nguyen and ITC Harper hold System Admin. Deactivating an account
signs it out immediately and removes it from the account picker. Admins cannot
deactivate themselves or remove their own System Admin role. This is role-based
UI gating on a passwordless demo, not real authorization.

### Roles

One ANCHOR instance serves one command. An account can hold any combination of
these roles; no combination is blocked.

| Role | What it allows | Assigned by | Demo holders |
| --- | --- | --- | --- |
| Message Viewer | Read messages, freely subscribe to available types, build briefings. Every account holds it. | Automatic | Everyone |
| Subscription Approver | Legacy approval demo; not required for message-type subscriptions | System Admin | Okafor, Chen, Ramos, Brooks, Taylor |
| Report Viewer | The Reports page | System Admin | Most accounts |
| Auditor | The Audit & Integrity page and `/api/integrity` | System Admin | Taylor, Nguyen, Harper |
| Message Admin | Transmit released traffic, manage the C2OIX circuit and workstation links, send acknowledgements | System Admin | Harper |
| Designated Release Authority | Release the message types in their designation | Release Authority, by designation | Chen, Brooks |
| Release Authority | The commanding officer: release any traffic, designate release authorities, withdraw any queued release. One per command. | System Admin | Walsh |
| System Admin | Users, roles, routing workflows and sequence settings | System Admin | Taylor, Nguyen, Harper |

Everyone can see that an acknowledgement is due and can see link status, but only
the Message Admin can send acknowledgements or change links. Sending an
acknowledgement also records the outgoing acknowledgement message in the
transmission log. Migration `008-roles-and-transmissions.sql` maps existing
accounts onto these roles: Briefing Creator and Subscription Requester fold into
Message Viewer, System Admins also become Auditors, the commander's designation
becomes Release Authority, and the demo N6 ISSM (DHarper) becomes Message Admin.

Sessions use random HttpOnly, SameSite=Strict cookies and expire after eight
hours; only SHA-256 token hashes are stored in `user_sessions`. Refreshing the
page preserves the account. Use the header menu's **Sign out / switch account**
to select another account. Switching accounts remounts mock frontend state and
previews. User-specific profile, header, audit actor and printed-user information
come from the session rather than frontend `CURRENT_USER` imports.

To add an account without the UI, insert an active row in `users` with its own unique
`login`, `name`, `command_id`, and optional profile JSON, then reload the account
picker. For example (run manually only if another account is wanted):

```sql
INSERT INTO users (login, name, command_id, profile)
SELECT 'DemoTwo', 'Demo User Two', id, '{"rank":"LT","unit":"Demo Unit"}'::jsonb
FROM commands WHERE name = 'COMSUBLANT ALT PAC';
```

**This is account impersonation for a hackathon, not proof of identity.** Anyone
with access can select an active account. Keep it local; disable demo login before
any real deployment and replace it with actual authentication and authorization.
Set `SESSION_COOKIE_SECURE=true` when serving through HTTPS; keep it false for
plain HTTP localhost. Deactivating a user invalidates their sessions immediately;
sign-out revokes the current token and switching via the API rotates it.
Directory/template GET endpoints are still public prototype data, not protected
by the client-side sign-in screen.

### Session rendering and navigation

`/login` is a public sign-in route. Workspace pages live under
`src/app/(workspace)/` (the group does **not** change their URLs). The workspace
layout reads the session on the server inside Suspense and passes a validated
initial user to the client provider. The provider always renders its route
children; it must not replace them with an effect-driven loading/login screen.
That pattern causes Next.js 16.4's **dropped segment** development errors because
the page disappears from instant-navigation validation, even when the client
later makes it visible.

`src/proxy.ts` redirects missing/revoked sessions before rendering workspace
pages; the layout and API still recheck sessions. Sign-in/sign-out perform full
navigations to discard the previous account's router/store state. Cache Components,
Partial Prefetching, and instant-navigation validation remain enabled.

Browser regression tests (database running, migrations/users seeded, demo login
and authoring enabled in `.env`):

```sh
npx playwright install chromium     # Once, unless using an installed browser
npm run test:navigation            # Starts or reuses next dev on port 3000
# Optional: use an existing Google Chrome installation instead of downloading Chromium:
E2E_BROWSER_CHANNEL=chrome npm run test:navigation
```

Run these against **next dev**, not a production server: dropped-segment diagnostics
are development-only. The tests cover signed-out deep links, login, hard refresh,
client navigation, logout, and revoked cookies, and fail on navigation-validation
errors. They revoke their own test sessions without modifying users or templates.

## Template-driven drafting and release

`/drafting` is the single message composer. Select a published template, fill its
fields, and save through `POST /api/messages`. Private drafts and approval history
survive reloads; they do not enter the ordinary Messages feed until release.
Reviewers must sign in as the actual account holding the current step. The drafter
can edit any unpublished message, including while it is under review or withdrawn.
Saving text or routing changes stops review, clears every approval, and returns
the message to drafting; it must be resubmitted before publication. Stale saves
are rejected without discarding the author's unsaved input.

Use **Customize routing** to drag command people into the chain, reorder them,
or remove them. Add/Move/Remove buttons support keyboard and touch as well.
These changes apply only to this draft, not the command's shared workflow.
The final person must still hold the appropriate release designation and role.
**Use command default** restores a fresh copy of the matching command chain.
Saved chains survive reloads and are retained across text edits and resubmissions.
The server enforces ownership, membership, roles, step order and expected revisions.

Final release atomically freezes the approved text, allocates the command serial,
and puts the message in the **Transmission Queue** (`/transmissions`). A released
message cannot be edited. Until it is transmitted, the person who released it or
the Release Authority can withdraw the release with a reason; the draft returns
to its drafter and needs fresh approvals (its serial stays used). When the
Message Admin transmits it, the same message ID is published into main's
artifact-backed message store and appears in Messages.
Existing ingestion, acknowledgements, per-user read state and shared column order
are preserved. Migration 007 additionally locks released local message records,
their saved template inputs, reference snapshots and outgoing records against
updates/deletes in PostgreSQL, not just in the UI. Publication is irreversible;
changes afterward require a new message. Read-state and acknowledgement resources
remain separate from the immutable message. Local releases use `ANCHOR-…` artifact identifiers, not invented
C2OIX receipt numbers. **Publishing locally does not perform external transmission**;
the network simulator is still separate.

For an existing checkout, run:

```sh
npm run db:migrate
npm run db:seed:users
npm run db:seed:routing
npm run db:seed:messages
```

Migration 003a preserves the first creation branch's incompatible `messages`
table as `legacy_message_creation_records` before main's schema is installed.
Migration 005 imports its saved drafts/history and any published records with
exact stored text. Legacy demo records without raw text remain archived; the
normal message seed supplies main's artifact-backed demo records without deleting
the archive. No database reset or volume deletion is necessary.

Migration 006 carries a frozen snapshot of the authored **Standard Message**
template, including its existing header TODO and manual fields. It preserves any
existing matching template and its versions. The optional
`npm run db:seed:templates` command is also safe to rerun; changing the bundled
JSON does not rewrite published versions.

Tests: `npm run test:drafting:api`, `npm run test:templates:seed`, and
`E2E_BROWSER_CHANNEL=chrome npm run test:drafting:browser` (after a production
build). Main's `test:messages:api` regression suite remains available.

## Message templates and drafts

Open **Message Templates** in the sidebar (`/templates`) to:

1. Name a template and customize the prefilled standard plaintext, preserving
   the mandatory variables and BT/NNNN framing.
2. Standard fields are locked. Configure other variables: textbox, multiline text, dropdown,
   radio buttons, boolean checkbox, checkbox group, single/multiple command
   picker, date, Zulu date/time, or autogenerated value. Use textboxes for numbers. Static choices
   use one option per line; autogenerated fields use a predefined output dropdown.
   Multiple-command pickers also offer a **Command separator** setting: semicolon
   (`; `), space, or newline. It is saved per field and used in plaintext previews,
   preserving selection order. Existing templates default to semicolon separation.
3. Test the generated form and plaintext preview, then publish the definition.

Publishing validates the entire definition server-side and atomically saves a
new template plus immutable version 1. The published library survives reloads
and supports form previews. Template creators and their command's System Admins
also get an **Edit template** button. This reopens the existing plaintext and all
field settings in the wizard; **Publish new version** appends an immutable version
under the same template ID. Existing draft version pins and saved message text
are not retargeted. Concurrent/stale edits are rejected without clearing the
editor's inputs. Repeated placeholders share one input;
variable names are case-sensitive. Only named substitution is supported—no
executable helpers, conditions, or HTML rendering. Preview values are not saved;
use Drafting & Release to create a message from a published template.

Creators and same-command System Admins can also **Delete template**, after
confirmation. This archives the template: it disappears from the library and
cannot be used for new drafts. Immutable versions, existing drafts (which remain
editable), saved inputs, history and published messages are retained. Deletion
does not erase records or restore/reseed the template.

The bundled Standard Message now uses a **textarea** for Body. Fresh databases
receive this in migration 006; migration 008 appends a corrected version for
existing Standard Message templates whose latest Body control is still a textbox.
It preserves other customizations and all older versions/draft pins. Run
`npm run db:migrate` to apply the upgrade. The original 006 checksum amendment is
explicitly allowlisted and recorded in `schema_migration_amendments`; other
applied-file checksum changes remain errors.

### Generated message line length and command search

All newly generated previews and saved message text use **at most 69 characters
per line**, applied after substituting every field. Wrap at a word separator when
possible; an unbroken string longer than 69 characters continues on the next line
without an added hyphen or lost characters. These are actual LF newline characters,
not CSS-only wrapping. Existing blank lines and short lines are preserved, and
original form inputs/reference names remain unchanged. Actual formatting is
recorded in the message's render metadata; new template profiles use version 2.

Already published messages and template versions are never reformatted. Older
unpublished drafts with overlong lines must be resaved by the drafter, which
applies wrapping and resets approvals, before they can be submitted/released.
Release publishes exactly the text reviewed, without another formatting pass.

Command pickers return **50 matches per page** (previously 25). Matching literal
text is highlighted case-insensitively in each selectable name, including repeated
matches. Next/Previous pagination uses the same 50-result page size.

### Choice output overrides

Dropdowns, radio buttons, checkbox groups, and boolean checkboxes support optional
**Generated output overrides**. Users still select the displayed labels, but the
plaintext output uses an override when provided. For example, a displayed choice
`Ready` can generate `READY FOR TASKING`; without an override it generates `Ready`.
Checkboxes use displayed states `YES` (checked) and `NO` (unchecked), each with its
own optional override. An unchecked checkbox previews its `NO` output immediately.

Blank/whitespace-only override boxes mean "use the displayed label". Nonblank
text is inserted as plaintext once—never as template syntax—then the final
69-character wrapping policy is applied. Checkbox groups map each selected option individually before
joining with the existing semicolon separator. The API stores the optional
`optionOutputs` object alongside the field, keyed by option label (or `YES`/`NO`
for checkboxes). Input schemas still validate original labels or booleans, not
replacement text. Unknown labels, invalid values and overrides on unrelated
controls are rejected. No database migration is required.

Number is no longer an authorable input type; numeric content uses text. Existing
published numeric fields can still be viewed as text without rewriting history.

### Autogenerated fields

Choose **Autogenerated** as the input type, then select an output:

| Output | Resolved value |
| --- | --- |
| Sender command | Directory command name of the signed-in session user |
| Current timestamp (Zulu) | `24 OCT 2026 1830Z` |
| Current date (Zulu) | `24 OCT 2026` |
| Current date-time group (Zulu) | `241830Z OCT 26` |

The mandatory `FM {{ Origin }}` field is locked to **Sender command**.
These fields have no editable message-form input. The preview resolves them on
the server, shows them read-only, and offers a refresh button. One server clock
instant is shared by all time outputs and repeated placeholders in a generation;
preview timestamps do not tick continuously.

**Sender command** resolves through the current session's user and that user's
`command_id` foreign key on every generation. There is no global sending-command
setting and no client-supplied user/command override. Missing, expired, revoked,
or inactive-user sessions receive HTTP 401. The user table's foreign key prevents
deleting a command that is still assigned to an account.

Only the generator key and version are saved with the template—not a command
name or a timestamp. Bindings use `generator: { key, version }`, with keys
`sending-command`, `current-timestamp`, `current-date`, or `current-dtg`.
The displayed name **Sender command** retains the stored `sending-command` key
for compatibility with existing templates.
New timestamp/date bindings use version 2 for military presentation; sending
command and DTG use version 1. Published version-1 ISO date/timestamp bindings
remain supported without rewriting immutable templates. ISO timestamps are
already 24-hour UTC with a `Z` suffix, never local or AM/PM.
The shared clock and new manual datetime definitions use explicit Zulu time:
`DD MMM YYYY HHMMZ`. Date/time inputs use text rather than browser-local time
pickers, so they do not depend on OS 12-hour display settings. Machine timestamps
and storage retain unambiguous ISO UTC/Z; display metadata uses military format.
Autogenerated fields must have `required: true` and empty `options`. They are
excluded from the user-input JSON Schema, whose `additionalProperties: false`
rejects supplied autogenerated values. The preview API ignores client-provided
clock, command context, and resolved values.

No database migration is needed: generator bindings live in versioned JSONB
field definitions. The server resolver is reusable for future draft creation;
that endpoint must resolve again using authorized command context and persist
resolved values/time with the draft's rendered snapshot. Preview output must
never be trusted as the authoritative creation-time value.

**Local prototype only:** publishing requires `ENABLE_TEMPLATE_AUTHORING=true`
and a valid demo session. New writes record the session user's UUID as creator,
not `local-prototype` or a submitted username. Existing creator strings are kept
for historical records. Set the flag to `false` to disable publishing. Before
deployment, replace passwordless demo sessions with real authentication and
role/command authorization. Compose binds the app and database to loopback.
Do not expose the demo server or enter operational/classified information.

For local Node, set `DATABASE_URL` (or standard `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER`, `PGPASSWORD` variables). Compose supplies internal PostgreSQL connection
settings separately. Never use `NEXT_PUBLIC_` for database credentials; `.env`
files are excluded from Git and Docker build context.

REST endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/users` | List active demo accounts (requires demo login to be enabled) |
| `GET /api/session` | Current session profile, or null when signed out |
| `GET /api/admin/users` | List all accounts, active and deactivated (System Admin) |
| `POST /api/admin/users` | Add an account: `{ login, rank, surname, billet, unit, email?, roles }` (System Admin) |
| `PATCH /api/admin/users/{id}` | Change `billet`, `unit`, `roles` or `active` (System Admin; Designated Release Authority is left to the Release Authority) |
| `PATCH /api/routing/designations` | Replace release designations `{ revision, authorities }` (Release Authority) |
| `GET /api/subscriptions` | Available Type/MSGID topics (including zero-message template types), counts and current-user preferences |
| `PUT /api/subscriptions/:id` | Subscribe the session user to an existing topic (idempotent, no approval) |
| `DELETE /api/subscriptions/:id` | Unsubscribe the session user (idempotent) |
| `GET /api/messages?view=subscriptions` | Published feed restricted to the session user's subscribed types |
| `GET /api/transmissions` | The command's transmission queue and log |
| `POST /api/transmissions/{id}` | `{ action: "transmit" }` (Message Admin) or `{ action: "revoke", comment }` (releaser or Release Authority) |
| `POST /api/session` | Passwordless demo sign-in using `{ userId }` |
| `DELETE /api/session` | Revoke the current session and clear its cookie |
| `GET /api/message-templates` | List up to 100 active published templates |
| `POST /api/message-templates` | Validate and publish `{ name, description, text, fields }` |
| `POST /api/message-templates/preview-generated` | Resolve automatic fields for a validated definition; no persistence |
| `GET /api/message-templates/:id` | Read the latest published template definition |
| `PATCH /api/message-templates/:id` | Publish a new version with `{ expectedVersionId, definition }`; creator or same-command admin only |
| `DELETE /api/message-templates/:id` | Archive a template (204); creator or same-command admin only; preserve versions and existing messages |
| `GET /api/reference-data/commands?q=...&cursor=...` | Search command names, 50 results per page |

Each field supplies `name`, `control`, `required`, and `options` (an empty array
for non-static controls), plus `generator` for autogenerated fields only.
Multiple-command fields optionally supply `separator: "semicolon" | "space" | "newline"`;
other controls reject that setting. The API constructs its own JSON Schema, UI definition,
output definition and source bindings; client-supplied schemas are never trusted.
It rejects malformed placeholders, missing/duplicate variables, unsupported
controls, invalid options, and oversized bodies. Command pickers bind to the
allowlisted `recipient-commands` version 1 source, not arbitrary URLs.

Checks:

```sh
npm run test:templates
npm run build
npm run test:templates:api
```

The API integration suite creates a temporary database and local production server,
then removes them. It does not add templates to the working database.

See [`database/README.md`](database/README.md) for schema details, transaction rules,
remaining application-level validation, and rollback-only schema tests.

## Screens

| Route | Screen |
|---|---|
| `/` | Home: mandatory acknowledgements, status changes, latest traffic |
| `/messages` | Messages inbox with built-in search, filters and preview pane |
| `/templates` | Plaintext template builder, field configuration, preview and publishing |
| `/messages/[id]` | Message detail: official text, AI summary (separate), metadata, integrity, attachments |
| `/messages/[id]/print` | Official print / PDF rendition with integrity block |
| `/subscriptions` | Available template/message types with personal, immediate subscribe/unsubscribe |
| `/briefings` | Tailored Briefing Builder with live preview |
| `/briefings/generated` | Generated briefing |
| `/watch-turnover` | Redirects to Watch Officer Home and opens Watch Handoff |
| `/drafting` | Drafting & Release: fill a published template, save a private draft, and approve each step as its signed-in holder; only released messages enter the Messages list |
| `/network` | Comms & Network: C2OIX circuit, ANCHOR server and three workstations. The Message Admin releases example traffic one message at a time, breaks and restores links, and resets messages for redelivery. (`/simulators`, `/topology` and `/offline` redirect here.) |
| `/reports` | Acknowledgement accountability and traffic measures |
| `/audit` | Audit & Integrity: append-only, hash-chained log with a recompute check |
| `/admin` | Tabs: legacy subscription approval demo, alert rules and access groups; Users; Routing & Release (workflows, release authority, transmission settings at `/admin#routing`; the old `/admin/routing` redirects there) |
| `/profile` | Profile & Settings |

## How the requirements show up

The UI follows the mockups. Where they differ from the ANCHOR requirements package, the requirements win:

- **COMSUBLANT first.** Mock traffic and the user are submarine force, not surface.
- **Precedence** (FLASH, IMMEDIATE, PRIORITY, ROUTINE) on every message. FLASH and IMMEDIATE drive mandatory alerts.
- **Lifecycle status** labels for AMENDED, CORRECTED, SUPERSEDED, CANCELLED and EXPIRED, with links to the replacing message and a banner on the message itself.
- **Mandatory acknowledgement** with due time and escalation, a site-wide alert strip, and a roll-up in Reports.
- **Personal pub/sub feeds.** Anyone can subscribe/unsubscribe to published Type/MSGID topics. The inbox selector filters by these saved preferences; All Messages remains unchanged. Legacy approval demos are not used by this flow.
- **Integrity.** Each message shows its C2OIX ID and SHA-256 from ingestion, and the print rendition carries the same block.
- **AI summaries** are dashed, purple, labeled "Not authoritative", and never mixed into the official text.
- **Disconnected / EMCON.** Actions taken offline are queued and replicate on sync, with bandwidth-aware priority.
- **Audit.** Every action in the prototype is written to the audit log. Each event is chained to the one before it by SHA-256, and Audit & Integrity recomputes the chain and names the first break.
- **No Reply / Forward.** The mockups show them, but releasing traffic stays with Designated Release Authorities, so the prototype offers Share Link instead.
- **Routing and release.** Outgoing traffic follows an admin-defined chain matched by message type and originator. Steps are held by people on the roster; only the Release Authority or a designated release authority can release, the DTG and serial are assigned at release, and the Message Admin transmits from the queue.
- **Circuit = EMCON.** Breaking the C2OIX circuit on Comms & Network is the same switch as offline mode, and the only control for it. Connection status and the sync queue live in the header bar; queued items sync automatically when the circuit returns. Releases are held at the ANCHOR server and C2OIX defers inbound traffic until it returns.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, lucide-react icons. PostgreSQL 17 persists commands, templates, users/sessions, drafts, approvals, routing configuration, message artifacts, read state and command acknowledgements; REST endpoints use `pg`. Other prototype preferences and the network simulator remain in memory. Fictional seed data lives in `src/lib/data.ts`.


## Watch Handoff on Home

Select **Watch Officer** on Home and expand **Watch Handoff**. Other responsibility
views do not show the handoff controls. Traffic, acknowledgements and message
deadlines remain in Home's existing sections rather than a duplicate turnover page.
The old `/watch-turnover` address selects Watch Officer and opens the handoff without
changing the user's saved default view.

After updating, run `npm run db:migrate` to apply migration 013. A System Admin
uses **Station setup** within Watch Handoff to create a watch station/team and
explicitly assign at least two active command users. No duties or station records
are automatically seeded. View selection and application roles do not substitute
for official station assignment. Administrative privileges alone do not allow
editing/acceptance. Report Viewer, Auditor, and Release Authority can read their
command's stations when command visibility is enabled; System Admin can configure
and inspect them regardless of that visibility setting.

An assigned outgoing officer starts a Draft, names a different assigned incoming
officer, and enters the incoming watch's start/end as `DD MMM YYYY HHMMZ` in UTC.
Save narrative notes, structured issues, source links, and checklist updates,
then mark Ready for review. Only the named incoming officer may accept. Acceptance
requires an explanation for any incomplete checks and records server timestamps.
Ready records must be returned to Draft by the outgoing officer before editing.

Accepted records are locked. Assigned participants can append corrections with
reasons; the original record remains intact. New handoffs inherit unresolved issues
from the station's latest accepted record, preserving owner, status, source snapshot,
lineage, and predecessor history. Resolved issues do not carry forward. Acceptance
does not acknowledge messages or complete substantive tasks. Legacy in-memory
notes are explicitly labeled and are not silently imported into formal records.

The selector initially favors an active station assigned to the current officer.
Use Refresh handoff to load another session's changes; unsaved edits are retained
on conflicts and require an explicit discard before refresh/history changes.
Offline mode disables mutations and never queues a formal acceptance.

Validation commands:

```sh
npm run test:handoff
npm run build
npm run test:handoff:api
E2E_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:handoff:browser
```

The integration runner creates and drops its own test database and does not modify
live users, messages, or watch assignments. Demo sign-in remains passwordless
account selection, not production authentication.

## Watch Summary and rotating teams

Under **Home → Watch Officer**, open **Watch Summary → Open full summary**.
It follows Home's received period (last 24 hours by default). Expand **Choose exact
reporting period** to enter UTC start/end times using `DD MMM YYYY HHMMZ`, or return
to Home's period. **Upcoming horizon** independently controls forward deadlines,
defaulting to 24 hours after the reporting end. Home currently uses its labelled
prototype/demo reporting clock; a custom period can cover actual current dates.

The summary shows received traffic and counts by recorded Type/MSGID, linked
version/lifecycle changes, outstanding acknowledgements, structured requirements,
response follow-ups, and overdue/upcoming/undated work. Older unresolved work is
included even when received before the selected period. Outstanding state is
current; this is not a reconstruction of historical acknowledgements or lifecycle
state. Missing requirements are not inferred from keywords or generated by AI.
Review the source message for requirements not represented in structured data.

**Watch action notes** supports free text, internal-task or response-follow-up
kind, responsible owner, optional UTC deadline/source, and watch-reported status.
Personal notes are visible only to their creator, including when a System Admin
views the team. Team notes use existing station read permissions; only current
assigned officers at active stations can create/edit them. Each saved revision
records the acting user, time, and full prior content. Conflicting edits preserve
local input and require cancel/refresh before retry. Note visibility is fixed on
creation; no automatic copying of private notes to a team occurs. Completing a
note does not acknowledge a message, transmit a response, or close an official
requirement. Offline saves are disabled; there is no queued write fallback.

A System Admin can open **Watch Handoff → Station setup → Set up Tang, Wahoo &
Bowfin** to create the three rotating teams at one station in a single transaction.
Choose at least two active same-command officers for each team. Officers may serve
on multiple teams. Existing stations and assignments remain intact; there is no
automatic roster assignment or rotation scheduling. Individual teams can still be
managed through the existing station form.

Apply migration **014-watch-actions.sql** with `npm run db:migrate`. The expanded
`test:handoff` and disposable `test:handoff:browser` suites also cover summary
boundaries, team setup atomicity, private/shared action isolation, collaboration,
revision history, independent time controls, and mobile width. Summary queries
show up to 500 recent accessible notes and warn when older notes are omitted.
