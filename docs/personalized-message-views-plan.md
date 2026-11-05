# Personalized message views on Home

## Goal

Merge My Briefing into Home so users can switch between their official duties
and personal message views. This initial commit records the agreed scope; it
does not change application behavior.

## Agreed behavior

- Home displays the selected responsibility view. Absorb the existing Briefings
  navigation into Home, with a Manage views entry for configuration.
- Administrators assign official duties. Users can create, name, customize, and
  save additional personal views.
- Initially select the primary assigned duty. Users choose which available view
  is their default; persist that choice across sign-ins. Switching views does
  not silently change the saved default.
- Include individual, department, and command-wide records, labeled Mine,
  My department, and Command-wide. Explain why each record is included.
- Default the reporting period to the last 24 hours. Show exact UTC/Zulu bounds
  and preserve an explicitly selected period when switching views.
- Support reading messages and acknowledging receipt where the current user is
  authorized. Retain the existing server-enforced acknowledgement permissions;
  a view or duty assignment does not grant the Message Admin application role.
- Keep mandatory acknowledgements, overdue assigned tasks, and command-designated
  alerts visible across views and outside ordinary relevance/time filters.
- Start with a dashboard of recorded data, not an AI-generated narrative.
- Keep Watch Turnover as a separate handoff workflow.

## Home layout

1. View selector, reporting period, Manage views, and Set as default.
2. Needs attention: mandatory alerts, required acknowledgements, and overdue work.
3. Due next: upcoming recorded deadlines and older unresolved obligations.
4. New and changed: relevant new traffic, corrections, and replacements.
5. Searchable supporting message traffic with source drill-down and relevance labels.

## Implementation sequence

1. Inspect current Home, briefing routes, users, roles, topic metadata, message
   state, and department/command relationships on this branch. Preserve existing
   publication, transmission, permissions, and message-store functionality.
2. Add persistent official duty assignments, user-owned personal view definitions,
   and a per-user default view using additive migrations and authenticated APIs.
   Duty/view identifiers must remain separate from authorization roles.
3. Define relevance using explicit assignments and available metadata. If the
   backend lacks a department or task-assignment relationship, surface that gap
   rather than inferring ownership or displaying invented assignments.
4. Implement the Home selector and shared dashboard, with mandatory records
   assembled independently of personal filters. Reuse existing source readers.
5. Add view management, administrator duty assignment, and safe fallback when a
   user's default duty/view is removed. Retire the redundant Briefings entry
   without breaking existing deep links.

The first collateral-duty names and their relevance rules still need to be
selected. Watch Officer is the initial named example; do not invent official
assignments or automatically seed unconfirmed collateral duties.

## Acceptance criteria

- Home opens the user's saved default; first-use fallback is clear and predictable.
- Official assignments can only be maintained by authorized administrators.
- Personal views and preferences are isolated by user and persist across sign-ins.
- Switching views updates relevance without granting access, changing the default,
  or silently resetting the chosen reporting period.
- Individual, department, and command-wide matches are distinguishable and sourced.
- Mandatory records remain visible even when they do not match the selected view.
- Reading and permitted acknowledgements work; acknowledging never completes a task.
- Empty, unavailable, stale, and offline states are distinguishable.
- Removing a default view/duty yields a valid fallback with an explanation.

## Validation strategy

Use unit tests for relevance, mandatory inclusion, time bounds, deduplication,
and default selection. Use isolated PostgreSQL/API tests for user ownership,
administrator assignment, persistence, and unchanged acknowledgement permissions.
Use authenticated browser tests for initial/default selection, view switching,
personal view creation, source drill-down, account isolation, and mobile layout.
Run the build/type checks and relevant existing message/navigation tests when
implementation changes are introduced. This planning-only commit requires a
documentation diff check, not application test execution.
