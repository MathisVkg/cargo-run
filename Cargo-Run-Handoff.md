# Cargo Run v0.6.1 — Task 06.1 handoff

Completion reliability and navigation refinement in `C:\Users\zeyros\Documents\repository\cargo-run`. The starting v0.6.0 working tree was clean. Pre-edit copies are under ignored `work/task061-backup/`. No dependencies, new input hooks, route/market/financial system, commit or installer were added. OCR-first imports, automatic capture, manual cargo operations/undo, ship inventory and maintenance remain.

## Investigation and root-cause findings

The v0.6.0 processing chain was traced through log polling/checkpoints → parser → immutable mission-event storage → pending mission projection / ledger reconciliation → SQLite save → snapshot broadcast → Dashboard/Manifest/History.

Two concrete gaps were reproduced:

1. The parser recognized `Contract Complete:` but ignored the explicit `MissionEnded` / `EndMission` terminal records described in the task.
2. Existing completion reconciliation required the ledger contract's MissionId to equal the event's MissionId. A valid OCR-created contract can intentionally remain unbound when only title-level log evidence exists. Completion then updated secondary pending evidence (or stayed unresolved without acceptance), while the active OCR ledger record remained active. No short lifecycle association issue was surfaced.

Existing verified MissionId notification completion already worked; changing cargo quantities or marking everything delivered would not fix an identity gap. The new workflow closes the gap without guessing from title, reward or nearest time.

**Specific gameplay-session limit:** the task supplied event fragments and the reported MissionId, not the November 2 log file. Read-only inspection of the standard local Cargo Run database found no relevant contract/events and no configured monitor path in that profile. Therefore this work cannot prove which gap affected that particular running profile, whether monitoring was active, or the exact formatting of its terminal records. No actual user database or log was modified. The findings above are code-traced and synthetically reproduced; they are not a claim of replaying the user's mission or live Star Citizen validation.

## Supported parsing and evidence

The supported, explicitly tested shapes are:

- Existing `Contract Complete: <title>` notification with a valid `MissionId: [UUID]`.
- `MissionEnded ... MissionId: [UUID] ... mission_state MISSION_STATE_COMPLETED`.
- `EndMission ... MissionId: [UUID] ... CompletionType[Complete] Reason[Mission Ended]`.
- Explicit abandonment: `Contract Abandoned:`, `MISSION_STATE_ABANDONED`, or `CompletionType[Abandon|Abandoned]` with the same supported EndMission reason. These are synthetic supported formats, not a claim that every game build emits them.

The terminal parser accepts bracketed MissionId/mission_id with optional colon/equal separator, and optional brackets around the mission_state value. It requires a concrete UUID and explicit terminal state. Generic failure, cancellation, partial state names, other EndMission reasons and unidentified terminal records never close contracts by inference. Unsupported failure formats need exact evidence before adding automatic handling.

Completed notifications and both terminal record forms normalize to the same semantic kind + MissionId event identifier. Repeated imports, restart and different presentation/timestamp duplicates do not produce additional transitions. Later duplicate evidence may fill a missing title or timestamp; it cannot overwrite an already known event time. Timestamp enrichment updates the same audit row while preserving its original previous status.

`completedAt` is the actual recognized event timestamp when available. Missing event time remains unknown, with receipt time stored separately in lifecycle metadata/activity. Arrival order is not treated as proof of the actual completion time. The first terminal status is retained; contradictory later states do not reopen or flip an already closed contract. Raw variants remain bounded evidence.

## Association and lifecycle behavior

An already associated MissionId receives supported lifecycle updates directly, without an OCR rescan or manual editor. Startup and OCR confirmation also reconcile saved verified terminal events, including schema-6 backlog. No new active placeholder contract is created for a lifecycle event.

