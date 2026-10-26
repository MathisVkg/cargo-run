# Cargo Run v0.3.0 — Task 03A handoff

Implemented directly in C:\Users\zeyros\Documents\repository\cargo-run. The existing Electron app, Fleet Operations design, SQLite/Game.log tracking, manual contracts and safe run finalization are preserved.

## 1. Files created and modified

New source: electron/main/ocr/{integration,nativeHost,parser,provider,queue,repository,shortcut}.ts; resources/native/CaptureHost.cs and capture.manifest; scripts/build-native.cjs; src/types/ocr.ts; src/stores/useOcrStore.ts; src/pages/ScanReview/index.tsx; src/pages/Settings/OcrSettings.tsx; tests/fixtures/ocr.ts; tests/ocr-parser.test.ts, ocr-provider.test.ts, ocr-queue.test.ts, ocr-desktop.cjs; tests/native/OcrFixture.cs; vitest.config.mts.

Updated: electron/main/index.ts; electron/main/storage/database.ts; electron/preload/index.ts; src/types/desktop.ts and models.ts; src/App.tsx; TopBar; Navigation; Settings; styles; CSP in index.html; package metadata/lockfile; native build and packaging configuration; lint exclusions; existing desktop bridge assertion; README and this handoff. Source backups are under ignored work/task03a-backup.

Generated helper EXE/WAVs stay under resources/native and are ignored; packaging includes them as build resources. Runtime/test captures and profiles remain untracked. No game files or existing contract records were changed for OCR.

## 2. Architecture decisions

Capture and OCR are separate. Electron globalShortcut triggers a resident, hidden-console Windows helper. It captures the game display immediately in request order, saves a PNG and thumbnail, then confirms capture after SQLite queue metadata is committed. Recognition is independent, asynchronous and serial in a Tesseract worker. Users can capture another selection after the success tone without waiting for OCR.

Automatic display detection verifies StarCitizen.exe through public process/window metadata (limited process query, not VM_READ), prioritizes the foreground game window, or requires exactly one visible game window. A connected display override supports multi-monitor setups and desktop testing. The helper uses PerMonitorV2 physical coordinates, supports negative monitor origins and never focuses Cargo Run.

SQLite schema version 2 adds a separate ocr_captures table and ocr.settings configuration. Existing domain tables and log processing remain independent. Captures are observations with CaptureIds, never fake MissionIds. The output includes capture time, source evidence, commodities, pickup/delivery locations and quantities for future reviewed reconciliation, but no association is performed now.

The renderer receives a separate revisioned OCR snapshot. Its fixed IPC methods cannot run SQL, execute shell commands, read arbitrary files or choose arbitrary native targets. Screenshot protocol paths accept only known UUIDs in the owned capture directory. Context isolation, disabled renderer Node integration, sandboxing, CSP and existing sender checks remain enabled.

## 3. OCR engine implementation and Windows requirements

Selected engine: **Tesseract.js 7 / bundled WebAssembly / bundled English data**, executed locally in a Node worker. No cloud API, upload, Python runtime or runtime language download is used. Explicit local paths resolve worker/data assets, including unpacked paths in packaged builds. Original screenshots remain full resolution; OCR normalizes the longest edge to at most 3200 pixels and retains text, lines, boxes, engine confidence and normalized dimensions.

