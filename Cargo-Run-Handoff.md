# Cargo Run v0.7.0 — Task 07 handoff

## Task 07 implementation

The existing Electron/React/Zustand/SQLite workflow is retained. The Dashboard now offers objective-ID-specific Pending/Done pickup and delivery reminders, bulk pickup by location, and concise contract progress. Physical quantity controls stay in Manifest/Details. Contract cards keep their original aligned Details/Edit/Abandon footer; the clearly labeled quick completion action sits above it. Single-objective location cards no longer stretch to the height of adjacent multi-objective cards.

### Data model and schema 9

- Optional `CargoObjective.checklist` contains independent pickedUp/delivered booleans, per-field revision tokens and delivery source (Player/Recorded). Missing state defaults to Pending; migration does not rewrite legacy objective payloads or frozen run snapshots.
- `objective_checklist_activity` stores before/after/source with a contract FK and historical objective ID, following the existing cargo-audit pattern because domain saves rebuild the objective table. `checklist_requests` stores hashed request IDs for deduplication. Updates validate persistent objective identity, active state, expected checklist stamp and whole-batch atomicity.
- Recorded full delivery can auto-mark delivery Done. Partial deliveries do not. Cargo audit snapshots retain before/after checklist state. Physical undo restores an automatic mark only if its delivery revision still matches and no later player choice superseded it; pickup stays independent.
- OCR target updates spread existing objective state. Explicit mapped consolidation can carry a source checklist when the destination has none. New IDs start Pending. The raw OCR/capture pipeline is unchanged.
- The additive schema-8 → 9 migration creates these tables and the Off-default `workflow.automation` setting. It retains only pre-existing actionable prompt IDs for later explicit confirmation. Raw mission events and diagnostics are retained regardless. Existing physical SCU, linked images/evidence, favorites/settings, runs and audit rows are not reset.
- Cleanup previews include checklist audit counts; closed contract deletion cascades those audit rows. Full reset backs up first, clears checklist state/requests with tracking data, keeps workflow/favorites/settings, resets its event boundary and leaves monitoring stopped. Existing retained-cargo blockers/FK checks remain.

### Completion policy

Manual completion accepts any active canonical contract, including a bound MissionId or legacy Log record. It records a Manual lifecycle activity/closure timestamp and preserves checklist flags, delivered/onboard quantities, ship assignment and existing confirmed earnings. Future log events cannot rewrite a manually closed record. There is no automatic payout confirmation. Confirmation dialogs show potential reward and marked-delivery count, warn about outstanding/unknown checklist entries and protect against outside-click dismissal.

Run finalization stays atomic: Finish run only snapshots/carries active records unchanged; Complete selected and finish closes only validated selected active records and then snapshots the run. Revision/run-ID checks reject stale dialogs before partial mutation. Existing API run-only calls remain supported; the current UI always confirms explicitly. Frozen run snapshots remain immutable.

### Automatic completion Beta

The setting is independent from screenshot policy and defaults Off for existing/new profiles. Accepted notifications still drive configured automatic OCR capture; objective identity/content evidence is retained. Supported detailed objective-progress behavior is unchanged. Terminal events are projected into pending log evidence, but they cannot complete/abandon ledger contracts or create eligible Dashboard prompts while Off.

On activation, persist the current maximum event row and activation UTC time. Only newly observed terminal IDs after that boundary with supported event timestamps at/after activation are eligible for automation; unknown-time events require Live receipt. Duplicate/stored/historical notifications do not become newly confirmed closures. Existing eligible unresolved IDs are retained when disabling and can be manually confirmed after re-enabling, but the new boundary prevents automatic replay. Snapshot/resolve IPC hides/refuses lifecycle prompts while Off. Previously verified identity rules remain intact when Beta is enabled.

The pre-upgrade prompt migration preserves actionable issues, not every historical terminal event. This avoids showing old raw evidence as a new prompt against a newly created same-title contract. The bounded raw log/identity evidence remains available under existing diagnostics.

### Files changed

- Models/bridge: `src/types/{workflow,models,tracking,progress,lifecycle,desktop}.ts`, `electron/preload/index.ts`, renderer store and main IPC registration.
- Main workflow: `electron/main/{checklist,workflow,trackingService,cargoProgress,lifecycle}.ts`, `electron/main/log/reconcile.ts`, OCR review state preservation, database migration and maintenance.
- UI: LocationStops, ContractCards, ContractDetails, new ChecklistToggle/CompleteContractDialog, FinishRunDialog, LifecycleHistory, Dashboard/Manifest, CargoWorkflow settings, LocalDataManagement audit label and shared CSS.
- Tests: new `tests/workflow.test.ts` and `tests/workflow-desktop.cjs`; existing legacy unit/native automation tests explicitly opt into Beta with deterministic fixture epochs via `tests/helpers/beta{.ts,-desktop.cjs}`. Schema assertions and deliberate old-completion-replay expectations were updated. Image recovery now checks persisted checklist state; automatic capture explicitly verifies Beta remains Off.
- Version metadata/package scripts, README and this handoff. No new application dependency, installer, repository commit or live profile mutation was introduced.

