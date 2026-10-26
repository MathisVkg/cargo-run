# Cargo Run 0.3.0

Cargo Run is a local Windows desktop companion for Star Citizen hauling contracts. It preserves the Phase 1 Fleet Operations interface and provides persistent Game.log tracking plus Windows screenshot capture and offline OCR observations.

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
| npm test             | 64 domain, parser, storage, streaming and OCR tests                              |
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

SQLite schema version 2 is created/upgraded transactionally using PRAGMA user_version. Newer schema versions are refused without clearing their data. WAL, foreign keys, a busy timeout, and full synchronous commits are enabled. Event application, state changes, and live checkpoints commit in one transaction, preventing a crash between an event and its checkpoint from duplicating or losing that event on replay.

For a backup, close Cargo Run first and copy cargo-run.sqlite. Do not delete or replace an open database or its WAL files. Startup database failures are shown explicitly; the app does not erase a damaged database and silently start over.

Phase 1 had no disk persistence. There is no old database to migrate, and previously closed Phase 1 sessions cannot be recovered. Existing project source was backed up under work/phase1-backup and work/task03a-backup before the corresponding phase changes.

New databases start with an empty contract ledger. Demonstration contracts can be explicitly loaded in Settings only while the ledger is empty and monitoring is stopped. Remove sample contracts before tracking or importing real log events. Manual entries and closed-run snapshots are retained by sample removal, which is now permanent across restarts.

## Recognized log formats and limits

Only the supplied Contract Accepted, New Objective: Deliver, and Contract Complete notification formats are recognized. MissionId is the association key; similar titles never complete a different mission. ObjectiveId is preferred for objective association. Exact cargo details provide a conservative fallback when it is absent; indistinguishable objectives without identifiers cannot be reliably separated. Ambiguous associations are preserved unresolved.

Titles retain internal punctuation, quotes, and colons. ISO timestamps with a timezone are parsed separately from notification text and IDs. If a usable timestamp is missing, receipt time is used and diagnostics explicitly identify the fallback. A display-only notification without a valid MissionId cannot create or complete a contract.

Unknown payouts are represented as null, displayed as Unknown, and excluded from numeric potential earnings. Log completion alone confirms neither payout nor credited earnings. Log pickups are Unknown until an observed format supplies that information. Log-derived contracts are updated by events; manual contracts retain add/edit/abandon controls.

The reader opens only with mode r. It polls in 64 KiB chunks, processes at most 1 MiB per monitoring tick, buffers incomplete UTF-8 bytes, and persists the partial buffer with its checkpoint. It detects file identity changes, truncation, and changed bytes near the saved offset. Lines above 256 KiB are skipped with a diagnostic to bound memory. An incomplete final history-import line is not applied; import again after its newline is present.

Recent diagnostic history is limited to 200 entries and 16 KiB of raw text per entry. Compact event identifiers and association payloads remain in SQLite for replay safety. Parsing failures can be expanded in Settings and filtered separately; unrelated game messages do not populate the diagnostic history.

No additional abandoned/failed/objective-completed notification formats are guessed. Cloud synchronization, real routes, external game APIs, full ship importing, and payout-credit detection remain unimplemented. Ship capacities remain the three demonstration records from Phase 1.

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

TypeScript, lint, 64 unit/integration tests, production build, both actual Windows Electron workflow suites, and a separate development launch smoke check passed. Phase 2 desktop tests verified three application restarts, persisted manual contracts and ship selection, saved monitoring configuration, forward-only first start, partial-line resume, automatic completion without unconfirmed earnings, repeated imports without duplicates, parser failure inspection, log replacement, ERROR recovery, and retained run snapshots.

The desktop picker test stubs only the native dialog's returned file selection; it exercises the actual IPC, validation, file reader, parser, SQLite, and React updates. No personal or actual Star Citizen log was used. Real-game validation remains a user testing step against the supplied format assumptions.

Production dependency audit reports zero vulnerabilities. The full dependency audit also reports zero vulnerabilities after compatible Electron and fast-uri updates. Windows installer packaging/signing is not validated in this phase.

Cargo Run is independent and is not affiliated with Cloud Imperium Games or Roberts Space Industries.

## Windows capture and OCR prototype (Task 03A)

### Requirements and engine choice

Use Windows 10 1703/build 15063 or newer, or Windows 11, **x64**, with .NET Framework 4.8 and an unlocked interactive desktop. Node.js 24 or newer is needed for development; the app bundles Electron 44.9.1. The native helper build uses the Windows .NET Framework compiler at SystemRoot/Microsoft.NET/Framework64/v4.0.30319/csc.exe. No Python, .NET SDK, cloud OCR account, or installed Windows OCR language pack is required.

