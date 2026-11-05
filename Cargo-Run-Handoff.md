# Cargo Run v0.6.3 — Task 06.3 handoff

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