Microsoft's [Windows.Media.Ocr documentation](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr?view=winrt-26100) specifies package identity for supported desktop-app use. Cargo Run is currently unpackaged Electron/electron-builder, so an unsupported WinRT invocation was not used. The OcrProvider interface leaves a native/MSIX option open. Offline package configuration follows [Tesseract's local installation guidance](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

Requirements: Windows 10 1703/build 15063 or later, or Windows 11, x64; .NET Framework 4.8; unlocked interactive desktop; Node.js 24+ for development. The tested host is Windows build 26200 with Electron 44.9.1. The native helper compiles with the framework compiler already supplied by Windows/.NET Framework. No .NET SDK or Windows OCR capability/language pack is needed.

## 4. Working capture functionality

- Default configurable Ctrl+Shift+F9 through Electron globalShortcut, with explicit registered/conflict/disabled status and owned-binding cleanup.
- Capture works with Cargo Run minimized and a separate application focused; capture never calls show/focus/restore.
- Native physical-monitor capture, enumerated portrait/4K displays, explicit display selection, empty/almost-black rejection and useful errors.
- Short success tone after screenshot registration and distinct failure tone; configurable sounds. OCR failure after a valid screenshot does not issue a failed-capture tone.
- Unique IDs, timestamps, source, display, file reference, status, attempts/results/errors persisted independently.
- Bounded serial queue: 12 pending, 50 stored, 32 MiB per image, 33 megapixels per image, reserved 512 MiB storage budget.
- Retry failed OCR with a retained image, deletion, confirmation before clearing, discarded results for deleted captures, startup recovery and prompt shutdown cancellation.
- Storage is app.getPath('userData')/captures; Settings displays its exact location. SQLite metadata lives in userData/cargo-run.sqlite.
- Scan Review shows thumbnails, full-resolution inspection, raw text/boxes, extracted fields/objectives, evidence, warnings and failures. Settings exposes capability, shortcut/display/sound controls, queue count and storage.
- Whole displays include other visible content; no automatic/timed capture exists.

## 5. Recognition capabilities

The pure parser uses relative regions, OCR positions and known labels rather than fixed 1080p coordinates. It extracts title, contracted company, reward, Offers/Accepted evidence and visible Primary Objectives, plus explicit pickup information from Details/Collect text.

Verified cases include one and multiple destinations, multiple commodities, repeated destinations, repeated pickup locations, wrapped objective/title/reward lines, variable and fractional quantities, unknown/malformed fields and duplicate evidence handling. Description quantities are not counted as extra delivery objectives.

Every field has Recognized/Ambiguous/Missing state, Explicit/Structured extraction method, source region/line IDs/box/text, and real provider confidence only when appropriate. Missing values stay unknown. No artificial confidence is generated. Both Offers and Accepted tabs without explicit selection evidence are ambiguous.

All captures are potentially incomplete because objectives may scroll. Visible objective count is not a claim that the mission's full objective list was captured. Separate identical captures remain distinct observations; identical row appearances are retained with warnings rather than silently treated as unique missions.

## 6. Verification

- npm run typecheck: passed.
- npm run lint: passed.
- npm test: **64 tests passed** across six files.
- npm run build: passed, including native helper compilation and production main/preload/renderer.
- Existing actual Windows Electron desktop tests: passed for navigation, ships, manual add/edit/abandon, capacity, manifest/history, safe finalization, window controls and security.
- Existing Game.log desktop tests: passed for saved contracts/ships/configuration, streaming, completion, repeated imports, restarts, rotation/recovery and closed-run snapshots.
- New actual Windows capture/OCR test: passed using a separate synthetic WinForms application on the primary **3840×2160** display, with Cargo Run minimized. Three genuine global-shortcut captures were queued and recognized; four cargo objectives, company, reward, raw text and boxes were verified. Focus stayed outside Cargo Run. A black frame was rejected. Preview, restart persistence, disable and clear were verified.
- Unit tests additionally cover queue order, no overlapping OCR, provider failure/retry, deletion without resurrection, unknown/missing fields, shortcut conflicts, schema v1→v2 contract preservation and cancellation on exit.
- Development smoke check: passed for Dashboard, Scan Review, native display enumeration and bundled OCR availability, with no console/page errors.
- Dependency audit: **zero vulnerabilities** after compatible Electron and fast-uri security updates.
- Native audio requests and generated WAV assets were exercised; subjective audibility was not verified.
- No actual Star Citizen session or personal game screenshots were tested. No reference screenshots were attached; synthetic fixtures were used.
- Windows installer packaging/signing was not run; packaging assets/configuration were updated.

## 7. Known limitations

Raw OCR diagnostics are bounded to 256 KiB of text and 3000 positioned lines per capture, with explicit truncation warnings.

English OCR only. Real Mobiglas fonts, transparency, HDR, localization, UI versions, tiny text and scroll clipping still need game fixtures and validation. Exclusive fullscreen, secure desktops and protected surfaces may not be capturable; use borderless mode. Automatic StarCitizen.exe targeting is implemented but not tested against a real running game; explicit monitor capture was verified.

There is no reliable selected-tab inference from both tab words alone, so ambiguous cases are marked rather than guessed. Missing pickups/rewards/delivered quantities remain unknown. No acceptance timestamp, MissionId or ObjectiveId is invented. OCR quality does not determine whether the screenshot capture succeeded.

Full display images are local files, not encrypted application blobs. Queue metadata/results persist in SQLite; images are separate and removed when their captures are cleared/deleted. Interrupted unsaved screenshots are marked failed and require recapture. Interrupted committed images resume recognition. An in-flight result for a deleted capture is discarded.

## 8. Exact Star Citizen test instructions

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm ci
npm run dev
```

For a production launch use npm run build, then npm start.

1. In Settings, find Windows capture & OCR prototype. Check Engine available and Registered.
2. Select automatic Star Citizen targeting, or explicitly select the correct connected display. Enable sounds if desired. If Ctrl+Shift+F9 conflicts, save another Ctrl/Alt + letter/digit/F-key combination.
3. Start Star Citizen in borderless fullscreen and focus Mobiglas → Contracts → Accepted → one contract.
4. Press the shortcut and wait for the short capture-success tone before selecting another contract. Recognition can continue while selecting/capturing additional contracts.
5. If the warning tone plays, return to Settings/Scan Review and read the capture error. A black frame is rejected rather than accepted as a screenshot.
6. Return to Scan Review, select each capture, inspect its screenshot, raw text, evidence, reward/company and visible objective rows. Expect unknown/ambiguous fields and potentially incomplete flags until validated against the game.
7. Retry a failed OCR job when its image exists; recapture if the screenshot is missing/black. Delete or clear observations when finished.
8. Restart Cargo Run to check that captures, settings and results remain. Existing Game.log and manual-contract workflows should remain unchanged; OCR itself must not create contracts or change statuses.
9. For a desktop-only validation use an explicit display. For the included synthetic verification run npm run test:ocr:desktop. Its key simulation is guarded to its own fixture window, never the game.

## 9. Recommended Phase 3B improvements

Obtain explicit real-game fixture sets across UI versions, resolutions, HDR and languages. Refine label/column recognition, selected-tab evidence, region normalization and user-correctable field review. Add evidence overlays, capture-quality metrics without fabricated confidence, retention/performance tuning and further multi-monitor game validation.

Design reviewed OCR/Game.log association around actual mission/objective identifiers, capture/acceptance timestamps and cargo evidence, with ambiguity preserved. Do not deduplicate independent missions solely by matching title/reward/cargo. Revisit supported Windows.Media.Ocr if an MSIX identity is introduced.

**Deferred by design:** automatic contract creation, contract/status overwrites, OCR/log reconciliation, timed capture, cloud OCR, uploads, game injection, process-memory reads and player-input automation.