### Validation

**Passed on Windows with v0.7.0 artifacts:** `npm run typecheck`, `npm run lint`, `npm test` (**385 tests / 28 files**, including 17 new Task 07 cases), `npm run build` (native host, main/preload/renderer) and `git diff --check`.

**14 Windows/Electron workflows passed**, each run as `node tests/<name>.cjs`: `workflow-desktop`, `scan-ux-desktop`, `automatic-import-desktop`, `ocr-recovery-desktop`, `lifecycle-desktop`, `reliability-desktop`, `cargo-progress-desktop`, `data-management-desktop`, `ocr-review-desktop`, `tracking-desktop`, `polish-desktop`, `alignment-desktop`, `desktop` and `automatic-desktop`. Historical console version labels identify each suite's original scope, not the artifacts used. The new workflow suite verifies a known MissionId remains Active after a monitored completion with Beta Off, then closes explicitly through the dialog. Native saved-image reprocessing preserves checklist state plus recorded cargo; automatic screenshot/OCR capture runs with Beta Off. Layouts, card footer alignment, restart, cleanup, backup and FK integrity passed.

**Attempted but could not complete:** `node tests/ocr-desktop.cjs` twice stopped at its owned-window focus guard because Windows reported another foreground application. The guard was retained; keys were not sent to that other application. Stable-foreground standalone shortcut verification remains a manual/environmental check. Automatic native capture/offline OCR and the other image-recovery workflows passed. No real Star Citizen session or in-game callback delivery was tested.

The new tests cover Scenarios A–J, including default-Off verified completion/abandonment, pre-upgrade unresolved issues, independent physical records, bulk IDs, stale-batch rollback, recorded-delivery undo, OCR/state identity, manual warnings, both run modes, migration/restart and backed-up cleanup. Existing lifecycle regressions remain enabled under explicit Beta opt-in.

Owned native test profiles/captures/backups/screenshots are under ignored work/ or temporary directories. No user's live database, stored screenshot or Game.log was modified. Real Star Citizen gameplay and in-game shortcut delivery remain unexecuted.

### Exact gameplay handoff / limits

Follow README's v0.7.0 numbered checklist: closed-app backup; verify Off-default upgrade; accept/capture; mark reminders and compare unchanged physical SCU; exercise shared-location rows/bulk pickup and a partial/full Manifest delivery; explicitly complete with/without outstanding entries; test run-only versus selected finalization; reprocess/restart; optionally opt into Beta before new events; verify no historical replay or capture-policy coupling. Check minimum/standard/maximized layouts, and use a disposable profile for reset testing.

Reminder states are user reports, not authoritative game cargo or payout. Closed reminder history stays read-only; physical retained cargo still requires explicit unloading/correction. Beta needs supported unambiguous identity/timestamp evidence and does not bypass prior matching safeguards. Older schema-8 apps cannot open schema 9: rollback requires restoring the pre-upgrade closed-app backup rather than downgrading in place.

Prior handoff sections below remain as architecture/history notes; v0.7.0 policies above supersede their automatic-completion defaults.

## Task 06.4 — root causes and rules

The user-managed database, November 10 Tin/Aluminium screenshots and current LIVE/Game.log were readable. They were inspected read-only. The specifically named Game(2).log was absent in the checked workspace/Downloads, but the current log contains the supplied MissionId suffixes, exact notifications and completion times. Sanitized fixtures retain actual text/coordinates/word confidence/UTC times while removing player, wallet, location coordinates and original UUIDs. The old 715 misrecognition is still represented by explicit synthetic corruption tests; it is not claimed as recovered original output.

| Failure                               | Observed cause                                                                                                                                                                                       | Resolution                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tin 12 SCU stays pending              | Full-screen token `0/12` confidence is 69; v0.6.3 marked both numeric fields Ambiguous at any score below 70. Coverage then became Partial. Repeating the same recognition reproduced the same veto. | Preserve that uncertainty, then corroborate with a distinct bounded pixel-region pass or independent explicit log objective. Real nativeImage 3200-pixel/best-quality preparation plus the updated bundled provider read the isolated token at 95; original full-screen reading stayed 69. No threshold was lowered because of the fixture or digit count.    |
| Tin mission remains unbound           | Log says `Sakura Sun Goldenrod Workcenter`; OCR says `Sakura Sun Goldenrod Workcenter on microTech`. Exact string comparison rejects them.                                                           | Match the whole base only when one side adds a final on/above single-body qualifier; reject unrelated prefixes and different explicit qualifiers. Later supported objective reconciliation keeps the compatible OCR name/row identity rather than appending a duplicate. Identity-changing notifications still hit the existing cargo-conflict safeguards.    |
| Aluminium requires manual association | Persisted prior-session unknown/old Active missions are treated as current competitors by the old lifetime predicate; an older known Aluminium objective also has a different quantity.              | Restrict unknown title-only context competitors to the existing ten-minute eligibility window, while requiring actual marker/objective corroboration for the selected mission. Known incompatible cargo cannot own the context proof. Recent unknown candidates and complete matching objective records still block; no closest-time selection is introduced. |
| Imported card retains “withheld”      | ScanReview chose recovery.message ahead of the fresh import outcome.                                                                                                                                 | Derive a single current presentation; successful status gets a current success message/reviewed quantity. Prior outcomes/recovery are retained in review audit and Advanced evidence.                                                                                                                                                                         |
| Manual workflow is technical          | All actions, identities and diagnostics share the main card/panel level.                                                                                                                             | One primary scan action, focused evidence dialog, confirmed deletion, collapsible Advanced tools; compact mission confirmation with version/candidate-bound explicit checkbox.                                                                                                                                                                                |

