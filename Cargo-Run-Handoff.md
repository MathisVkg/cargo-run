# Cargo Run v0.2 — implementation handoff

Implemented directly in C:\Users\zeyros\Documents\repository\cargo-run. Phase 1's pages, visual identity, navigation, manual controls, custom window behavior, and safe run finalization are preserved.

## Run

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm run dev
```

Dependencies are already installed. For a clean installation use npm ci first. Node.js 24 or newer is required. Use npm run build followed by npm start to launch the production bundle.

## Delivered architecture and modifications

- Added main-process SQLite storage with schema version 1, WAL, foreign keys, full synchronous commits, and transactional event/checkpoint application. Tables cover ships, contracts, cargo objectives, runs, settings, checkpoints, mission events, and bounded diagnostics. The database is cargo-run.sqlite under Electron userData; its exact path appears in Settings.
- Split the existing domain store into reusable cargoDomain.ts and an asynchronous renderer mirror. The main process is authoritative. Existing manual actions reuse the original immutable reducers and commit before successful UI responses. Saved ships, selection, contracts, objectives, and runs load at startup.
- Added a pure parser, a separate MissionId/ObjectiveId reconciliation module, a bounded streaming reader, and a polling/import service. Missing acceptance events leave objectives/completions unresolved until association becomes possible. Similar mission titles are never used to complete another MissionId.
- Added native Game.log selection, saved path and monitoring preference, start/stop, ONLINE/OFFLINE/ERROR states, automatic retry, live pushes, explicit history-import confirmation, and diagnostics in Settings. ONLINE means accessible/monitored, not that the game is running.
- Added source metadata, received/log timestamps, durable semantic event identifiers, and live byte checkpoints including partial UTF-8 bytes and file generation metadata. Repeated imports and replay across restarts do not duplicate missions.
- Updated destination groups to display Unknown payouts, required/delivered/outstanding SCU, unknown pickups, and acceptance-only missions under Unresolved Destination. Unknown payouts do not inflate earnings. Completion changes only the matching contract, preserves its run membership, and records no unobserved payout.
- Preserved context isolation, renderer sandboxing, disabled Node integration, CSP, navigation blocking, denied permissions, and narrowly scoped trusted IPC. The renderer cannot read arbitrary files or execute SQL. File paths are selected by the native picker.
- Kept samples explicit and separate from live tracking. New databases start empty. Sample removal persists, and tracking/import is blocked while sample mode is enabled.
- Updated package metadata to 0.2.0, README, desktop regression tests, and this handoff. Existing source backups remain under work/phase1-backup.

New files: electron/main/storage/database.ts; electron/main/log/parser.ts, reader.ts, reconcile.ts; electron/main/trackingService.ts; src/stores/cargoDomain.ts; src/types/tracking.ts; src/pages/Settings/LogMonitoring.tsx; tests/fixtures/log.ts; tests/parser.test.ts; tests/tracking.test.ts; tests/tracking-desktop.cjs; Cargo-Run-Handoff.md.

Modified files: electron/main/index.ts; electron/preload/index.ts; src/types/models.ts and desktop.ts; src/stores/useCargoStore.ts and selectors.ts; src/App.tsx; TopBar; DestinationGroups; ContractDrawer; FinishRunDialog; Dashboard; History; Settings; navigation version label; formatting helpers; global styles; package.json and lockfile; README; existing desktop test. Phase 1 components were extended in place.

## Verification

| Check                             | Result                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run typecheck                 | Passed                                                                                                                                      |
| npm run lint                      | Passed                                                                                                                                      |
| npm test                          | Passed, 39 tests across three files                                                                                                         |
| npm run build                     | Passed                                                                                                                                      |
| Phase 1 Windows Electron workflow | Passed; existing navigation, ships, add/edit/abandon, capacity, manifest, filters, finalization, empty states, window controls and security |
| Phase 2 Windows Electron workflow | Passed; three restarts, persistence, live streaming, checkpoints, imports, completion, diagnostics, rotation and recovery                   |
| npm audit --omit=dev              | Zero vulnerabilities                                                                                                                        |
| Full audit                        | Eight existing moderate development-only findings in electron-builder's transitive chain                                                    |

Tests cover acceptance/objective/completion parsing, punctuation/quotes/colons, MissionId and ObjectiveId association, optional IDs, duplicate notifications, partial UTF-8 lines, out-of-order events, multiple objectives, stale progress, unknown payouts, truncation/replacement, schema version refusal, persisted recovery, transaction rollback, bounded diagnostics, first-start behavior, temporary missing files, repeat import, and checkpoint/replay recovery.

The actual Windows desktop test uses an isolated SQLite profile and synthetic Game.log fixtures. Only the native picker's returned selection is stubbed; the real bridge, reader, parser, database, updates, and restarts are exercised. No actual Star Citizen log was read, and no live game session was used. Installer packaging/signing was not tested.

## Test with your real Star Citizen Game.log

1. Launch Cargo Run and open Settings. If demonstration mode is active, remove sample contracts first.
2. Select the real file with Select Game.log. Confirm the saved path in Settings.
3. Click Start monitoring before accepting a new cargo mission. The first start skips existing file bytes. ONLINE only describes the monitor/file, not the game process.
4. Accept a mission and check that it appears with source Log. It stays in Unresolved Destination until a matching delivery objective is observed. Inspect diagnostics for event timestamps and MissionIds.
5. Observe delivery objectives and verify commodity, destination, required and delivered SCU against the game. Pickup and payout remain Unknown unless supported observed data exists; this phase does not parse payout-credit events.
6. Complete one mission. Its matching MissionId should move to History as Completed while the cargo run remains open. Confirmed earnings remain zero for that log mission because the supplied format carries no credited payout.
7. Optionally use Import existing history, read the warning, and confirm. Importing twice should retain the same unique contracts and event counts. Old acceptances without matching completion lines may remain active.
8. Close and restart Cargo Run. Contracts, ship selection, runs, path, counters, unresolved events, and monitoring preference should remain. If monitoring was enabled, it resumes unread bytes at its checkpoint; a stopped monitor remains OFFLINE.
9. If notifications do not appear, inspect parsing failures and raw lines in Settings. Unrelated game lines are intentionally omitted. Newly encountered formats require verified samples before support is added.

The development command was also launched and inspected in a separate isolated profile: Dashboard loaded, Add Contract opened, and no console or page errors were reported.

## Known behavior and limits

- Phase 1 state was in memory only; prior closed sessions cannot be recovered. No persisted demo ledger was silently converted into live missions.
- Live reading uses mode r only, with 64 KiB chunks and a 1 MiB work budget per 500 ms monitoring tick. Incomplete bytes are buffered in the saved checkpoint. Lines over 256 KiB are skipped with diagnostics. File identity, length, and bytes near the checkpoint detect rotation/truncation.
- First monitoring begins at the existing end; later starts resume unread bytes from saved checkpoints. A detected new file generation is read from byte zero. Manual history import always starts at byte zero up to its captured initial size. A trailing incomplete import line is left unapplied until its newline exists and another import reads it.
- Only the supplied acceptance, delivery-objective notification, and completion formats are recognized. No guessed abandoned/failed/objective-completed formats, OCR, screenshots, cloud services, external game APIs, route calculations, or full ship importing were added.
- ISO timestamps with explicit timezones are recognized. Missing usable timestamps fall back to receipt time and are identified in diagnostics. IDs, not titles, drive associations.
- If ObjectiveId is missing, exact cargo details provide a conservative fallback. Identical distinct objectives without IDs cannot always be distinguished; ambiguous cases are preserved unresolved rather than merged by guesswork.
- Recent diagnostic history is bounded to 200 entries with 16 KiB raw text per entry. Compact identifiers and structured association records are retained for replay safety and unresolved reconciliation.
- A log mission's payout remains Unknown and its confirmed earnings remain zero. No payout-credit format was supplied. Manual contracts preserve known potential payouts; run closure never creates confirmed earnings.
- Back up cargo-run.sqlite after closing the app. Do not remove open database/WAL files. Startup database errors are surfaced without silently clearing data. Newer schemas are refused.

The SQLite module is bundled with the installed Node/Electron runtime; no additional native dependency was installed. Reference: [Node SQLite documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Electron runtime releases](https://releases.electronjs.org/release).