For an unbound active contract, automatic association requires a unique, complete, one-to-one agreement of **non-fallback objective identifiers and cargo details** against a pending mission projection. Commodity, destination, required quantity and available pickup must agree. Multiple plausible contracts, reused objective IDs in other pending/historical ledger missions, incomplete mappings or title/cargo-only agreement do not establish identity.

Otherwise Dashboard presents a bounded **mission lifecycle association** issue when an actionable active candidate exists:

1. Expand the completion/abandonment issue.
2. Choose the tracked contract; candidates display its name, required/onboard SCU and ID suffix.
3. Confirm these are the same in-game mission.
4. Apply association and closure.

Title-only agreement is explicitly labeled unverified and requires that user confirmation. Stale evidence/contract versions are rejected. Synchronous UI submission guards prevent double clicks. A successful resolution preserves the OCR contract/objective IDs and physical inventory, adds the verified MissionId association to linked evidence metadata, records authorization and applies the event atomically. Raw OCR/screenshots/observations and manual corrections are not rewritten. Distinct missions are never merged merely because their details match.

Issue presentation is at most 20 missions with up to 10 candidates each, derived from the latest 200 semantic terminal records; repeated events do not create duplicate issues. Dismissal is persisted as a bounded 200-MissionId exclusion list and does not delete raw events. An unmatched event without a candidate remains stored evidence without a placeholder. Closed/abandoned/superseded/sample contracts are excluded from routine candidates. The v0.5.3 title-only pending exclusion remains unchanged.

Contract Details → **Mission Lifecycle** shows bounded lifecycle activity, event time and preserved-cargo explanation; technical association/event identity is collapsed under Advanced.

## Cargo and earnings safeguards

Closure changes lifecycle status/time/metadata, not physical inventory:

| Scenario                                 | Result                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A: 8 required, 8 delivered, zero onboard | Completed; recorded remaining delivery and onboard stay zero                                                     |
| B: 8 required, 5 delivered, 3 onboard    | Completed; 3 remain assigned to the same ship, consuming recorded capacity; historical discrepancy stays visible |
| C: no loading/delivery recorded          | Completed when identity verified; quantities/evidence remain unconfirmed, no fabricated cargo operations         |
| D: duplicate terminal records            | One semantic event/transition/audit; no duplicate issues, negative cargo or earnings                             |
| E: verified abandonment                  | Abandoned; loaded cargo, ship assignment, audit/history remain; no earnings invented                             |

Closed contracts stop contributing to active planning. Manifest's existing **Retained onboard inventory** exposes explicit unload/correction controls for closed cargo. Finish Run and undo behavior remain as in v0.6.0; closure itself never fabricates delivery or unloads cargo.

`Awarded <amount> aUEC` Added notification records are retained as bounded **Unattributed reward** evidence, including empty MissionIds. Neither reward amount nor proximity to completion establishes attribution. Confirmed earnings remain unchanged for all completion/abandonment/award paths. This release does not implement reward confirmation or financial reconciliation.

## Persistence and maintenance

Additive SQLite **schema 7** creates:

- `lifecycle_evidence`: at most 200 raw terminal/reward variants with parsed metadata and source context. Canonical mission events remain in the existing authoritative mission_events table.
- `lifecycle_activity`: contract-owned lifecycle audit, ON DELETE CASCADE, one semantic lifecycle/contract ID with timestamp enrichment in place.
- `unattributed_rewards`: canonical unique raw award evidence retained beyond diagnostic eviction, with no mission attribution or earnings effect. Full reset intentionally clears it; consistent backups include it.

Contract JSON adds lifecycle event metadata and optional association authorization. Existing contracts/objectives, cargo progress, screenshots, settings, checkpoints, monitoring preferences and history are preserved. Older binaries refuse schema 7; rollback requires a pre-upgrade snapshot.

Event processing, association, evidence annotation, audit and domain state use existing main-process SQLite transactions and rollback handling. Trusted-sender fixed IPC adds only resolve/history methods. Snapshot broadcasts refresh all pages immediately.