### Deterministic evidence strategy

1. **Verified identity:** an existing saved MissionId relationship is used directly; complete unique supported objective IDs plus compatible cargo can establish one under the existing safeguards. Identifier reuse across missions remains a collision, not independent proof.
2. **Strong corroborated match:** accepted OCR plus complete one-to-one commodity/quantity/destination/pickup agreement with log objectives, or the existing narrowly bounded paired pickup/dropoff markers and template commodity. Acceptance/mission lifetime must support the capture. Complete matching candidates cannot be discarded just because another is closer in time. The marker-context window stays two minutes and general acceptance eligibility ten minutes.
3. **Unverified:** titles, rewards, timestamps, triggers, one active contract, partial objective visibility, unmatched markers or indistinguishable candidates are insufficient. Explicit manual confirmation remains required.

The log corroboration path validates numeric uncertainty only when all visible rows map uniquely to one complete independently logged objective set, with matching required/delivered progress, compatible locations and supported timestamps before the capture (+2 seconds tolerance). It does not derive proof from raw text and a parser value from that same text. It does not create cargo movement or confirmed earnings. New log evidence can reconsider a saved pending observation without another screenshot.

Pixel corroboration uses the same offline Tesseract worker, so errors can remain correlated. At most eight low-confidence intact numeric regions can be re-read per image, in isolated numeric rectangles with SINGLE_LINE segmentation; SPARSE_TEXT is restored afterward. An agreeing 80+ regional reading can support the full-screen token. A failed optional crop retains the initial recognition for review. A high-confidence regional disagreement, word/line inconsistency, invalid progress, absent slash or explicit collection contradiction cannot auto-import. Missing/corrupt screenshots preserve saved text, evidence and correction history. No arbitrary SCU maximum or ship-capacity clamp was added.

### Files and storage

- Confidence/identity: `electron/main/ocr/{quantity,objectiveEvidence,provider,parser,coverage,importer}.ts`, `electron/main/{association,lifecycle,trackingService}.ts`, `electron/main/log/reconcile.ts`.
- Audit/current presentation: `electron/main/ocr/review.ts`, `src/types/ocr.ts`, `src/utils/captureReview.ts`.
- Review UI: `src/pages/ScanReview/{index,ScanIssueCard}.tsx`, `src/components/ocr/ObjectiveEvidence.tsx`, `src/components/contracts/LifecycleIssues.tsx`, `src/styles/global.css`.
- Fixtures/tests: `tests/fixtures/mobiglas/nov10-{tin,aluminum}.json`, `tests/fixtures/log/nov10-{sanitized.log,provenance.md}`, `tests/{nov10-reliability,scan-presentation,ocr-provider,ocr-quantity,ocr-queue}.test.ts`, `tests/scan-ux-desktop.cjs` and `tests/native/ScanReviewFixture.cs`. Existing desktop scripts were routed through new labels/disclosures/dialogs; the lifecycle fixture clock now stays inside its original retention policy instead of expiring on November 10.
- Version metadata: package/lock, native manifest, App and Settings. README/handoff and the sanitized-log gitignore exception updated.

**No database migration:** schema remains 8. Optional JSON additions are regional recognition, structured quantity validation codes/source/evidence IDs, and previous-result audit snapshots. Settings, screenshots, user corrections, cargo allocations, lifecycle audit and existing retention semantics are retained. No new runtime/dev application dependency, production database edit/reset, real screenshot deletion, installer or commit was made. Transient Prettier tooling was used only for formatting.

### v0.6.4 validation

**Executed successfully on Windows against v0.6.4:** `npm run typecheck`, `npm run lint`, `npm test` (**368 tests / 27 files**), `npm run build` (native capture host, main/preload/renderer) and `git diff --check`. All **14 isolated desktop workflows** passed as `node tests/<name>.cjs`: `scan-ux-desktop`, `automatic-import-desktop`, `ocr-recovery-desktop`, `lifecycle-desktop`, `reliability-desktop`, `cargo-progress-desktop`, `data-management-desktop`, `ocr-review-desktop`, `tracking-desktop`, `polish-desktop`, `alignment-desktop`, `desktop`, `automatic-desktop` and `ocr-desktop`. Historical version labels in existing console output identify the suite's original scope; current production artifacts were used. The standalone native OCR test exercised Electron callback delivery with a synthetic key in a normal background-test application, actual display capture, queueing/black-image rejection and offline OCR. It does not verify physical-key delivery inside Star Citizen or subjective sound audibility. No required automated check was skipped or left blocked.

