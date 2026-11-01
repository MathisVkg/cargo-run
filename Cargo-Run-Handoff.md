# Cargo Run v0.5.3 — Task 04.3 handoff

Reliability and local maintenance release in `C:\Users\zeyros\Documents\repository\cargo-run`. Fleet Operations 2.0 remains intact. No new dependencies, schema migration, cargo loading/delivery tracking, commit, PR or installer. SQLite schema stays **5**; additive JSON metadata/settings are understood by v0.5.3. Pre-edit copies are under ignored `work/task043-backup/`.

## Matching root cause and rules

An empty Dashboard did not imply empty matching state. Accepted Game.log missions live in `pending_log_missions`, separate from visible stored contracts. Previously, identical titles alone admitted pending records into the competing candidate set. The 11:13:05 and 19:55:29 Junior missions could therefore block an accepted 65,250 aUEC / 18 SCU OCR import despite having no known cargo.

Routine matching now distinguishes stored active contracts, pending projections and closed history:

- Pending missions without objectives are excluded from routine competition; their immutable events and pending projections remain available under Advanced. No arbitrary expiration, nearest-time guess or silent event deletion was added.
- Objective-supported candidates compare commodity, destination, available pickup and quantities. Quantity conflicts remain candidates requiring resolution; genuinely different cargo does not compete merely because the title matches.
- A unique title/objective-supported MissionId can be selected, preserving available ObjectiveIds. Visible rows must map uniquely to distinct stored objective IDs. Missing pickup evidence is not invented, and existing field/coverage/conflict checks still apply.
- Existing capture bindings retain identity. Unverified automatic-capture triggers do not establish a MissionId.
- Distinct active MissionIds with identical details remain ambiguous. Repeated CaptureIds are idempotent; a new identical OCR-only capture still requires identity selection or explicit separate creation.
- Closed history is excluded from ordinary active candidates. The existing recent closed-mission safety check (30 minutes from known acceptance time) remains an explicit recovery gate, not a matching rule or deletion policy.
- Stored title-only active ledger records still require identity choice. Manual corrections, raw OCR, observations, objective IDs and audit evidence keep their existing safeguards.

Each import result stores at most **50** relevant candidate diagnostic entries: CaptureId, candidate/mission identity, origin, status, title agreement, exact objective overlap/count, acceptance-to-capture seconds, inclusion/selection/exclusion and reason. Candidate evaluation itself is not truncated. See Scan History → Advanced diagnostics. Ordinary issues show concise origin, MissionId suffix, cargo/source/time, and explicit existing/separate choices. Timestamps are diagnostic evidence, never sufficient identity.

## Local Data Management

Settings now displays persisted total/active/completed/abandoned contracts, finished runs, captures, pending unlinked active log missions and approximate database/WAL/SHM + managed-image bytes. Backups are excluded. Total includes superseded source records; status counts exclude superseded aliases.

| Action                         | Removes                                                                                                                                                             | Preserves                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clear closed contract history  | Completed/abandoned contracts, closed superseded aliases, their objectives, capture links and review audits                                                         | Active contracts/evidence, current run identity, finished runs with removed IDs/snapshots pruned, configuration                                    |
| Clear contract and run history | The above plus finished runs                                                                                                                                        | Active contracts/evidence and current run with closed references pruned, configuration                                                             |
| Reset all local tracking data  | All contracts/objectives, current/finished runs, captures/images, links/audits, pending missions, events/diagnostics, automatic requests, checkpoints/deduplication | New empty current run, installed app, catalog/selection/favorites, navigation/appearance, OCR/shortcut/capture settings and Game.log configuration |

The smaller cleanups retain capture records/images unlinked; normal later retention still applies. Those captures carry a history-cleared guard, so reprocessing cannot silently recreate cleared contracts. Explicit separate-instance confirmation is required. Closed MissionIds are archived in a local exclusion setting while authoritative raw events/projections remain; replay cannot reactivate those projections. Full reset clears both archival and event state.

Run JSON associations/snapshots are explicitly pruned, not left dangling. Removed-contract review audits and links are deleted together; retained-active evidence remains. Full reset deletes all tracking tables in foreign-key-safe order. Every cleanup commits in one main-process SQLite transaction with `PRAGMA foreign_key_check` before commit. No schema migration was needed.

## Confirmation, backups and failure behavior

Every action opens a protected confirmation preview with contract/run/capture/link/audit/reference/request counts and preservation/monitoring behavior. Reset additionally requires exact **RESET**. Preview tokens are one-use, bounded and expire after ten minutes; stale persisted state requires a fresh preview. Trusted-sender, fixed validated IPC methods stay in main. No arbitrary renderer SQL/path operations were introduced.

Monitoring pauses and capture/recognition/automatic workers drain before backup. IPC mutation guards and a request epoch prevent stale queued mutations. The OCR queue is recreated after maintenance with increasing revisions, so mounted renderer state and the capture protocol use the new queue. Smaller cleanups resume monitoring only if actually running; pending automatic work is canceled.

Each operation creates `<userData>/backups/<UTC timestamp>-<UUID>/` with:

- `cargo-run.sqlite`, using the [SQLite online backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourcedb-path-options), including committed WAL state;
- all owned UUID screenshot/thumbnail files and a manifest;
- integrity and foreign-key verification before destructive writes.

The directory is outside cleanup targets and is never overwritten. Linked/unexpected managed file entries are rejected. Only UUID capture files are removed, never the entire userData directory. Actual Star Citizen Game.log is never modified. If backup fails, cleanup is canceled; a partial backup may remain and its path is reported. A transaction failure rolls back database changes. Successful backup location is shown in Settings and remembered across restart.

