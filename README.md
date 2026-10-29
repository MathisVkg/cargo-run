# Cargo Run 0.4.1

Cargo Run is a local Windows companion for Star Citizen hauling. Accepted contract screenshots now import automatically when their fields, objective coverage and identity are clear. **Scan History & Issues** is a history of imports and exceptions, rather than a required editing step. Game.log is an optional secondary source of mission events.

## Run and verify

Requires Windows and Node.js 24+. The existing native capture helper uses the installed .NET Framework compiler.

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm ci
npm run dev
```

For production use `npm run build`, then `npm start`.

| Command                          | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `npm run typecheck`              | Strict TypeScript validation                              |
| `npm run lint`                   | ESLint                                                    |
| `npm test`                       | 213 automated tests in 15 files                           |
| `npm run build`                  | Native capture helper and production Electron/React build |
| `npm run test:desktop`           | Windows application and secondary Game.log workflows      |
| `npm run test:ocr:contracts`     | Windows automatic import and compact correction workflow  |
| `npm run test:ocr:review`        | Saved OCR and shortcut recorder regression                |
| `npm run test:window:desktop`    | Separate-process window capture                           |
| `npm run test:ocr:desktop`       | Native display/shortcut/offline OCR fixture               |
| `npm run test:automatic:desktop` | Acceptance-triggered capture fixture                      |

No runtime dependency, cloud service, continuous scanning, game navigation or new input backend was added.

## Normal gameplay workflow

1. In **Settings → OCR & Capture**, choose the existing Capture Method and monitor where applicable.
2. Show an accepted hauling contract and use the saved capture shortcut or **Capture now**.
3. A structurally valid, sufficiently complete and unambiguous scan imports automatically. Dashboard, Manifest, capacity, destinations and potential earnings update immediately.
4. Open **Scan History & Issues** only to inspect a screenshot, edit details, or resolve a genuine issue.

**Automatic screenshot capture** and **automatic importing** are different. Acceptance-triggered screenshots remain optional and off by default. Safe importing runs after recognition or **Reprocess saved OCR**, regardless of whether monitoring is enabled. Existing valid v0.4.0 captures can be reprocessed; migration does not bulk-import them at startup.

Successful entries show title, recognized SCU/reward, capture time, preview, Imported/Updated status and **Dashboard and Manifest updated**. Full editing, ObjectiveId mappings, UUIDs and raw evidence are behind **Edit details / Advanced**. OCR processing, failed capture and import outcomes remain distinct.

## When a scan needs attention

| Issue                                                           | Normal action                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Missing pickup or another required field                        | Correct only that field and save                                                          |
| Ambiguous acceptance                                            | Confirm that the contract was actually accepted                                           |
| Offers screen                                                   | Accept it in-game and recapture, or explicitly confirm acceptance for an older screenshot |
| More than one plausible active instance                         | Choose the relevant active contract or create a separate contract                         |
| Unproven objective-list coverage                                | Confirm the full list, or recapture a complete panel                                      |
| Conflict with a saved value                                     | Keep the stored value or explicitly authorize the recognized value                        |
| Unusable/missing image                                          | Retry OCR only when an image exists; otherwise retry capture                              |
| Closed history or complex consolidation with manual corrections | Use explicit Advanced recovery                                                            |

Correction fields remain visible while typing. Successful resolution closes the issue form so old errors do not remain beside a success message. Correctly recognized rows are not reconstructed. Unmatched existing rows are preserved and never become mandatory editor fields just because they were absent from the screenshot.

## What can import automatically

Eligibility uses validity, bounding-box/layout evidence, acceptance actions, objective coverage and duplicate/identity checks. **There is no OCR confidence-percentage threshold.**

- Title and visible objective fields must be valid; missing optional reward/company remain unknown.
- Accepted state must be supported by positioned action/tab evidence. ACCEPT OFFER identifies Offers; TRACK, UNTRACK and ABANDON support Accepted. Contradictory indicators stay ambiguous.
- Coverage is established by independent description quantities, or by a positioned objectives heading with complete delivery/collection pairs ending clearly before the action bar. Explicit scrolling, clipping, truncation and ambiguous rows prevent declaring that layout complete.
- An existing verified ledger target's known objectives can support a partial update. Unseen rows remain unchanged and the observation stays marked incomplete. A pending log row alone does not establish a complete list for creating a new ledger contract.
- A unique active log identity requires agreeing title and unambiguous objective evidence; capture timing/context are supporting evidence, not identity on their own.
- A trigger MissionId is never verified merely because it scheduled capture.
- Material disagreements wait for a choice. Manual corrections and delivered progress cannot be silently overwritten by a later scan.

OCR coverage remains a conservative inference from the available text/layout. An undetected scrollbar or recognition error can still hide information; inspect unusual contracts and use Advanced when necessary.

## Identity and duplicate prevention

ContractId is the local ledger identity; MissionId is the verified log identity; CaptureId identifies one observation; ObjectiveId identifies a known log objective.

The same CaptureId cannot create another contract. Additional screenshots of a uniquely verified contract enrich the same record. Different MissionIds remain distinct. Identical OCR-only instances are never silently merged: a later matching screenshot presents a compact existing/separate choice.

Closed/abandoned historical records are excluded from routine candidate choices. A recent already-closed matching mission can block a potentially stale import without offering a historical list; choose a genuinely separate accepted instance or use Advanced recovery.

New log evidence can make an earlier OCR-only association ambiguous. The original capture then offers a compact identity choice. Confirming its matching log record consolidates current cargo/evidence without duplication; the source OCR record and historical snapshots remain. Saved manual corrections require explicit Advanced consolidation. Previously resolved choices are not reopened by unrelated events.

All contract/objective/evidence/audit/outcome changes commit in one main-process SQLite transaction. Failed writes roll back both persisted state and the in-memory ledger. Stale issue resolutions are rejected when OCR or the selected target changed. Recognition and its evidence remain available for retry.

## Game.log is a secondary mission-event source

Select Game.log in Settings and start monitoring if desired. New acceptance records **MissionId, title, known timestamp and objectives in pending mission storage** and can trigger the existing optional delayed capture. It no longer creates an incomplete active Dashboard contract.

A sufficiently supported OCR match promotes/enriches that identity in the cargo ledger. Completion events before association remain in pending evidence; events after verified association update the correct ledger contract. The app does not complete an unrelated OCR-only contract by guessing its identity. Historical/closed association is an explicit recovery operation.

Existing v0.4.0 log contracts, including incomplete ones, are preserved in place and still receive their supported lifecycle events. They can be enriched by OCR rather than duplicated.

Supported notifications remain Contract Accepted, New Objective: Deliver, and Contract Complete in the established notification/MissionId format. First monitoring start skips existing bytes; checkpoints resume after restart/pause. **Import existing history** is explicit and replay-safe. Rotation, partial UTF-8 lines, errors/recovery and bounded diagnostics remain. ONLINE indicates a readable monitored file, not a running game.

A missing acceptance timestamp stays null; capture time and event receipt time are separate. Potential reward never becomes confirmed earnings automatically. OCR-only records still support manual editing/completion/abandonment, run finalization and History.

## Persistence, migration and evidence

Schema **5** adds `pending_log_missions`, keyed by MissionId, and reconstructs its secondary projection from saved immutable events. It does **not** delete, move or convert existing ledger contracts, captures, links, runs, checkpoints or corrections. Import outcome metadata and coverage are additive JSON fields.

Existing `capture_contract_links` and `ocr_review_audit` retain original observations, corrections, conflicts, before/after data and authorization type: Automatic, Issue resolved or Reviewed. Automatic associations are distinguished from user-confirmed associations.

Use **Details / evidence** from Dashboard, Manifest or History for screenshots, larger previews, date/source, warnings and field provenance. Unlinking does not delete the contract. Default retention remains 7 days unlinked, protected while attached to an active contract, and 30 days after closure. Missing/expired images leave contract data and structured evidence/audit. Deliberate Clear Captures removes files/capture rows while linked text evidence remains.

SQLite, WAL, foreign keys, full synchronous commits, the serial OCR queue, 12-pending/50-capture/512-MiB limits, protected UUID image protocol and local English Tesseract remain. Settings shows actual data paths. When protected evidence fills storage, explicit cleanup/unlink/clear is still needed.

Back up the database and captures folder with Cargo Run closed before upgrading. Older binaries intentionally refuse schema 5. Restore a pre-upgrade backup for rollback; do not lower PRAGMA user_version manually.

## Exact in-game test

1. Back up local data with Cargo Run closed, launch v0.4.1, and leave Game.log monitoring and automatic screenshot capture off.
2. Show the accepted **Rookie Rank - Direct Small Cargo Haul**, 34,500 aUEC, 8 SCU Agricultural Supplies, NB Int. Spaceport → Port Tressler above microTech. Capture once. Without opening review, verify one active contract, correct route/SCU/reward and an Imported entry.
3. Inspect the saved screenshot. Reprocess the same CaptureId: contract count must not increase. Capture the same OCR-only instance again: choose the existing contract from the compact issue; no row reconstruction should be required.
4. With two genuinely separate identical accepted instances, choose **Create a separate contract**. Keep different MissionIds separate.
5. Test an Offers screen: no active import. Ambiguous acceptance must ask for confirmation. Test a missing pickup: only that field should need correction. Saving should close the issue controls and show a single success state.
6. Test a scrolling/partial list against a known contract. Unseen objectives must stay, and unrelated missing pickups on those rows must not become required edits. Unsupported list coverage must remain an issue.
7. Enable Game.log monitoring before accepting a new hauling mission. Acceptance alone must not add an active Dashboard row. Capture its contract: a unique title/objective match should promote/enrich one record with its MissionId and known timestamp.
8. Repeat a verified capture; verify the same contract/objective IDs and additional evidence. Change a stored value manually, rescan a conflicting value, and ensure it waits for your authorization.
9. Let a verified mission complete. Check Completed History and zero unobserved earnings. Restart and verify contracts, runs, ship, evidence and pending event state.
10. For late log evidence, use the compact identity choice on the original OCR-only capture; complex corrected/closed cases belong in Advanced recovery.
11. Optionally enable the existing delayed acceptance-capture experiment. It should produce automatic imports only when eligible, otherwise grouped failures or compact issues. Stop monitoring to cancel pending capture requests.
12. Repeat your usual Window/Display/Automatic capture and physical shortcut tests. Reset Advanced shortcut diagnostics, focus Star Citizen and physically press/release the chord once. Registration/Listening is not callback delivery: check Invocation → CaptureSaved/error. No real-game or Vulkan/physical-input validation is claimed here.

Electron remains the default input backend. Its existing quiet-period repeat guard, recorder and optional development-only Raw Input prototype are unchanged. Raw Input delivery remains unverified; only the explicitly selected backend triggers capture. Keep working Electron/manual capture if the native prototype is unreliable.

## Verification and known limits

TypeScript, lint, **213 tests**, and production build pass. Windows app regression, secondary Game.log tracking, automatic import/compact correction, saved OCR/recorder and separate-process window capture passed. The new import workflow exercised actual saved 34,500/8 OCR and its correct original image, plus the genuine 65,250/25 multi-objective OCR export. If an original fixture image is absent, tests mark it unavailable rather than substituting another contract's image.

Two existing native suites were attempted but their compiled WinForms fixture failed to launch with `spawn UNKNOWN`. No Windows security settings were changed. Native helper compilation and separate Electron window capture succeeded. No live Star Citizen session, physical in-game shortcut, production game-window identity or Vulkan/exclusive-fullscreen capture was verified.

New genuine exports preserve original coordinates/confidences and source image SHA-256. The additional 61,500 screenshot actually reads 4+3 = 7 SCU; the older representative 8-SCU fixture is a separate reported example and remains unchanged. The genuine 65,250 export remains 7+6+7+5 = 25 SCU. No actual quantity was replaced to fit earlier reports.

See [Cargo-Run-Handoff.md](Cargo-Run-Handoff.md) for changed files, root causes and implementation details.
