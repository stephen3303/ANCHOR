# Watch summary and rotating teams

Extend PR #44 without merging. Supply administrator-created Tang, Wahoo, and Bowfin teams for one station; no automatic officer assignments or live-data seeds. Keep existing stations intact.

Add a compact Watch Officer Home summary with expanded reporting start/end (explicit UTC), a separate forward deadline horizon (24 hours by default), traffic/type counts, recorded changes, outstanding acknowledgements, recorded requirements, and overdue/upcoming/undated work. Include older unresolved work regardless of receipt period. Do not infer response requirements from keywords or use AI.

Add persistent personal and team action notes: free text, explicit internal-task/response kind, owner, optional due time/source, and watch-reported status. Personal notes are private; team notes require assigned officers for writes and existing station permissions for reads. Preserve attributed revision history, reject stale writes, and never alter official message/acknowledgement state. Distinguish report-period activity from current outstanding state.

Validate boundaries and classification with unit tests; exercise authorization, isolation, stale edits, team setup atomicity, and persistence in the disposable API/browser runner. Build and check mobile layout. Apply only additive migration 014 locally; push updates to the existing PR after validation; do not merge pending independent review.