There is **no one-click undo or complete filesystem rollback**. File deletion happens after the reset transaction; locked files produce an actionable completion warning while tracking state remains empty. Recovery/startup failure is reported. To restore, close Cargo Run, first preserve the current database/sidecars and captures elsewhere, then restore the backup database and captures together. Remove stale live WAL/SHM only while the app is fully closed, before opening the restored database. Restore is a manual whole-snapshot operation, including its saved settings.

## Monitoring after full reset

Full reset cancels pending captures, drains in-flight recognition, clears checkpoints/events and creates a fresh empty current run. A persisted resume block keeps monitoring stopped across restart while preserving user configuration. **Start monitoring** explicitly removes that block and tails from the current end of the configured log. The first subsequent supported acceptance is processed normally. **Import existing history** remains a separate intentional replay action; reset itself does not replay old bytes.

An active capture/monitor mutation that changes the preview fingerprint can require reviewing a fresh preview rather than cleaning against stale counts. A/B may leave pending raw log evidence visible in Advanced; unknown-cargo pending rows no longer block routine valid OCR.

## Files changed

| Area                                               | Files                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate selection, diagnostics, reuse guard      | `electron/main/ocr/matching.ts`, `importer.ts`; `src/types/review.ts`, `ocr.ts`; `ScanIssueCard.tsx`                                                                      |
| Transactional cleanup, backup and pending archival | `electron/main/storage/maintenance.ts`, `database.ts`, `trackingService.ts`; `src/types/maintenance.ts`                                                                   |
| Runtime drain/restart, protocol, IPC               | `electron/main/index.ts`, `ocr/queue.ts`, `automatic.ts`, `integration.ts`, `electron/preload/index.ts`, `src/types/desktop.ts`                                           |
| Settings and version                               | `LocalDataManagement.tsx`, Settings index, global CSS, App, Navigation, package/lock, native manifest                                                                     |
| Regressions                                        | New `matching-reliability.test.ts`, `local-data.test.ts`, `data-management-desktop.cjs`; adjusted obsolete title-only ambiguity expectation in `automatic-import.test.ts` |
| Documentation                                      | README and this handoff                                                                                                                                                   |

## Verification

All data operations below used synthetic events, repository OCR fixtures and isolated temporary databases/profiles, never the user's real tracking database, capture folder or personal Game.log.

- TypeScript validation, ESLint, **253 tests across 20 files** (232 existing + 21 new cases), and production build all pass.
- Matching regression cases cover the reported Junior 65,250 / 18 example with four quantities 4/5/5/4, two unknown-cargo pending MissionIds, fresh/unique matching, closed/recent history, different cargo, genuine identical active instances, verified/unverified bindings and repeated captures. Coordinates come from the genuine repository Junior export; those representative quantities are explicitly synthetic. The untouched genuine export reads 25 SCU.
- Cleanup tests cover linked evidence/audits, all options, FK integrity, backup failure, transaction rollback, in-flight real OcrQueue cancellation/drain, pending automatic requests, locked-file warnings, protected configuration, stale/double confirmation, reset/restart, fresh tail and explicit history replay.
- `node tests/data-management-desktop.cjs`: actual Windows Electron, all three dialogs, typed RESET guard, outside-click protection, immediate UI/Settings/Scan History refresh, three unique verified backups, active evidence/current-run preservation, preference persistence, automatic cancellation, monotonic OCR revisions, reset/restart staying stopped, first new event and explicit history import. Original test Game.log bytes preserved by cleanup. Matching Advanced screenshot inspected.
- Existing Windows `alignment-desktop`, `polish-desktop`, `desktop`, `tracking-desktop`, `automatic-import-desktop` and `ocr-review-desktop` pass on this build. Their historical version strings identify their original coverage, not this build's application version.
- Ignored screenshots: `work/local-data-v053.png`, `data-preview-{closed,history,reset}.png`, `local-data-reset-v053.png`, `matching-diagnostics-v053.png`. Test profiles/backups remain under ignored `work/`.

No fresh in-game OCR, physical Star Citizen shortcut, Vulkan/exclusive-fullscreen or native display capture verification was performed. Input/capture backends and parser remain unchanged; Raw Input Listening is not proof of physical/in-game delivery. Genuine indistinguishable missions still need explicit identity decisions.

## Fresh v0.6.0 testing environment

1. Launch v0.5.3 and open Settings → Local Data Management. Review persisted counts and capture the existing state if needed.
2. Choose Reset all local tracking data. Review its scope, type RESET and confirm. Wait for completion and record the unique backup path. This intentionally removes active tracking data after backup.
3. Verify Dashboard/Manifest/Contracts/History/Scan History are empty, Settings counts are zero, a new current run exists, favorites/configuration remain, and monitoring is stopped. Restart once and confirm it stays stopped.
4. With automatic capture off initially, explicitly Start monitoring. Existing Game.log content must not populate history. Accept a new supported contract, then capture its accepted Mobiglas details. Verify Dashboard/Manifest, reward/SCU/routes and diagnostics. A title-only pending event may leave the OCR identity unbound until objective evidence or an explicit association exists.
5. Reprocess the same CaptureId without duplication; test genuinely separate identical missions with explicit selection/separate creation. Check manual corrections/evidence survive supported updates.
6. Use Import existing history only when deliberately testing replay. Enable optional automatic capture separately. Test physical in-game shortcut/capture backends on the user's machine; registration/Listening alone does not establish callback delivery.