Consistent online SQLite/evidence backups include the new tables. A/B cleanup cascades removed-contract lifecycle audit, preserves active evidence and keeps authoritative log evidence under the existing archive policy. Full RESET deletes lifecycle tables/dismissals alongside tracking data, checks foreign keys, drains workers and leaves monitoring stopped across restart. Backup restore remains a manual whole-snapshot operation; no complete filesystem rollback is claimed.

## Navigation

One persistent sidebar replaces the old temporary navigation drawer.

- Top: Dashboard, Manifest, Contracts, History, Scan History.
- Bottom: Settings plus a 32px icon-only compact/expanded toggle; no visible Collapse navigation text. Toggle and menu icons retain labels/tooltips and 19px alignment.
- Expanded (212px): icons/labels; Settings and toggle share a bottom row.
- Compact (62px): icons only; Settings/toggle stack at the bottom.
- Hamburger: hides either visible mode completely; reopening uses compact mode. It no longer duplicates the compact/expanded toggle.
- At widths below **1200px**, automatically hide without overwriting the saved wide preference. Reopening within this band uses compact mode temporarily and the hamburger hides it again.
- At 1200–1399px constrain to compact; expansion becomes available at 1400px+. The compact toggle is visibly disabled below that width, with an explanatory tooltip.
- Returning to a wider window restores the saved mode; wide explicit hidden/compact choices persist across restart. Narrow reopening is temporary, not forced expanded.
- Selecting a page, Escape or an outside click does not dismiss a persistent sidebar. Existing modal Escape/outside/dirty-edit safeguards remain.
- No width animations, overlapping drawers or additional hide/pin controls. Native window controls, drag regions, theme and available content width remain intact. Windows minimum remains 1100 × 700, where automatic hiding now has a practical effect.

## Files created and modified

| Area                      | Files                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New parser/reconciliation | `electron/main/log/lifecycleParser.ts`, `electron/main/lifecycle.ts`                                                                                                     |
| Existing backend          | log/parser.ts, log/reconcile.ts, trackingService.ts, storage/database.ts, storage/maintenance.ts, main/index.ts                                                          |
| New shared types          | `src/types/lifecycle.ts`; additive models/tracking/desktop types                                                                                                         |
| New UI                    | `LifecycleIssues.tsx`, `LifecycleHistory.tsx` in components/contracts                                                                                                    |
| Existing UI               | Dashboard, ContractDetails, Navigation, TopBar, App, utils/navigation, global CSS, renderer store                                                                        |
| IPC                       | electron/preload/index.ts, src/types/desktop.ts                                                                                                                          |
| Version/scripts           | package/lock root version only, native manifest, App/Settings labels, test:lifecycle:desktop                                                                             |
| Tests                     | New lifecycle.test.ts and lifecycle-desktop.cjs; schema-version assertions and existing navigation helpers/geometry assertions updated to the requested persistent model |
| Documentation             | README and this handoff                                                                                                                                                  |

No dependency versions changed. Existing parser/identity/cargo/queue/input tests remain, with intended navigation/schema assertions updated.

## Verification executed

