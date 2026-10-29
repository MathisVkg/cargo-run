# Cargo Run v0.4.1 — Task 03B.1 handoff

Work remains exclusively in `C:\Users\zeyros\Documents\repository\cargo-run`. The latest local Phase 3B work was inspected and preserved; no public branch was substituted. Existing changes were backed up before edits under ignored `work/task03b1-backup/`. No commit, PR, installer, dependency addition or live-profile migration was performed.

## 1. Root causes of excessive review

The v0.4.0 workflow implemented the earlier requirement for explicit review on every save. It also:

- Marked every objective list potentially incomplete, even with a well-established complete panel.
- Required Check Changes plus acceptance, incompleteness and association confirmations for ordinary valid scans.
- Offered all ledger history in the main target list.
- Rendered objective mapping, original evidence and a full editor in the default path.
- Created incomplete active Game.log placeholders independently of OCR, forcing users to reconcile two representations.
- Seeded the advanced linked-capture editor with all existing rows, which was unsuitable as a normal partial-update workflow.

The correction is an automatic eligibility path using the existing transactional review planner, with compact exceptions. The full editor remains available only by explicit Advanced action.

## 2. Automatic OCR creation and enrichment

Recognition completion and Reprocess Saved OCR invoke `TrackingService.processScan`. `inspectScan` evaluates structural field validity, supported Accepted state, layout/quantity coverage, active identity candidates and unresolved conflicts. It does not use an arbitrary confidence percentage.

Coverage now distinguishes Established and Partial. It can be supported by independent description totals or by a positioned objectives heading and complete delivery/collection pairs ending with clear space before the action bar. Scroll/clipping/truncation/provisional or ambiguous rows prevent layout completion. A verified known objective mapping may support a partial update to an existing ledger record while preserving unseen rows and the observation's incomplete flag. Matching a pending log row alone does not establish a complete list for new ledger creation. A changed quantity on an otherwise similar row becomes a conflict rather than an appended duplicate.

No candidates plus a valid established accepted scan creates an OCR-only contract with unknown acceptedAt. A unique active MissionId/title/objective match enriches/promotes that identity. A previously verified binding updates its contract. Material conflicts wait. Title-only log context, multiple candidates and repeated identical OCR-only instances receive compact choices.

Offers never auto-import. Ambiguous acceptance needs confirmation. Missing required data, unproven coverage, invalid/rejected frames, sample mode and closed identity/lifecycle issues remain pending or failed. New recognition does not silently change manual corrections or reduce delivered progress.

The existing planner commits domain/objectives, screenshot association, audit and capture outcome in one transaction. Audit authorization distinguishes Automatic, Issue resolved and Reviewed. Automatic links have an explicit AutomaticCreate/AutomaticUpdate association type. In-memory state is restored on failure; OCR evidence remains retryable.

## 3. Game.log responsibility and schema 5

Schema 5 adds:

```sql
CREATE TABLE pending_log_missions (
  mission_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
```

Migration reconstructs this secondary projection from immutable mission events, applying accepted identities before earlier objective/completion events. Existing active/incomplete/closed ledger rows, run snapshots, captures, links, corrections and checkpoints are not deleted, moved or bulk-converted.

A new log acceptance records its MissionId/title/known timestamp in pending storage. Objective and completion events update that projection. No Dashboard contract or current-run membership is created just from acceptance. A supported OCR association materializes/enriches the canonical ledger record. Existing saved MissionId-bound contracts continue receiving their objective/completion events.

Acceptance without a supported timestamp retains null; receipt time remains in the immutable event and capture time stays separate. First-start checkpoint behavior, partial lines, import deduplication, rotation/error recovery and post-commit optional capture triggers remain.

Schema 4 evidence/audit relationships are unchanged. Coverage and import outcomes are additive JSON metadata. Older binaries refuse schema 5 without erasing it; rollback uses a closed-app pre-upgrade backup.

## 4. Matching, partial captures and duplicates

Routine candidates are active, non-sample and non-superseded records. Closed/abandoned history is available only through Advanced recovery; it is not an endless default list. The normal UI uses titles, cargo and time/source context instead of UUIDs.