The original Tin screenshot was also processed read-only through the exact Electron nativeImage 3200-pixel/best-quality path and updated offline provider. The full-screen fraction remained 69 confidence and its separately recognized numeric region scored 95, both reading 0/12. That separate observation is retained with provenance in the Tin fixture; independent log-corroboration and monitoring-off imports are deterministic regressions. A live Star Citizen mission/foreground shortcut session remains unexecuted.

The deterministic unit/integration suite includes the actual two missions finishing 38 milliseconds apart, independent Tin corroboration, historical and recent competitors, different quantities under the same title/commodity/destination, already-abandoned matches, scrolled observations, qualified destination row identity, restart/audit/foreign keys and numeric values 3/9/10/12/15/25/31/125/715. Conflicting/missing separator and false-715 cases remain pending.

The new isolated Windows Scan History suite checks quantity-only evidence/correction, Cancel, no re-entry of recognized fields, fresh success text and corrected quantity, View contract, Advanced tools, manual correction preservation, confirmed capture deletion with contract retention, 1100 × 700 / 1440 × 900 / maximized layouts, immutable image bytes, audit retention, restart and FK integrity. Native image recovery and automatic capture suites exercise the real offline worker. Test artifacts live under ignored work/ or temporary directories.

### Limits and exact live-game handoff

No live Star Citizen session was executed. The numeric region check was run on an existing real screenshot read-only, and the actual session was replayed in isolated databases; this validates those artifacts and application paths, not future game compatibility.

Manual association is still appropriate when accepted capture/log timestamps are unavailable or outside supported windows, markers/templates are missing/inconsistent, a recent unknown candidate remains plausible, complete objective sets collide, explicit location qualifiers conflict, a multi-objective view is partial/scrolled, or numeric passes/log values disagree. Older matching complete objective evidence is deliberately not ignored solely because it is old. Text extraction cannot supply absent pixel evidence; it may remain uncertain without saved regional checks or independent log corroboration.

Use README's **Exact Star Citizen checks for v0.6.4**: preserve a closed-app recovery copy; accept/capture a full panel; compare 0/12-style values and large requirements; inspect current scan status and Advanced evidence; reprocess without duplicate rows or lost corrections; accept/complete two nearby missions and inspect distinct recorded MissionIds/timestamps; confirm manual fallback only explicitly; restart; verify physical cargo/earnings unchanged. Exercise the review dialog at minimum/standard/maximized sizes. Retained-cargo unload/reset behavior remains covered by unchanged business-rule regression suites.

Earlier handoff sections remain for architectural history; Task 06.4 rules above supersede their release-specific behavior.

## Task 06.3 findings and implementation

- **Quantity evidence:** the app-managed captures still held nine screenshots, including the genuine 3840 × 2160 Agricultural Supplies 15-SCU contract. Offline re-recognition reads `<$ Deliver 0/15 SCU ...`; its wrapped Collect/pickup/destination regions were preserved in `tests/fixtures/mobiglas/agricultural-15-real.json`. Only contract-pane/action lines are tracked, with original coordinates/text/confidence. Wallet/player/navigation data and screenshots are not added. The current saved OCR database has no captures; the historical 715 extraction is unavailable. No claim is made that its exact engine mistake was reproduced.
- **Parser root cause:** a syntactically numeric token was accepted without requiring an intact delivered/required separator or inspecting numeric-word confidence. Import also only checked ambiguity on metadata, allowing objective ambiguity to be bypassed on an already verified target. Parser 0.4.2 and the importer now enforce quantity ambiguity. Explicit primary Collect totals corroborate aggregate delivery counts; contradictions stay ambiguous rather than selecting a preferred number. Checkbox artifacts and Unicode slashes are separated without stripping digits. Comma-grouped large quantities remain valid. Whole-line averages mix unrelated text and are not used as numeric confidence. Numeric-word confidence below 70 requests review; confidence is not a truth guarantee.
- **Reprocessing root cause:** changed OCR requirements were always generic conflicts. The same attached capture can now replace only an OCR-owned requirement when row commodity/pickup/destination are uniquely unchanged, coverage and numeric fields are recognized, and loaded + delivered fits. Provenance must name that capture. Other captures, manual values, ambiguous rows and physical-progress conflicts retain explicit review. Both image recovery and text re-extraction use this path; original recognition and bounded recovery evidence remain available. Verified MissionId and objective/cargo identities are retained.
- **Association investigation:** acceptance notifications and marker/state IDs are persisted, but a matching-looking contract may lack an eligible accepted capture, a complete pair, exact commodity spelling, corroborating objective IDs or unique ownership. Real current markers use `RefinedOre_Aluminium` against OCR `Aluminum`; this standard spelling is normalized for the existing marker-context rule. No fuzzy commodity mapping was added. Existing lifetime/ten-minute acceptance and two-minute marker-context windows, complete pair/template/definition checks, competition/reservation safeguards and explicit manual confirmation remain. Marker context also checks recognized pickup/destination agreement with the saved row. Pending diagnostics name the failed condition; the fallback displays marker/state counts/template plus why they do not yet bind the OCR contract. A later fully delivered cargo row does not establish identity or complete a mission.
- **Retained cargo root cause:** ProgressControls always offered Load/Deliver regardless of closure, while the backend rejected both. Shared inventory action/undo rules now restrict closed cargo to Unload/SetLoaded, with downward-only corrections. Undo cannot bypass closure by restoring more onboard cargo or changing delivered totals. Active undo behavior, stale-operation protection, ship checks, transactions and distinct audit actions remain.
- **Cleanup root cause:** preview threw a generic retained-cargo error with no structured recovery information. LocalDataStats now includes a derived blocker report (contracts/SCU/holding ships). Settings shows it and routes/focuses Manifest's retained section. The backend repeats the protection with actionable counts/ship names to handle races. Nothing silently deletes inventory. All three cleanup modes, mandatory consistent backup, FK validation, settings/favorites retention and stopped monitoring after reset are unchanged.

