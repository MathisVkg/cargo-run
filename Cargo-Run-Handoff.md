# Cargo Run v0.4.0 — Task 03B handoff

Implemented exclusively in `C:\Users\zeyros\Documents\repository\cargo-run`. No commit, PR, installer, game modification, dependency addition or live-profile data conversion was performed. Test profiles and screenshots are under ignored `work/`; source backups are under `work/task03b-backup/`. Current changes remain reviewable in Git.

## Delivered behavior

Reviewed OCR can create an active OCR-only contract without Game.log, or enrich a selected log/local contract. User confirmation is mandatory. Capturing, recognizing, retrying and reprocessing alone never save contracts. Existing Game.log acceptance still creates its supported log placeholder independently.

Scan Review has editable title/company/optional payout/optional known acceptance time, objective commodity/pickup/destination/required/delivered SCU, add/remove controls, total SCU, original-value comparisons, warnings, candidate reasons, objective mappings, conflict decisions and explicit confirmation checkboxes. Cancel/reload does not change contracts. Selecting another target resets the review and confirmations.

The same CaptureId cannot create a second contract. Separate captures of identical-looking accepted contracts require explicit distinct-instance confirmation. Multiple screenshots can be associated with one contract. Existing linked observations display their contract binding. OCR processing and review/link states are presented separately; rejected automatic attempts are grouped by request while usable observations remain individual.

OCR-only records support Dashboard/Manifest inclusion, manual editing, manual completion through contract details, abandonment, run finalization and History. Unknown acceptance remains null. Optional payout/company remain null when unknown. Potential reward is never copied into confirmed earnings.

## Architectural decisions

- Internal ContractId remains the ledger key. MissionId is assigned only through the existing supported log record and explicit reviewed association. OCR never manufactures a MissionId.
- `prepareReview` derives candidate matches, unique tuple mapping suggestions, validation errors and conflicts from authoritative main-process data. Trigger recency never chooses a target.
- `planReview` validates the submitted draft, confirmation flags, source/target versions, observation hash, objective identity/progress, lifecycle and explicit per-field choices.
- `TrackingService.confirmOcr` commits domain state, evidence binding and audit within one SQLite transaction. A failure restores the previous in-memory store; publish occurs after commit.
- MissionId-bound target lifecycle, known acceptance time, confirmed earnings and newer delivered progress are protected. A screenshot cannot reactivate a completed contract.
- Stable objective IDs key field provenance. Supporting agreement can corroborate Log/OCR values; corrections are marked Manual. Before/after values and original observation evidence remain in the audit.
- Narrow typed preload actions are `prepareOcr`, `confirmOcr`, `contractEvidence`, `unlinkEvidence` and `completeContract`. Existing trusted-sender validation, context isolation, sandbox, disabled renderer Node integration and protected capture protocol remain.
- No new global-input implementation or player input automation was added.

## Database migration: schema 3 → 4

Additive tables:

| Table                    | Keys and purpose                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture_contract_links` | CaptureId primary key; ContractId foreign key with delete restriction; attached flag, association time and structured evidence payload                                                 |
| `ocr_review_audit`       | Independent review ID; CaptureId and ContractId; time, submission hash and original/reviewed/correction/conflict/confirmation/before/after payload; unique CaptureId + submission hash |

The link payload records association type, verification state, original capture metadata, structured observation, recognized text, original values, reviewed values, corrections, conflicts, choices and verified MissionId where available. A canonical MissionId is read from the bound contract so moved screenshot bindings remain correctly verified after consolidation.

Links deliberately have no foreign key to temporary capture records: expiry/clear can remove images and capture queue rows while structured evidence/audit remain. Link/audit foreign keys preserve the contract. Ordinary domain saves now upsert contracts instead of deleting/reinserting all contract rows. Existing ships, objectives, runs, samples, capture payloads, mission events and checkpoints retain their established persistence.

Migration preserves existing payloads and images; it does not convert old observations automatically. All tables use the existing main-process SQLite implementation. No renderer SQL or arbitrary filesystem API was added. Schema versions newer than 4 are refused. v0.3.3 refuses schema 4; rollback requires a pre-upgrade backup, not editing user_version downward.

## Reconciliation and duplicate safeguards

Matching priority is a previously verified MissionId binding, then strong title/objective agreement, supporting reward/timing and explicit user-confirmed association. Candidate labels distinguish verified, strong, possible and unverified trigger matches. The complete target list remains available when heuristics are insufficient.

Each review rejects changed raw/structured OCR or changed target/source records. Replaying an identical confirmation is idempotent; Create against an already-bound CaptureId returns its current contract without another insert. Unlinking retains the binding tombstone so that screenshot cannot later create another contract accidentally.

ObjectiveId must already belong to the selected MissionId's supported events/objectives. Otherwise commodity/pickup/destination/quantity only suggest a mapping. Each existing objective can be mapped once. Distinct identical rows survive. Unmapped rows remain unless explicitly selected for removal; removing delivered rows or regressing progress is rejected. A later indistinguishable log objective remains unresolved rather than merging or double-counting.

For late association, select the log contract from a previously linked OCR capture and confirm consolidation. The log contract remains canonical. The original OCR record remains stored with `supersededBy`; the live snapshot excludes that alias from ledger totals. All source evidence bindings and current-run references move to the canonical identity. Historical run snapshots and audit records remain intact. Different MissionIds, conflicting closed lifecycle states, or conflicting nonzero confirmed earnings cannot be silently combined. Consolidation requires source objective coverage or explicit allowed removal.

## Screenshot evidence and retention

`ContractDetails` is reachable through **Details / evidence** from active destination groups in Dashboard/Manifest and the History ledger. It shows stored contract data, linked/unlinked evidence, date/source, warnings, original OCR/observation, reviewed fields, conflict choices and provenance. Large previews use the existing protected UUID capture protocol.

Current association/contract state decorates capture reads; retention does not rely on cached closure status:

- Unlinked: configurable 1/7/14/30 days, default 7.
- Active attached evidence: protected.
- Completed/abandoned attached evidence: closure + 30 days.
- A surviving active association also protects orphan image files when capture metadata is missing.
- Expiry or missing files leave contracts and structured evidence/audit. Unavailable images are identified explicitly.
- Unlink changes only the attachment/protection state. Deliberate Clear Captures deletes images/raw capture records after confirmation, while contract/evidence audit remains.

Existing startup/hourly cleanup, owned UUID namespace/path/link guards, file-error retention and bounded cleanup diagnostics remain. No active evidence is evicted to make room; capture limits still refuse new work at capacity.

## Settings redesign

DOM/display order is OCR & Capture, optional Game.log Monitoring, Ships, Storage & Data, collapsed Advanced & Diagnostics. Existing Fleet Operations colors, cards, controls and responsive form styling remain.

One Capture Method applies to manual, shortcut and automatic capture by default. Display selection appears only when a configured method can capture the display. Existing saved policies with a different automatic source are normalized to an explicit advanced override, preserving old behavior. Normalization is read-time and persisted on the next policy save. Disable the override to adopt the shared method.

Storage groups SQLite/capture locations, usage, retention, cleanup, sample controls and a clearly separated destructive capture clear. Advanced contains provider information, parser/shortcut diagnostics, bounded automatic request history, source override and application version. Game.log is described as optional mission-event enrichment.

Defaults remain Full Display; explicit fallback off; shortcut enabled; sounds enabled; automatic capture off; delay 3 seconds; 3 total attempts; cleanup enabled; unlinked retention 7 days. Existing different preferences are preserved rather than silently reset.

## Files changed

New modules:

- `electron/main/ocr/review.ts`: candidate preparation, validation, conflict planning, stable provenance, evidence and transactional persistence helpers.
- `src/types/review.ts`: narrow request/result/evidence models and reviewed-field validation.
- `src/pages/ScanReview/ContractReview.tsx`: editable review and confirmation workflow.
- `src/components/contracts/ContractDetails.tsx`: stored values, evidence, preview/unlink and local completion.
- `src/utils/captureReview.ts`: grouping failed automatic attempts while retaining usable observations.
- `tests/ocr-contracts.test.ts`, `tests/ocr-contracts-desktop.cjs`, `tests/fixtures/ocr-hydrogen.ts`: integration regressions, isolated Windows workflow and reported C reconstruction.

Updated modules:

- `electron/main/storage/database.ts`, `trackingService.ts`, `index.ts`, `electron/preload/index.ts`: schema 4, upserts, transactional actions, publication and trusted typed IPC.
- `electron/main/log/reconcile.ts`: canonical MissionId lookup, unique unassigned OCR objective matching, ambiguity retention and preserved pickup/progress.
- `electron/main/ocr/parser.ts`: action-position view evidence, contradictions and excluded action titles; parser version 0.4.0.
- `electron/main/ocr/{queue,repository,retention}.ts`: shared/overridden source selection, live evidence decoration, expiry and orphan protection.
- `src/types/{models,desktop,capturePolicy}.ts`, `src/stores/cargoDomain.ts`, `src/utils/format.ts`: OCR origin, nullable time/reward, company, sources/provenance, manual correction/progress/lifecycle safety and unknown-date display.
- `ContractDrawer.tsx`, `DestinationGroups.tsx`, `pages/History/index.tsx`: optional manual fields, OCR progress editing, evidence entry points, combined sources and closure labels.
- `pages/ScanReview/index.tsx`, all `pages/Settings/*.tsx`, `src/styles/global.css`: review entry, grouped failures, functional retry distinction, settings organization and existing-theme spacing.
- `package.json`, `package-lock.json`, app/navigation version strings and `resources/native/capture.manifest`: 0.4.0 metadata and new desktop test script; no dependency changes.
- Existing parser/migration/queue/desktop tests: schema/parser expectations, action evidence, shared source routing, fixed bridge allowlist and advanced-settings selectors.
- `README.md` and this handoff: current architecture, workflows, limitations and exact game-test instructions.

## Automated verification executed

| Check               | Result                                                                      |
| ------------------- | --------------------------------------------------------------------------- |
| `npm run typecheck` | Passed                                                                      |
| `npm run lint`      | Passed                                                                      |
| `npm test`          | 183 tests in 14 files passed                                                |
| `npm run build`     | Native capture helper/sounds and production main/preload/React build passed |

New tests cover OCR creation, multi-objective values, null optional reward/company, invalid quantities, Offers/ambiguous acceptance, incompleteness, corrections, same-CaptureId replay, separate identical instances, log enrichment/identity, unverified triggers, different MissionIds, conflicts/progress, closed lifecycle/earnings, stale reviews, distinct rows/ObjectiveIds, source consolidation with retained snapshots, transactional failure rollback, samples, local completion/finalization, restart persistence, links/unlinks, active/closed/missing-file/orphan retention, grouped failures, later/out-of-order events and verified moved bindings. Existing queue tests now exercise manual/shortcut/automatic routing with and without an explicit override.

Fixture provenance is deliberate:

- A: reported 61,500 / 8 SCU / two Aluminum rows / Port Tressler, represented by the existing spatial reconstruction.
- B: actual saved 4K OCR export, 65,250 / four rows **7+6+7+5 = 25 SCU**, Pressurized Ice/Processed Food and two Rayari destinations.
- C: newly labelled spatial reconstruction from the user's report, 60,750 / 31 Hydrogen / microTech Logistics Depot S4LD13 → Rayari Deltana Research Outpost.
- Existing genuine OCR exports and earlier synthetic/modified 18-SCU variants remain. No actual OCR quantity was changed to fit a prior expectation.

## Windows desktop verification executed

| Test                                   | Result and boundary                                                                                                                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node tests/desktop.cjs`               | Passed: real Electron security, navigation, ships, manual add/edit/abandon, capacity, destinations, Manifest, History, run snapshots, samples and window controls                                                                                                                                  |
| `node tests/tracking-desktop.cjs`      | Passed: SQLite across 3 restarts, tracking/import/replay, partial lines, objective association, zero-earned completion, failure/recovery/rotation and immutable runs                                                                                                                               |
| `node tests/ocr-contracts-desktop.cjs` | Passed: v3 migration, preserved source override, OCR-only UI creation without monitoring, distinct-instance gating, same-ID replay, extra evidence, Dashboard/Manifest/History, explicit late log consolidation, protected active images, preview/unlink, restart persistence and local completion |
| `node tests/window-desktop.cjs`        | Passed: separate-process Electron window capture, actual 3840×2084 pixels, overlap excluded, no upscaling/fallback; synthetic window identity                                                                                                                                                      |
| `node tests/ocr-review-desktop.cjs`    | Passed: actual saved OCR reprocess, unchanged raw evidence/attempt count, shortcut recorder Save/Escape cancellation, no automatic contract creation; existing prototype reached Listening                                                                                                         |
| `node tests/ocr-desktop.cjs`           | Attempted; stopped launching its compiled `OcrFixture.exe` with `spawn UNKNOWN`                                                                                                                                                                                                                    |
| `node tests/automatic-desktop.cjs`     | Attempted; stopped launching its compiled WinForms fixture with `spawn UNKNOWN`                                                                                                                                                                                                                    |

The new Windows integration test uses genuine saved OCR text plus a synthetic preview PNG because the corresponding original capture file was not present. It tests protected image serving/preview, not new recognition of a genuine game screenshot. The log picker response is stubbed only in isolated tests; the file reader, parser, SQLite, IPC and React paths are real. No live user database was changed. No security policy was modified to force native fixture execution.

Ignored visual artifacts include `work/settings-v040.png`, `work/evidence-v040.png` and isolated test profiles. The displayed review/evidence UI and Settings layout were inspected. Original real-game screen/graphics/input delivery is not established by these desktop tests.

## Exact in-game verification still required

Follow **README → Exact Star Citizen test**, steps 1–12. This covers backup, monitoring-off OCR creation, physical callback diagnostics, Display/Window/Automatic modes, A/B/C values, repeated captures, Offers/Accepted/contradictory actions, optional log enrichment, separate identities, late association, lifecycle/history, restart and evidence retention, then bounded automatic capture.

Registration is not callback delivery. Reset diagnostics, focus Star Citizen, physically press/release the saved chord once, return and inspect Invocation then CaptureSaved/error. Listening does not establish Raw Input delivery. The existing optional comparison instructions are in README; only the explicitly selected backend triggers capture. Earlier physical Raw Input failure remains unresolved. Preserve Electron/manual capture when unreliable.

No actual Star Citizen session, production StarCitizen.exe identification, Vulkan/exclusive-fullscreen behavior, physical in-game shortcut, real mission reconciliation or subjective tone audibility was tested in Task 03B. Native WinForms capture suites need rerunning on a machine where their fixture executable launches.

## Known limits and next phase

OCR reads visible content only; the objective panel may scroll. Acceptance is always explicitly confirmed. Matching remains conservative and user-directed. Ambiguous objective identities or conflicting verified lifecycle/earnings are left unresolved rather than guessed. Source switching reloads the review; edits must be reapplied if switching targets. Review audit persists in SQLite; the evidence panel emphasizes current associations/decisions rather than an audit timeline. Removing raw captures cannot recover an expired original image from structured evidence.

The 50-capture/512-MiB bound still requires explicit cleanup/unlink/clear when protected evidence fills storage. No automatic saving, continuous scanning, navigation, external API, authentication, cloud sync, routing, memory reading, injection or anti-cheat workaround was introduced.

Recommended next work: collect consented real-game OCR exports for A/C and Offers/action variations; run the exact in-game matrix; diagnose the native fixture launch environment; add an explicit historical review timeline and targeted resolution UI for intentionally unresolved objective/lifecycle cases. Keep automatic saving deferred until real-game matching and capture reliability are demonstrated.