Verified MissionId is definitive. Unambiguous objective agreement plus title supports a unique active log match. A capture trigger is never sufficient proof. Different MissionIds cannot be merged. Multiple identical OCR-only instances wait for an existing/separate decision.

Visible rows are mapped to unique known rows using stable IDs or supporting tuples. Unseen stored rows remain untouched; they are not inserted into the correction form and need no unrelated field repair. Distinct identical rows are not merged or appended by default. Ambiguous objective identity is deferred to explicit editing.

CaptureId bindings and audit submission hashes preserve idempotency. Reprocessing the same observation cannot create another contract. Additional verified screenshots enrich the same identity and preserve evidence. Changed OCR/target versions reject stale issue resolutions.

If later log evidence makes an OCR-only association ambiguous, the original capture receives a compact identity choice. Choosing the matching log record redirects current cargo/evidence to that identity, retains the source record as superseded and preserves historical snapshots. A source containing manual corrections requires explicit Advanced consolidation. Unrelated events do not reopen an already-resolved choice.

A pending completion before identity verification is retained rather than guessed onto an unrelated OCR-only contract. A closed matching case is explicit recovery. After verified association, completion updates only that MissionId and does not fabricate earnings.

## 5. Scan History & Issues

Normal entries show recognized title, SCU, reward, capture time, preview, Imported/Updated outcome and a clear Dashboard/Manifest update message. Filters are All, Imported, Updated, Issues and Failed.

Resolve Issue shows only missing/ambiguous fields, material conflict choices, acceptance or coverage confirmation when needed, and relevant active candidate/separate actions. Correct rows remain intact. The pickup regression uses one editable pickup field. Inputs remain visible during typing and successful resolution removes the old issue panel. Processing/capture/import states and retry OCR versus retry capture remain distinct.

Edit details / Advanced opens the preserved full editor and raw diagnostics. ObjectiveIds, UUIDs, historical targets and detailed evidence are hidden from normal gameplay. The existing protected preview/evidence/unlink/retention flows remain.

Settings wording and navigation now reflect automatic imports and optional secondary log monitoring. Capture Method/preferences, recorder, sounds, automatic screenshot experiment and all input backends remain unchanged.

## 6. Changed files

New:

- `electron/main/ocr/coverage.ts` — objective coverage from structural/layout/quantity evidence.
- `electron/main/ocr/importer.ts` — active candidate selection, automatic eligibility and compact resolution planning.
- `src/pages/ScanReview/ScanIssueCard.tsx` — issue-only controls.
- `tests/automatic-import.test.ts` — 30 automatic workflow regressions.
- `tests/automatic-import-desktop.cjs` — real Windows automatic/compact/persistence workflow.
- Two genuine `tests/fixtures/mobiglas/*.json` exports from the user-supplied captures folder.

Updated:

- `storage/database.ts`, `log/reconcile.ts`, `trackingService.ts` — additive pending projection, secondary event routing, unknown acceptance and transactional importing.
- `ocr/parser.ts`, `queue.ts`, `review.ts` — coverage metadata, post-recognition callback, active routine targets, internal automatic authorization, virtual pending targets, source consolidation and preserved manual provenance.
- Main IPC/preload/desktop types — fixed validated `scanIssue` and `resolveScan` actions.
- Review/OCR/tracking types — scan outcome, issue/resolution and coverage metadata, pending mission count.
- Scan Review page — compact history replaces mandatory full editor; advanced component remains.
- App/navigation/TopBar/Settings/styles — v0.4.1 labels and existing-theme compact layout.
- Package/lock/native manifest — 0.4.1; no dependencies changed.
- Existing unit/desktop tests — schema/parser expectations, pending event assertions, explicit legacy-ledger fixtures and new history selectors. The old OCR contracts desktop entry delegates to the current automatic workflow.
- README and this handoff — current workflow, migration, limits and game-test steps.

## 7. Fixtures and data preservation

The supplied folder contained the requested 34,500 image. It was recognized locally with the existing offline Tesseract provider without modifying the original image or live database. The exported contract-pane lines retain genuine coordinates/confidences; source SHA-256/dimensions are recorded. HUD/left navigation are excluded.

Verified genuine case:

- Rookie Rank - Direct Small Cargo Haul.
- 34,500 aUEC, 8 SCU Agricultural Supplies.
- NB Int. Spaceport → Port Tressler above microTech.
- Accepted action evidence; complete positioned delivery/collection pair.