### Data and file changes

**No migration:** database remains schema 8. New numeric word boxes/confidence and lifecycle diagnostics are optional JSON/type fields; old captures without words remain readable. Cleanup blockers and Manifest focus requests are derived/transient.

- OCR: `electron/main/ocr/{quantity,parser,provider,importer,recovery}.ts`, `src/types/{ocr,review}.ts`.
- Mission association/fallback: `electron/main/{association,lifecycle}.ts`, `src/types/lifecycle.ts`, `src/components/contracts/LifecycleIssues.tsx`.
- Cargo: `src/types/progress.ts`, `electron/main/cargoProgress.ts`, `src/components/cargo/ProgressControls.tsx`.
- Cleanup/navigation: `electron/main/storage/maintenance.ts`, `src/types/maintenance.ts`, `src/pages/{Settings/LocalDataManagement,Manifest/index}.tsx`, `src/stores/useCargoStore.ts`.
- Regression coverage: `tests/{ocr-quantity,ocr-recovery,cargo-progress,acceptance-association,ocr-queue}.test.ts`, real 15-SCU fixture and `tests/reliability-desktop.cjs`.
- Version/package/UI/native manifest, README and this handoff. No dependencies added; no installer, production profile edits, data reset or commit performed.

### Verification and limits

Validation commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and direct Windows desktop scripts after the successful build. **Executed successfully on Windows (v0.6.3 build):** `npm run typecheck`, `npm run lint`, `npm test` (**339 tests / 25 files**), `npm run build` (native host, TypeScript and production main/preload/renderer), and `git diff --check`. All **12 isolated Windows/Electron suites** passed: `reliability-desktop`, `ocr-recovery-desktop`, `lifecycle-desktop`, `cargo-progress-desktop`, `data-management-desktop`, `automatic-import-desktop`, `ocr-review-desktop`, `tracking-desktop`, `polish-desktop`, `alignment-desktop`, `desktop`, and `automatic-desktop` (each run as `node tests/<name>.cjs` after the successful build). Older suites retain historical release labels in their console output; all were run against the current v0.6.3 artifacts. The recovery suite exercised the actual saved-image offline worker, and the automatic suite exercised owned log → native capture → offline OCR. The new reliability suite exercised legacy 715 → 15 repair, retained-cargo actions, wrong-ship controls, cleanup blocker recovery, backup/FK integrity and restart. No test was skipped or left blocked; live Star Citizen gameplay/foreground shortcut delivery remains unexecuted and requires the checklist below. Owned test profiles/images/screenshots/backups are under ignored `work/` or temporary folders.

Live user storage and Game.log were inspected read-only. No user database was migrated, imported into, reset, or overwritten; no real capture was deleted. The fresh screenshot recognition outputs are investigation-only files under ignored `work/task063-evidence/`.

Known limits: high-confidence wrong digits with no independent contradiction cannot safely be inferred away; saved-text extraction cannot recover lost visual evidence. A failed/less-complete image retry retains previous evidence and explains its outcome. Delayed captures outside the supported acceptance window and missing/competing marker evidence still require explicit manual association. Game event formats and live callback/capture behavior require in-game verification.

**Exact Star Citizen verification:** follow README's v0.6.3 numbered checklist above the historical release notes. Verify accepted quantities against the game, capture within two minutes for marker context, inspect verified MissionId before completion, complete/abandon in-game once, restart, exercise wrong/correct ship retained inventory and clear history only after zero. Use a disposable profile for reset testing. Live gameplay has not been executed by automated tests.

The remaining handoff sections document the preceding implementation and are retained for architectural continuity; the Task 06.3 rules above take precedence.

Mission association and OCR recovery reliability in `C:\Users\zeyros\Documents\repository\cargo-run`. The initial v0.6.1 working tree was clean. Pre-edit copies are under ignored `work/task062-backup/`. No dependencies, online OCR, external APIs, new input hooks, cargo automation or Dashboard/Manifest redesign were added. No commit or installer was created.

## Root causes and real evidence