- TypeScript validation, lint, **293 tests / 22 files**, and production build pass: 272 prior tests plus 21 lifecycle regressions.
- Unit cases include normalization, real-time/receipt distinction, A–E, exact IDs, title-only ambiguity, unknown/unmatched lifecycle events, late association, reward isolation, raw enrichment, repeated/restarted events, saved schema-6 recovery, reused IDs, transaction rollback, reset/backups and FK integrity.
- New `node tests/lifecycle-desktop.cjs`: actual Windows Electron with isolated userData and a synthetic owned Game.log. Tests native monitoring/polling → event normalization → issue → explicit association without rescan → status/audit/UI; automatic verified completion/abandonment, cargo/ship discrepancies, reward/duplicate protection, persistence and integrity.
- New navigation workflow checks 1440 × 900, 1100 × 700 and maximized windows; top/bottom geometry, icon-only toggle, hidden content width, compact reopening, expansion constraints, saved preference restoration, drag/window security regressions.
- Existing Windows alignment, polish, Fleet/manual, tracking, automatic import, OCR review, cargo progress and data-management suites pass on the v0.6.1 build. Navigation helpers/assertions now test the new requested behavior, while card geometry, dialogs, evidence and cargo workflows remain covered.
- Existing `automatic-desktop.cjs` passes with its native synthetic fixture: live acceptance → delayed screenshot capture → offline OCR; unchanged-screen detection, stop/cancel and retention. This verifies a normal test application, not Star Citizen.
- Screenshots visually inspected: ignored `work/navigation-{expanded,compact,narrow}-v061.png`, `lifecycle-association-v061.png`, `lifecycle-retained-v061.png`, `lifecycle-history-v061.png`.
- All destructive cleanup tests use temporary profiles/databases and synthetic log files. The standard user database was inspected read-only for diagnosis; no live user database/log mutation was executed.

**Still unverified:** exact November 2 raw record/profile association, new live gameplay completion/abandonment formats, physical in-game shortcut, Vulkan/exclusive-fullscreen capture and fresh screenshot recognition. Listening/registration is not proof of callback delivery. User-reported v0.6.0 gameplay success is context, not new v0.6.1 verification.

## Exact Star Citizen manual tests

1. Preserve a closed-app database/captures backup before upgrading. Launch v0.6.1; confirm old contracts, history, objectives, per-ship cargo, favorites, shortcuts and Game.log settings survived schema 7.
2. Select the correct Game.log and explicitly start monitoring. Confirm ONLINE and inspect Advanced diagnostics/source path. Monitoring must start before mission completion; historical import remains explicit.
3. Accept a new hauling mission and capture its accepted Mobiglas screen. Verify required routes/quantities, OCR evidence and whether Details → Advanced shows a MissionId. Acceptance/title alone need not associate an OCR-only contract.
4. Record actual loading/delivery. Complete the mission in game with all cargo recorded delivered. If MissionId is verified, verify it moves automatically to History with the log event time; no rescan/manual editor should be needed.
5. If identity remains unbound, Dashboard should show a completion association issue only when there is an actionable candidate. Inspect the screenshot/mission and choose the correct contract, confirm identity, then apply completion. With two identical active missions, choose deliberately; the app must not guess.
6. In an intentionally controlled test, let the mission close while Cargo Run still records 3 SCU onboard. Verify History retains required/delivered/loaded values and ship assignment, active planning excludes it, onboard capacity still includes it and Manifest offers unload/correction. Do not use the app's record as a verified game inventory reading.
7. Repeat with no recorded cargo operations: completion may close a verified mission, but loading/delivery must stay unknown rather than becoming fabricated delivery. Inspect Cargo Activity and Mission Lifecycle separately.
8. Observe duplicate MissionEnded/EndMission/Contract Complete entries, pause/restart and intentionally import history. Verify one lifecycle audit/status transition, stable cargo and no duplicate issues.
9. Test abandonment only if your game emits one of the explicit supported abandonment records. Verify closure/inventory preservation. If the game uses another failure/cancel format, inspect retained raw diagnostics and leave it for evidence-based support; do not assume it means Abandoned.
10. Inspect an Awarded notification with empty MissionId: confirmed earnings must remain unchanged regardless of matching amount/time.
11. Test wide expanded/compact bottom controls, hamburger hide/reopen, minimum-width automatic hiding and compact reopening, maximized geometry and restart preferences. Ensure Settings remains reachable and window buttons/drag regions work.
12. Repeat your physical shortcut and automatic/manual screenshot tests in the actual Star Citizen renderer mode. Check callback/capture delivery, not just shortcut registration. No real-game pass is claimed by this handoff.
