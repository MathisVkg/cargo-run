# Cargo Run 0.3.2

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
| npm test             | 101 domain, parser, storage, streaming and OCR tests                             |
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

TypeScript, lint, 101 unit/integration tests, production build, both actual Windows Electron workflow suites, and a separate development launch smoke check passed. Phase 2 desktop tests verified three application restarts, persisted manual contracts and ship selection, saved monitoring configuration, forward-only first start, partial-line resume, automatic completion without unconfirmed earnings, repeated imports without duplicates, parser failure inspection, log replacement, ERROR recovery, and retained run snapshots.

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

Task 03A initially used synthetic fixtures. Task 03A.2 adds five genuine screenshot-derived OCR fixtures, as documented below. HDR, localization, further UI scales, scroll clipping and selected-tab styling still need broader game validation.

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

## Task 03A.1 / 03A.2 reliability update (v0.3.2)

Structured extraction now uses the real Mobiglas header arrangement: title above Details, metadata in the adjacent right-hand panel, label/value pairs sharing a row, and separate Details/Primary Objectives columns. The reward value can be far to the right of its label. Checkbox glyphs recognized as `<>`, `¢`, `&`, or similar symbols are stripped only from the parser's working text immediately before a Deliver/Collect verb. Original OCR lines and confidence remain unchanged. Collect rows following each delivery can supply that delivery's pickup even when one commodity has multiple pickup locations. Internal destination punctuation remains intact. Missing/clipped destinations retain valid quantities and visible evidence with warnings. Both visible tab labels remain Ambiguous unless explicit selection evidence exists; OCR text does not recover the highlighted tab's color.

**Scan Review → Reprocess saved OCR** reruns only structured extraction from the selected capture's existing OCR result. It keeps the CaptureId, screenshot, raw text/boxes/confidences, status, timestamp and OCR attempts. It does not capture another image, rerun Tesseract, or change contracts. New observations identify parser version 0.3.2.

### Evidence and fixture provenance

Five original 3840×2160 screenshots were found in the user's supplied Cargo Run captures folder. They were read without changing the live database or images and recognized again with the existing offline Tesseract engine. Regression JSON under `tests/fixtures/mobiglas` records original image SHA-256, dimensions, and genuine engine text/boxes/confidences. The player HUD was excluded from the exported line subset; original screenshots and full temporary exports are not committed.

The available 65,250 aUEC image visibly contains **7+6+7+5 = 25 SCU**, four delivery objectives across Pressurized Ice and Processed Food, two Rayari destinations and Port Tressler pickups. It is deliberately tested as 25, rather than rewritten to match an earlier reported total. The other available images show 48,500 aUEC / 13 SCU (three captures) and 50,250 aUEC / 11 SCU (one capture). All five now produce title/company/reward and their visible delivery rows.

The original 61,500 / 8 SCU image and an actual 65,250 / 18 SCU image were not present. Their reported data are covered separately: the 61,500 / 8 SCU case uses reconstructed text in both the earlier representative fixture and the real header/panel geometry; the 65,250 / 18 SCU variant uses explicitly modified quantities with no claimed engine confidence for edited lines. The original synthetic 18 SCU / four-objective tests also remain. These variants are not claimed as original screenshot OCR.

### Shortcut registration, recording and diagnostics

Electron remains the default capture backend. Registration only proves the binding was reserved at that moment. A callback proves delivery in the foreground context being tested; `CaptureRequested`, `CaptureSaved` and `CaptureError` establish what happened afterwards. A registered shortcut with zero callbacks is shown as **invocation unverified**. Settings keeps at most 50 diagnostic events, plus counts and the latest read-only Windows process/elevation context. No window titles, process paths or typed text are logged by shortcut diagnostics. A possible privilege mismatch is a clue, not a confirmed explanation; Cargo Run does not elevate itself.

Use **Record Shortcut**, press the combination, inspect it, then **Save shortcut**. Escape/Cancel/focus loss restores the saved binding; a 45-second lease also releases recording. Both input observers and capture are paused while recording, including the confirmation step. Standalone F8/F9 and supported Ctrl/Alt combinations can also be typed manually. F12 is rejected because Windows reserves it for debugging. Conflicts are visible and never silently treated as operational shortcuts. Keyboard recording uses logical letters for the active layout.

### Optional development Raw Input prototype

The prototype is **off by default and excluded from packaged releases**. It runs in its own Windows process with a hidden message-only window. It registers keyboard usage page 1 / usage 6 through `RegisterRawInputDevices` with `RIDEV_INPUTSINK` and device notifications, processes `WM_INPUT`, and performs normal default message cleanup. It does not use NOLEGACY or input-suppression flags. Raw Input observes the configured chord and leaves the foreground application's input available.

Only configured-key pressed/released state and modifier state live transiently in memory. Repeat makes do not invoke again until target-key release. Left/right modifiers are handled, current foreground keyboard layout determines scan-code mapping, layout/device changes clear transient state, and AltGr is rejected to avoid matching text entry. Release all keys after starting/reconfiguring or changing layouts; keys already held before registration cannot be reconstructed reliably. Printable letters/digits require Ctrl or Alt. Only readiness/errors and configured-chord notifications cross the local pipe; no raw keystroke history, device history, key text, network telemetry, hooks, DLL injection, game memory reads, game-file changes or anti-cheat workarounds are introduced.

Build it explicitly, then launch an unpackaged development session:

```powershell
npm run native:raw-input
$env:CARGO_RUN_INPUT_PROTOTYPE = "1"
$env:CARGO_RUN_SHORTCUT_BACKEND = "electron"
$env:CARGO_RUN_SHORTCUT_COMPARE = "1"
npm run dev
```

