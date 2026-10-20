# Cargo Run 0.2.0

Cargo Run is a local Windows desktop companion for Star Citizen hauling contracts. It preserves the Phase 1 Fleet Operations interface and adds SQLite persistence plus read-only Game.log tracking.

## Run

Use Node.js 24 or newer. The tested environment is Node 24 and Electron 44. Electron's bundled Node runtime provides SQLite, so no native database dependency or rebuild is needed.

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm ci
npm run dev
```

For a production launch: run npm run build, then npm start.

| Command              | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| npm run dev          | Build main/preload, start Vite, open Electron                                    |
| npm run typecheck    | Strict TypeScript validation                                                     |
| npm run lint         | ESLint                                                                           |
| npm test             | 39 domain, parser, storage, and streaming tests                                  |
| npm run build        | Production Electron main/preload and React bundles                               |
| npm start            | Launch the production build                                                      |
| npm run test:desktop | Build, then run Phase 1 and Phase 2 Windows Electron workflows                   |
| npm run package:win  | Prepare an unpacked Windows application; installer distribution remains deferred |

## Use a real Game.log

1. Open Settings from the navigation drawer.
2. Click **Select Game.log** and choose Star Citizen's actual file using the native Windows file picker. The selected path is saved. The application never writes to that file.
3. Click **Start monitoring**. On the first start for a file, existing bytes are skipped. Start with monitoring enabled before accepting a new mission if you want only new contracts.
4. Accept a hauling contract. Supported acceptance notifications create a Log contract immediately. Until delivery objectives arrive, it appears under **Unresolved Destination**. Unknown pickups, quantities, and payouts are not invented.
5. A supported New Objective: Deliver notification adds or updates the objective for that MissionId and ObjectiveId. Required, delivered, and outstanding SCU are shown. A matching Contract Complete notification moves only that mission to completed History; it does not finish the cargo run or award an unobserved payout.
6. To intentionally read older contents, choose **Import existing history** and confirm. Historical acceptances without completion notifications may remain active. Repeating an import does not duplicate contracts or semantic mission events.
7. Inspect diagnostics for counters, unresolved associations, errors, raw notification text, source paths, and timestamps. Stop monitoring whenever desired. The path and stopped/running preference survive restarts.

ONLINE means the selected file is accessible and actively polled. It does **not** imply Star Citizen is running. OFFLINE means stopped or unconfigured. ERROR indicates file access or monitoring failure; an enabled monitor retries automatically every 500 ms.

Previously monitored files resume at their saved checkpoint after a restart or monitoring pause, including unread bytes accumulated during that gap. This is different from the first start, which begins at the existing file's end. Rotation/truncation detected after a checkpoint starts a new file generation at byte zero. History import captures the file's initial size and scans only up to that boundary, then resumes monitoring if it was previously enabled.

## Persistence and data safety

The main process stores cargo-run.sqlite under Electron's userData directory. Settings shows its exact path. Contracts, cargo objectives, ships, selected ship, active and closed runs, monitoring configuration, semantic event identifiers, unresolved events, and live read checkpoints are persisted. Runs preserve immutable snapshots; all-time statistics count unique ledger contracts.

SQLite schema version 1 is created transactionally using PRAGMA user_version. Newer schema versions are refused without clearing their data. WAL, foreign keys, a busy timeout, and full synchronous commits are enabled. Event application, state changes, and live checkpoints commit in one transaction, preventing a crash between an event and its checkpoint from duplicating or losing that event on replay.

For a backup, close Cargo Run first and copy cargo-run.sqlite. Do not delete or replace an open database or its WAL files. Startup database failures are shown explicitly; the app does not erase a damaged database and silently start over.

Phase 1 had no disk persistence. There is no old database to migrate, and previously closed Phase 1 sessions cannot be recovered. Existing project source was backed up under work/phase1-backup before changes.

New databases start with an empty contract ledger. Demonstration contracts can be explicitly loaded in Settings only while the ledger is empty and monitoring is stopped. Remove sample contracts before tracking or importing real log events. Manual entries and closed-run snapshots are retained by sample removal, which is now permanent across restarts.

## Recognized log formats and limits

Only the supplied Contract Accepted, New Objective: Deliver, and Contract Complete notification formats are recognized. MissionId is the association key; similar titles never complete a different mission. ObjectiveId is preferred for objective association. Exact cargo details provide a conservative fallback when it is absent; indistinguishable objectives without identifiers cannot be reliably separated. Ambiguous associations are preserved unresolved.

Titles retain internal punctuation, quotes, and colons. ISO timestamps with a timezone are parsed separately from notification text and IDs. If a usable timestamp is missing, receipt time is used and diagnostics explicitly identify the fallback. A display-only notification without a valid MissionId cannot create or complete a contract.

Unknown payouts are represented as null, displayed as Unknown, and excluded from numeric potential earnings. Log completion alone confirms neither payout nor credited earnings. Log pickups are Unknown until an observed format supplies that information. Log-derived contracts are updated by events; manual contracts retain add/edit/abandon controls.

The reader opens only with mode r. It polls in 64 KiB chunks, processes at most 1 MiB per monitoring tick, buffers incomplete UTF-8 bytes, and persists the partial buffer with its checkpoint. It detects file identity changes, truncation, and changed bytes near the saved offset. Lines above 256 KiB are skipped with a diagnostic to bound memory. An incomplete final history-import line is not applied; import again after its newline is present.

Recent diagnostic history is limited to 200 entries and 16 KiB of raw text per entry. Compact event identifiers and association payloads remain in SQLite for replay safety. Parsing failures can be expanded in Settings and filtered separately; unrelated game messages do not populate the diagnostic history.

No additional abandoned/failed/objective-completed notification formats are guessed. OCR, screenshot capture, cloud synchronization, real routes, external game APIs, full ship importing, and payout-credit detection remain unimplemented. Ship capacities remain the three demonstration records from Phase 1.

## Architecture

| Path                                 | Responsibility                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| electron/main/index.ts               | Window lifecycle, native picker, trusted IPC, single instance, shutdown                   |
| electron/main/storage/database.ts    | SQLite schema, transactions, normalized entities, configuration, checkpoints, diagnostics |
| electron/main/log/parser.ts          | Pure parsing of supported notifications                                                   |
| electron/main/log/reconcile.ts       | MissionId/ObjectiveId association and out-of-order reconciliation                         |
| electron/main/log/reader.ts          | Bounded incremental read-only byte reader                                                 |
| electron/main/trackingService.ts     | Main-process state authority, event transactions, polling, import and retry               |
| electron/preload/index.ts            | Narrow typed state/action/event bridge                                                    |
| src/stores/cargoDomain.ts            | Reused Phase 1 immutable contract/run actions and validation                              |
| src/stores/useCargoStore.ts          | Renderer state mirror and asynchronous saved actions                                      |
| src/stores/selectors.ts              | Unique-contract statistics and destination groups                                         |
| src/pages/Settings/LogMonitoring.tsx | Configuration, import confirmation and bounded diagnostics                                |
| src/types/tracking.ts                | Shared serialized state, events, checkpoints and diagnostics                              |
| tests/fixtures/log.ts                | Synthetic notification fixtures; no personal logs                                         |

Electron context isolation and renderer sandboxing remain enabled; Node integration remains disabled. Every main-process action validates the sender, and contract/ship requests are validated at runtime. The renderer cannot submit arbitrary SQL, read files, choose a database path, or pass an arbitrary log path. The log path comes only from the native picker. State pushes carry a revision so an older IPC response cannot overwrite newer data. Existing CSP, denied permissions, and blocked navigation/new windows/webviews remain in place.

The SQLite implementation uses [Node's built-in module](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html). The installed Electron release's runtime is documented in [Electron releases](https://releases.electronjs.org/release).

## Verification

TypeScript, lint, 39 unit/integration tests, production build, both actual Windows Electron workflow suites, and a separate development launch smoke check passed. Phase 2 desktop tests verified three application restarts, persisted manual contracts and ship selection, saved monitoring configuration, forward-only first start, partial-line resume, automatic completion without unconfirmed earnings, repeated imports without duplicates, parser failure inspection, log replacement, ERROR recovery, and retained run snapshots.

The desktop picker test stubs only the native dialog's returned file selection; it exercises the actual IPC, validation, file reader, parser, SQLite, and React updates. No personal or actual Star Citizen log was used. Real-game validation remains a user testing step against the supplied format assumptions.

Production dependency audit reports zero vulnerabilities. The full audit still reports eight moderate development-only findings in electron-builder's existing transitive dependency chain. No forced dependency downgrade was applied. Windows installer packaging/signing is not validated in this phase.

Cargo Run is independent and is not affiliated with Cloud Imperium Games or Roberts Space Industries.