**Association:** v0.6.1 could promote a newly processed capture against a unique structured log candidate. However, an already imported OCR-only contract was not reconsidered at acceptance when stronger log evidence arrived later. Its terminal reconciliation required matching non-fallback objective IDs, which ordinary Mobiglas OCR does not expose. The supplied game's log uses marker/template identifiers rather than readable cargo-quantity notifications, leaving the existing association path without comparable structured objectives.

**Reprocessing:** the UI's Reprocess saved OCR button invoked `ocr:reparse`. That method parsed the same saved text synchronously, never checked/loaded the saved image and never scheduled an OCR worker. When fields stayed the same, the existing import hash could return the previous outcome and the UI showed no operation-specific result. Retry OCR was limited to Failed captures and cleared prior recognition before retry. A processed capture missing pickup information could therefore appear to do nothing.

**Real log located and inspected:** `C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log` contained the exact November 5 mission from the task. It was read only. No historical screenshots or private paths were requested. The standard Cargo Run profile had no relevant mission/configured monitor path, so the user's exact capture/association row was not diagnosed; source-event formats and timing were verified directly.

Observed UTC times (+01:00 = the task's Europe/Brussels local times):

| Event                                      | Actual source time                |
| ------------------------------------------ | --------------------------------- |
| Paired pickup/dropoff CreateMarker records | 18:24:01.546Z                     |
| Contract Accepted notification             | 18:24:01.549Z                     |
| Pickup ObjectiveUpserted completed         | 18:29:56.806Z                     |
| Dropoff ObjectiveUpserted completed        | 18:37:35.607Z                     |
| Phase ObjectiveComplete                    | 18:37:35.645Z; repeated at .665Z  |
| MissionEnded and EndMission                | 18:37:35.664Z                     |
| Contract Complete notification             | 18:37:35.668Z                     |
| Awarded 50,250 aUEC                        | 18:37:35.822Z; all-zero MissionId |

The actual MissionEnded line uses **unbracketed** `mission_id UUID`, unlike the synthetic bracketed form covered by v0.6.1. The terminal parser now handles both. The source also contains bracketed `MissionId[UUID]` in EndMission, and the notification's `MissionId: [UUID]`.

The genuine log does **not** provide SCU quantities or readable pickup/destination names for this mission. Its `HaulCargo_AToB_...` template includes a Corundum token and its paired objective identifiers. Objective-state completion is identity evidence only; it does not prove an amount loaded or delivered.

A sanitized minimal **11-line** fixture and provenance are in `tests/fixtures/log/nov05-sanitized.log` and `nov05-provenance.md`. IDs are replaced consistently; player identifiers, positions, entity IDs and unrelated records are removed. Six raw identity records collapse to five unique semantic marker/state records. OCR quantities/routes combined with these records in tests are explicitly synthetic, not claimed as values extracted from the real log.

## v0.6.1 versus v0.6.2

| Workflow                             | v0.6.1                                                        | v0.6.2                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Acceptance arriving after OCR import | Usually remained unbound until terminal/manual reconciliation | Reconsiders persisted OCR evidence as acceptance/identity evidence arrives, preserving the existing contract ID         |
| Actual MissionEnded format           | Bare mission_id was not recognized                            | Verified genuine bare and bracketed formats normalize with existing terminal notifications                              |
| Reprocess saved OCR                  | Reparsed saved text only                                      | Recognizes the existing PNG through the real offline worker                                                             |
| Same or failed recognition           | Could look like no action                                     | Explicit queued, processing, changed/improved, unchanged or failed feedback                                             |
| Saved-text extraction                | Hidden behind the ambiguous label                             | Separate **Re-extract saved text**, with visible reconciliation outcome                                                 |
| Recognition evidence on retry        | Failed retry cleared result/observation                       | Prior data remains until a replacement is validated; original recognition and bounded attempt evidence remain available |

## Automatic association rules

Association runs transactionally at OCR confirmation, after committed log batches and on restart. It updates identity/acceptance metadata and linked evidence association in place; it never creates an active contract from Game.log alone or renumbers objectives. MissionId uniqueness is enforced by the existing SQLite unique constraint plus candidate/reservation checks.

Common requirements for the new acceptance path:

- Active, non-superseded OCR-origin contract with attached saved Accepted observation and matching normalized title.
- A persisted acceptance event with a valid MissionId and known timestamp; MissionId must be unused by every stored contract, including historical aliases.
- Capture no more than two seconds before acceptance (clock tolerance), and no more than ten minutes after it. Capture time must precede any known closure. These are conservative verification windows, not event-expiration/deletion policies.
- A unique mission-to-contract and contract-to-mission assignment. Historical records are not routine active candidates. Same-title unknown or genuinely competing candidates remain unverified.

One of these corroborating paths must also hold:

1. **ObjectiveIds:** complete one-to-one non-fallback external objective IDs and matching commodity/destination/required quantity/available pickup.
2. **Objective details:** complete one-to-one cargo details and normalized acceptance title, without a competing unknown/same-cargo mission.
3. **Acceptance context:** a single-objective complete Accepted capture within **two minutes**, plus exactly one pickup and one dropoff marker from the observed `HaulCargo_AToB_` family. Their UUID-based objective family and concrete contract-definition UUID must agree; the template must contain an exact commodity token matching the recognized OCR commodity. Recognized required quantity and visible pickup/destination must be consistent with the saved contract. Incomplete/inconsistent markers, ambiguous commodity/template or any plausible same-title alternative block verification.

No actual title, MissionId, commodity, reward, screenshot name or example quantity is hardcoded in production. The marker rule deliberately supports the observed template family only; it does not decode arbitrary template names or infer missing quantities/locations. Unknown families and captures outside the windows remain pending. Timing/title alone never verify identity.

Contract Details' existing Advanced data includes bounded `associationDiagnostics` and `missionAssociation` metadata: decision, reason, candidate MissionIds and evidence IDs. Missing original proof does not rewrite historical contract payloads. Existing verified associations remain stable. An otherwise valid OCR import is still allowed without an association.

After verification, existing terminal reconciliation closes the correct contract with the saved event timestamp, including completion that arrived before OCR finished. It does not need an OCR rescan or manual lifecycle association. Weak/genuinely ambiguous cases retain the v0.6.1 Dashboard confirmation workflow. Existing explicit Advanced/manual recovery remains available for old or corrected records.

## OCR recovery implementation

The actual path is now:

Scan History button → renderer store → preload `ocrReprocess` → trusted main IPC `ocr:reprocess` → UUID capture/image lookup → engine/queue checks → existing serialized image loader/offline worker → structured parser → replacement validation → existing idempotent import/reconciliation → snapshot/visible row result.

- The operation checks image availability, engine readiness and the existing 12-pending queue bound. Missing/expired images and unavailable engine errors are persisted and shown.
- Queued/Processing are visible while original recognized data remains readable. Duplicate in-flight requests do not schedule extra recognition.
- The existing image loader enforces size/decoding limits and the provider retains its local timeout/recovery behavior. No new screenshot is captured.
- Blank/unusable or less-complete candidates, including regression from a recognized Accepted view, do not replace the working recognition.
- Valid changed extraction reports improved/changed fields. Identical structured information explicitly reports **the same information was extracted**. It can still retry idempotent reconciliation.
- If pickup is still missing, the result explains that invisible information cannot be recovered by another recognition pass and offers screenshot inspection/compact field correction.
- Worker and import failures report an actionable error and retain the previous recognition/import state. Main-process contract transactions continue to protect manual corrections and loaded/delivered cargo.
- The first saved recognition snapshot is retained as `originalRecognition`; at most three bounded candidate/failure attempts are retained in `recognitionHistory`. The original screenshot file is never rewritten. These fields and the current operation result appear in the existing Advanced OCR diagnostics.
- An unchanged reprocess keeps the prior raw recognized result. Re-extract saved text remains separate and does not increment image-recognition attempts or invoke a worker. It now reports whether reconciliation succeeded or failed and protects the old observation on failure.
- Failed-capture retry now uses the same preserving image-recognition path rather than clearing prior data.
- Existing retention protects Captured/Processing records. Manual deletion/reset remains intentional; maintenance drains workers before resetting.

The compact issue form, screenshot preview and automatic import behavior remain. Users can correct only missing/conflicting fields and save without deleting the capture. No long mandatory review was reintroduced.

## Persistence, cargo and rewards

Additive SQLite **schema 8** adds `mission_identity_evidence` (semantic ID, MissionId, normalized evidence JSON and a MissionId index). It preserves marker/state evidence across restart and out-of-order events without storing unrelated player/system/position data.

Contract/capture JSON fields are additive. Existing contracts, screenshots, links/audits, manual corrections, cargo operations, runs, settings, shortcuts and monitoring state remain. Original OCR and working recognition remain available during recovery. Existing schemas migrate through their normal steps; older binaries refuse schema 8, so downgrade requires a pre-upgrade backup.

Acceptance association does not change loaded/delivered quantities, ship assignments or cargo activity. The newly observed ObjectiveUpserted/ObjectiveComplete records are **not** routed to delivery-quantity reconciliation. No automatic loading/unloading or new Game.log delivery tracking was added. Existing v0.6.0 supported quantity-notification behavior was not expanded.

Completion/abandonment still preserves retained onboard inventory and unknown physical evidence. Unattributed rewards, including all-zero MissionIds, remain canonical evidence with **zero automatic earnings effect**.

Online backups include identity evidence and recognition history. Full RESET clears identity evidence with tracking data; A/B preserve authoritative evidence under the existing archived-MissionId policy. Foreign-key checks and worker draining remain. The user's live database, screenshots and Game.log were never modified by automated tests.

## Files created and modified

| Area                            | Files                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| New identity parser/association | `electron/main/log/identityParser.ts`, `electron/main/association.ts`, `src/types/association.ts`                                                   |
| Existing event pipeline         | log/parser.ts, log/lifecycleParser.ts, trackingService.ts under electron/main                                                                       |
| New recovery helper             | `electron/main/ocr/recovery.ts`                                                                                                                     |
| Image recovery / IPC / UI       | ocr/queue.ts, main/index.ts, preload/index.ts, desktop/ocr/model/tracking types, useOcrStore.ts, ScanReview/index.tsx                               |
| Additive migration/cleanup      | storage/database.ts, storage/maintenance.ts                                                                                                         |
| Real evidence fixtures          | tests/fixtures/log/nov05-sanitized.log and nov05-provenance.md                                                                                      |
| New tests                       | acceptance-association.test.ts, ocr-recovery.test.ts, ocr-recovery-desktop.cjs, native/OcrRecoveryFixture.cs                                        |
| Compatibility tests             | schema-version assertions; late-import expectation now verifies in-place automatic association; saved-text review suite uses its explicit new label |
| Version/docs                    | package + lock root versions, native manifest, App/Settings labels, README and this handoff                                                         |

The gitignore exception includes only the sanitized fixture log; personal/runtime logs remain ignored. The existing native automatic capture/OCR, cancellation and retention suite also passed against its synthetic fixture application.

No dependency versions changed. `npm run test:recovery:desktop` builds and runs the new isolated Windows workflow.

## Verification executed

- TypeScript validation, ESLint, **315 tests / 24 files**, production native + Electron build: final passing results.
- 293 previous tests retained, with intended schema/late-association expectations updated; 11 association and 11 recovery tests added.
- Genuine-format tests verify observed UTC records/IDs, real bare MissionEnded syntax, marker-before-acceptance, OCR-first/log-first/terminal-before-OCR, same-title collisions, different commodities, incomplete/mismatched markers, timing windows, reserved IDs, duplicate notifications, restart, rewards and unchanged cargo.
- Recovery tests use temporary SQLite/images and provider fault injection: actual scheduling, improvement, unchanged missing fields, missing image, unavailable engine, worker error/retry, blank/worse recognition, manual corrections/cargo preservation, duplicate requests, bounded history, import failure and separate saved-text extraction.
- New Windows suite uses an isolated profile and **actual offline Tesseract** on a generated 3200 × 1800 PNG. It clicks the real UI action, sees Processing → Improved, repeats to Unchanged, verifies raw/image preservation and unchanged objective IDs/cargo operations, replays sanitized genuine log formats through the real monitor, verifies automatic association/closure, tests missing-file feedback and restart/FK integrity.
- Existing Windows import, saved-text review/recorder, lifecycle, cargo, data-management, tracking, polish, alignment and manual desktop suites are run against v0.6.2; final results are recorded in README.
- The first native rebuild was blocked by the running application's CaptureHost file lock. The user closed Cargo Run; the normal native rebuild then passed. No Windows security settings were changed.
- Ignored Windows artifacts: `work/ocr-recovery-{processing,improved,missing}-v062.png`; generated images/profiles remain under ignored `work/`.
- The real Game.log was inspected read-only to derive sanitized fixtures; all monitoring/replay/cleanup operations used temporary owned logs/profiles. No user's real data was mutated.

## Limitations and real Star Citizen test

This is real-log-format replay plus synthetic-image recognition, **not fresh live Star Citizen verification**. The actual source log does not prove its capture's recognition, SCU count, pickup/destination text or original app association. Marker/template naming may change between game versions; unsupported or insufficient evidence deliberately stays pending. The context rule is narrow, not a guarantee that every accepted mission can be associated. Missing/off-screen text cannot be recovered from the same image.

1. Preserve a closed-app database/captures backup, launch v0.6.2 and verify existing records, cargo, history, images and preferences survived schema 8.
2. Confirm the correct Game.log path and start monitoring before accepting a mission. Keep automatic capture off initially to isolate manual capture behavior.
3. Accept a new hauling mission and capture its accepted screen promptly. For marker-context verification, use one fully visible objective within two minutes, with recognized commodity/pickup/destination and complete objective coverage. Inspect Details → Advanced for MissionId, association source and evidence IDs.
4. With multiple identical accepted titles/commodities or uncertain evidence, verify the contract remains unbound and the app does not choose a nearest-time candidate. Use the existing explicit association workflow when needed.
5. Record real partial loading/delivery. Complete the verified mission in game: the correct contract should close automatically, with the event time and original objective IDs. Any still-recorded onboard cargo must remain assigned to its ship and exposed in Manifest.
6. For a scan reporting missing pickup, open the original screenshot, click Reprocess saved OCR and watch Processing followed by changed/improved, unchanged or failed feedback. Verify it uses the same CaptureId and screenshot; no deletion/new capture should be required.
7. If the image never showed the pickup, expect an unchanged/missing-field explanation and correct only that field. Re-extract saved text is the explicitly separate parser/reconciliation action.
8. Repeat recovery on an imported scan after manual corrections and cargo operations; verify no duplicate contracts/objectives/operations and no overwritten corrections. Inspect original/attempt evidence under Advanced.
9. Restart and optionally import history deliberately. Verify associations and closure remain idempotent, and an Awarded notification does not become confirmed earnings by amount/time alone.
10. Repeat optional automatic capture and physical shortcut tests in the actual game/renderer mode. No live gameplay, physical in-game input, exclusive fullscreen or Vulkan verification is claimed here.