The existing 65,250 genuine fixture remains 7+6+7+5 = 25 SCU across four rows. A second newly exported 61,500 image actually reads 4+3 = 7 SCU. It is kept separate from the earlier representative 8-SCU report. No actual value was rewritten to match older expectations.

Migration/restart tests preserve a v4 ledger, immutable runs, captures and evidence. Desktop tests use isolated profiles. The first 34,500 screenshot preview uses its correct original image. Missing originals for older exports are marked unavailable; a different contract image is never substituted. A derived missing-pickup fixture deliberately removes those OCR lines to test correction.

## 8. Verification executed

| Check                                     | Result                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                       | Passed                                                                                                                                                                                                                                                                                         |
| `npm run lint`                            | Passed                                                                                                                                                                                                                                                                                         |
| `npm test`                                | 213 tests in 15 files passed                                                                                                                                                                                                                                                                   |
| `npm run build`                           | Native helper plus production Electron/React build passed                                                                                                                                                                                                                                      |
| `node tests/desktop.cjs`                  | Passed: Windows security/navigation/ships/manual editing/abandonment/capacity/Manifest/History/runs/window controls                                                                                                                                                                            |
| `node tests/tracking-desktop.cjs`         | Passed: pending-only acceptance, partial objective restart, event/import replay, pre-OCR completion, diagnostics, rotation/error recovery, persisted manual ledger/ship/runs                                                                                                                   |
| `node tests/automatic-import-desktop.cjs` | Passed: v4 migration, actual 34500/8 automatic OCR-only import, no Check Changes, correct image preview, same-ID replay, compact duplicate choice, pending log then unique four-objective promotion, one pickup correction, evidence, Dashboard/Manifest/History, restart and later completion |
| `node tests/ocr-review-desktop.cjs`       | Passed: saved real OCR reprocess/import, unchanged raw evidence/attempts, recorder Save/Escape and existing prototype status                                                                                                                                                                   |
| `node tests/window-desktop.cjs`           | Passed: separate Electron window, overlap excluded, actual 3840×2084 pixels, no upscaling/fallback                                                                                                                                                                                             |
| `node tests/ocr-desktop.cjs`              | Attempted; compiled WinForms fixture launch stopped with `spawn UNKNOWN`                                                                                                                                                                                                                       |
| `node tests/automatic-desktop.cjs`        | Attempted; compiled WinForms fixture launch stopped with `spawn UNKNOWN`                                                                                                                                                                                                                       |

No security policy was modified to force fixture execution. Raw Input Listening is not evidence of physical key/game delivery. No live Star Citizen session or graphics/input compatibility was established by these tests. The native dialog response is stubbed in isolated tracking tests; file reading, SQLite, reconciliation, IPC and React are real.

The compact success layout was visually inspected from `work/scan-history-v041.png`; stale issue controls were removed after successful resolution.

## 9. Exact in-game test and limits

Use README's 12-step matrix. Start with monitoring off and an accepted 34500/8 screen: capture once and verify immediate Dashboard/Manifest import without review. Reprocess the same CaptureId, then recapture and use the compact existing/separate choice. Test Offers, ambiguous acceptance, one missing pickup, partial scrolling and manual-correction conflicts.

Next start optional monitoring: acceptance alone must stay off the active ledger; capture must promote/enrich the unique matching mission. Verify repeated captures, distinct MissionIds, later completion, late identity choices, evidence and restart. Only then enable optional delayed acceptance screenshots.

Physical shortcut delivery, real StarCitizen.exe identity, Vulkan/exclusive-fullscreen behavior and live mission reconciliation remain user-machine tests. Registration/Listening only confirms registration; inspect actual Invocation and capture diagnostics.

Coverage is inferred from text/layout and independent known quantities, not a perfect scrollbar detector. Ambiguous/unsupported screens remain issues. Identity cannot be inferred from identical details alone. Complex corrected or closed consolidation uses Advanced. Automatic image deduplication, capture limits and retention retain their existing behavior.

No continuous OCR scanning, automatic game navigation, cloud services, extra input backends, game memory access, injection or anti-cheat bypass was introduced.