Microsoft documents [Windows.Media.Ocr](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr?view=winrt-26100) as supported for desktop apps with package identity. Cargo Run currently uses unpackaged Electron/electron-builder rather than MSIX. Instead of relying on an unsupported WinRT workaround, this prototype uses **Tesseract.js 7**, bundled WebAssembly core and bundled English trained data. Recognition runs in a reusable Node worker, outside React, with local paths and no runtime OCR/network downloads. [Tesseract's offline configuration](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) and [bundled language data](https://github.com/naptha/tessdata/blob/gh-pages/README.md) describe those assets. The OcrProvider interface allows a later native/MSIX provider.

The small C# capture helper is separate from recognition. It uses public Win32 window/monitor metadata and GDI screen capture. Automatic mode identifies visible windows belonging to StarCitizen.exe through PROCESS_QUERY_LIMITED_INFORMATION and QueryFullProcessImageName; it never requests VM_READ, reads game memory, injects code, or sends input to the game. The focused game window takes priority, otherwise exactly one visible game window is required. Display overrides are validated against connected monitors. The helper has a PerMonitorV2 DPI manifest, uses physical display bounds, supports negative monitor origins, and captures the selected whole display.

### Workflow in Star Citizen

1. Start Cargo Run using npm run dev, or npm run build followed by npm start.
2. Open Settings → Windows capture & OCR prototype. Check **Engine available**, connected displays, and **Registered** shortcut status.
3. Keep automatic Star Citizen display targeting, or explicitly select the monitor containing the game. Configure the default **Ctrl+Shift+F9**, enable/disable it, and choose whether capture sounds are enabled. A conflict is displayed as a failure; choose another Ctrl/Alt combination and save it.
4. Run Star Citizen in **borderless fullscreen**, focus Mobiglas → Contracts → Accepted, and select a contract.
5. Press the shortcut. A short success tone means the screenshot was saved and queued. Wait for this confirmation before changing the selected contract; OCR can continue in the background. A distinct warning tone means capture failed, not that OCR failed.
6. Select another contract and repeat. Cargo Run can remain minimized; capturing does not show/focus its window. The application contains no timed capture and no player-input automation.
7. Return to **Scan Review**. Select captures, inspect the full-resolution screenshot, read the extracted fields, source evidence, provider confidence when available, warnings, raw text and bounding boxes. Retry failed OCR when its screenshot is still present, delete individual captures, or clear the collection after confirmation.
8. Restart Cargo Run to verify persisted captures/settings. Interrupted recognition with a committed screenshot resumes; an interrupted unsaved screenshot is marked failed with a recapture instruction.

Automatic process detection was implemented but has not been validated with a real running Star Citizen session. For a non-game desktop test, explicitly select a display in Settings; automatic mode deliberately rejects unrelated windows. Full-display captures include other visible content on that display.

### Capture, queue and storage semantics

Screenshots and thumbnails are local PNG files in **app.getPath('userData')/captures**; Settings shows the exact directory. Unique CaptureIds are observations, not MissionIds. Capture metadata, status, source, display, timestamps, screenshot references, attempt/error details, raw OCR and parsed observations live in a separate **ocr_captures** table. Schema version **2** adds that table transactionally to the Phase 2 database without changing existing contract rows. OCR settings use the separate ocr.settings key.

Screenshots are saved in request order, independently of OCR. A single recognition worker processes committed images in order, with at most 12 pending captures and 50 stored records. Images are limited to 32 MiB each, 33 megapixels, and a reserved 512 MiB total storage budget. The original capture retains its physical resolution; recognition is normalized to at most 3200 pixels on its longest edge. Bounding boxes refer to the normalized OCR image dimensions stored with the result, so they can be mapped back to the original screenshot.

The capture helper rejects empty/almost-black frames rather than issuing a success confirmation. Protected/secure desktops, exclusive fullscreen surfaces and some overlays may be unavailable; use borderless mode and inspect the reported error. Capture sounds use locally generated WAV tones through Windows SoundPlayer. Output routing was exercised, but subjective audibility was not verified; Windows volume/output-device settings still apply.

Capture states are Captured, Processing, Processed and Failed. Captured includes a briefly pending screenshot save. A processed image with no recognized text has an explicit warning; it does not turn a valid screenshot into a failed capture. Recognition failures do not play a failed-capture tone after the screenshot's success tone. Deleting an active capture discards its later OCR result. Clearing removes only OCR records/files. OCR diagnostics retain up to 256 KiB of raw text and 3000 positioned lines per capture; any truncation is explicitly warned. Shutdown unregisters the owned shortcut, stops the helper and cancels pending recognition without waiting for its 90-second timeout. Queued metadata remains available for restart recovery.

### Recognition capabilities and limits

The extraction parser uses positioned OCR lines, label anchors and relative column regions rather than exact resolution coordinates. It recognizes Reward, Contracted By, PRIMARY OBJECTIVES, DETAILS, Deliver and Collect. Cargo quantity/destination rows come from Primary Objectives; quantities in Details are not counted again. Details/Collect text supplies explicit pickup information. Multiple commodities, repeated destinations, wrapped objective/title/reward lines and nonnegative fractional quantities are supported.

Each field records its value, source lines/region/box, Explicit or Structured method, and Recognized/Ambiguous/Missing state. Engine-provided line confidence is retained; no synthetic confidence percentage is created for missing or combined evidence. Missing delivered quantities, company, title, reward and pickup remain unknown. Both OFFERS and ACCEPTED being visible without explicit selected-tab evidence is **Ambiguous**, not automatic acceptance.

All observations are marked potentially incomplete because the objectives list may scroll. Only visible delivery rows are counted. Identical rows with distinct evidence are retained with an ambiguity warning; separate captures are never deduplicated into one mission based on matching title/reward/cargo. Acceptance timestamps and real mission/objective identifiers are not guessed.

**No automatic OCR contract creation, status update, Game.log reconciliation, or timed automatic capture is implemented.** OCR observations do not appear as contracts in Dashboard, Manifest or History.

No reference game screenshots were attached to Task 03A. The parser and image integration tests therefore use synthetic text/layout fixtures. Actual Mobiglas fonts, backgrounds, HDR, localization, scroll clipping, UI changes and selected-tab styling still need real-game validation.

### OCR architecture and tests

| File                                                 | Responsibility                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| resources/native/CaptureHost.cs and capture.manifest | Fixed Windows metadata/display/capture/sound protocol, no game input or memory access |
| scripts/build-native.cjs                             | Compile the local helper and generate short success/warning WAVs                      |
| electron/main/ocr/nativeHost.ts                      | Bounded main-process child protocol, timeouts and cleanup                             |
| electron/main/ocr/provider.ts                        | Replaceable local recognition provider and worker lifecycle                           |
| electron/main/ocr/parser.ts                          | Independently testable, positioned contract observation extraction                    |
| electron/main/ocr/repository.ts and queue.ts         | Separate SQLite records, queue order, recovery, limits, retry and deletion            |
| electron/main/ocr/integration.ts                     | Local asset resolution, image normalization and protected image protocol              |
| src/types/ocr.ts                                     | Capture, result, evidence and observation models                                      |
| src/stores/useOcrStore.ts                            | OCR-only renderer mirror and narrow asynchronous actions                              |
| src/pages/ScanReview/index.tsx                       | Screenshot/raw text/field/objective/evidence review                                   |
| src/pages/Settings/OcrSettings.tsx                   | Engine/shortcut/display/sound/storage/queue controls                                  |
| tests/fixtures/ocr.ts and tests/ocr-*.test.ts        | Synthetic extraction, queue, provider, migration and conflict tests                   |
| tests/native/OcrFixture.cs and tests/ocr-desktop.cjs | Separate synthetic Windows window and actual native capture/OCR verification          |

The preload exposes only fixed OCR actions and CaptureId-based reads/deletes/retries. Screenshots are served through a UUID-validated cargo-capture protocol; no renderer filesystem, shell, native-process or arbitrary screenshot-target API is exposed. Packaging configuration includes the helper/sounds and unpacks local Tesseract worker/core/data assets. Generated native binaries, WAVs, test profiles and screenshots remain ignored build/test artifacts.

Additional commands:

```powershell
npm run native:build
npm run test:ocr:desktop
```

The OCR desktop test displays only its synthetic test form on the primary display, exercises the genuine registered shortcut while that separate application is focused and Cargo Run is minimized, captures three 3840×2160 images, verifies four objectives and raw boxes, rejects a black frame, opens the protected preview, restarts metadata/settings, disables the binding and clears captures. Its keyboard simulation is restricted to its own fixture window; the application itself contains no player-input automation. No real-game capture test was performed.

Recommended Phase 3B work: obtain explicit game screenshot fixtures, validate fonts/HDR/UI scales and tabs, improve region preprocessing and evidence overlays, add correction/review tools, benchmark retention/performance, and design explicit reviewed OCR/log association using real IDs and timestamps. Revisit a Windows.Media.Ocr provider if MSIX package identity is introduced. Do not merge independent missions solely by identical visible cargo.