Settings shows the selected capture backend, comparison setting, Raw Input Starting/Listening/Error state and each backend's invocation count for the current configuration. Listening requires the native helper's successful registration acknowledgement; it does not prove input delivery. Counts reset on settings/registration changes and can be reset with **Reset diagnostics**. The diagnostic event list remains capped at 50.

To select Raw Input as the only capture trigger, stop that development session and relaunch with:

```powershell
$env:CARGO_RUN_SHORTCUT_BACKEND = "raw-input"
$env:CARGO_RUN_SHORTCUT_COMPARE = "0"
npm run dev
```

Set comparison to `"1"` only when deliberately comparing both observers. Both may count the same physical press, but **only the explicitly selected backend can invoke capture**. The Electron observer reserves its binding even in comparison mode; use Raw Input alone to assess non-consuming input. A failing Raw Input helper does not switch capture backends automatically. Close the experiment and relaunch with the Electron selection, or unset all three environment variables to restore the normal default session. Manual capture stays available.

Microsoft describes [Raw Input registration/readout](https://learn.microsoft.com/en-us/windows/win32/inputdev/using-raw-input), [INPUTSINK flags](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawinputdevice), and [keyboard make/break data](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawkeyboard). Electron documents [globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut) as an out-of-focus API; its registration return value still cannot establish delivery in a particular game.

### Exact next Star Citizen test

1. Close other Cargo Run instances so they do not reserve the same chord. Choose an unused key such as F8, and use the existing manual capture path as a baseline. Keep the game display/borderless mode configured as in the working manual capture test.
2. Start Electron-only mode (prototype off, or Electron selected with comparison `"0"`). Save F8, check registration, reset diagnostics, and release every key. Focus a normal app, press/release F8 once, then return to Cargo Run. Check one Invocation and one CaptureSaved, or the exact CaptureError.
3. Reset diagnostics again, focus Star Citizen, open the desired Mobiglas contract and press/release F8 once. Return and record callback count, capture result, selected binding, backend, foreground/elevation metadata and screenshot. Zero Invocation means no delivery was observed; Invocation followed by CaptureError is a capture problem.
4. Stop the app. Build/launch the optional Raw Input mode above with comparison `"0"`. Confirm **Listening** before testing. If Error/launch blocked appears, stop and report it; do not disable security controls or attempt a bypass.
5. Release all keys and repeat the normal-app test with the physical keyboard. If Raw Input stays at zero, stop the Raw Input trial and use Electron/manual capture; do not infer game compatibility from Listening. Only after normal-app delivery succeeds, reset diagnostics and repeat the Star Citizen test. Test a held key and release/repress: one match per physical press is expected. Verify gameplay still receives its normal input. Test the actual keyboard layout; avoid AltGr chords.
6. Optionally restart in comparison mode, reset counters, press/release once in each foreground app and record both counts. Only the selected backend should create a capture. Comparison is diagnostic and is not a claim of game compatibility.
7. Use Scan Review → Reprocess saved OCR on retained captures. Check the visible title, reward, objectives, quantities, pickups and evidence against the screenshot. Do not interpret a scrolled/partial objectives panel as the complete mission.

**No Star Citizen-focused shortcut test was performed by the agent. Raw Input game delivery is unverified.** Vulkan/borderless mode, anti-cheat behavior and privilege mismatch are not established root causes from these tests.

### Verification for v0.3.2

- TypeScript, lint, **101 automated tests across 10 files**, optional Raw Input compilation and production build passed.
- Actual Windows manual-contract/security/navigation suite and SQLite/Game.log workflow suite passed.
- Using the computer-use skill, a separate synthetic Windows application was focused with Cargo Run minimized. Electron F8 and Ctrl+Shift+F9 each delivered a real OS callback and saved/processed a screenshot; focus stayed outside Cargo Run. Ctrl+Shift+S initially reported a conflict while another Cargo Run instance was open. After that instance closed, the retained full WinForms capture/OCR harness passed for Ctrl+Shift+S, F8 and Ctrl+Shift+F9, including three 4K queued captures, OCR/evidence, black-frame rejection, restart, disable/clear and zero contract creation.
- Saved real-game OCR was tested in an isolated Windows UI profile: Reprocess preserved raw evidence and attempts, protected image preview loaded, F8 recorder save and Escape cancellation created no captures, and no contracts were created.
- Earlier helper builds were blocked by Windows Code Integrity (event 3077), and the Error path was verified without changing any security settings. The final build successfully registered and reached **Listening**. With a separate Windows app focused, an automated F8 press produced Electron=1, RawInput=0. The user then confirmed a physical F8 test in that window: Electron's cumulative count rose to 8, while RawInput stayed 0. With Raw Input selected there were no captures and no duplicate/fallback trigger. **Raw Input is unreliable in this tested setup despite successful registration.** The receive/match failure has not been isolated further; game compatibility is unverified. Electron remains the production default. The WinForms capture/OCR harness was initially blocked but passed on the final rerun; no security setting was changed.
- Dependency audit reports zero vulnerabilities. Installer signing/packaging and in-game delivery remain unverified.

`npm run test:ocr:review` runs the saved OCR review/recorder workflow in an isolated profile. It uses the committed OCR JSON and optionally previews the original image if that file is still in the local captures folder. `npm run test:ocr:desktop` remains the full synthetic capture/OCR harness for hosts that permit its compiled WinForms test executable.

Game.log creation, OCR-to-contract persistence/reconciliation and automatic scanning behavior are unchanged. No Phase 3B work was started.
