# Development and maintenance

## Architecture

- electron/main/: privileged Electron process, validated IPC, trackingService.ts orchestration, log/ tailing/parsing, storage/ SQLite migrations and backup/cleanup, ocr/ capture, queue, matching, review and retention.
- electron/preload/: explicit context-isolated IPC bridge. Renderer receives no generic invoke, database query, filesystem or Node API.
- src/: React renderer. pages/ contains Contracts, Cargo, History and Settings; components/ holds shared editor, ledger, ship picker, overlays and retained inventory; stores/ contains state and pure planning/domain selectors; types/ defines shared contracts.
- src/data/: bundled ship catalog, attribution and demonstration data. No runtime scraping or remote catalog load.
- resources/: icons and native C# source/manifest. scripts/ builds native helpers and maintains the catalog. electron-builder.yml preserves Windows packaging.
- tests/: Vitest domain/service regressions, current Playwright Electron workflows, sanitized OCR/log fixtures and native test fixtures.

SQLite schema is 9. Historical migration paths remain in storage/database.ts; do not remove them when cleaning UI code. Legacy persisted navigation preferences remain readable even though the sidebar no longer exists.

## Startup and resources

Tracking loads/migrates SQLite before exposing its initial snapshot. The window is then created without awaiting native display discovery or the first Game.log poll. Snapshots are available immediately; service-dependent IPC waits on one shared initialization promise. Capture/recovery initialization is visible in OCR settings. Failures retain existing error reporting; no service is silently omitted. Shutdown waits for startup and queued mutations, then closes capture, OCR and monitoring before SQLite.

The Tesseract worker and language data are initialized on first recognition, not app launch; pending capture recovery can legitimately trigger recognition on restart. The offline worker is reused and terminated on shutdown. Game.log has one serial poll chain; repeated reads share the in-flight operation. Static catalog data is bundled, not fetched. Initial renderer reads share only their in-flight request; snapshots are never cached across mutations. Per-snapshot workflow/domain reads are reused without long-lived stale caches.

Vite watches application source, excluding work/, backups/, out/, dist/, coverage/ and generated native assets. Tailwind scanning is limited to src/\*_/_.ts(x); its reset/theme/build integration remains required. npm ci runs the project postinstall to install the locked Electron 44 executable using its bundled checksum manifest. This step is idempotent; do not disable npm or Windows security controls.

All current npm dependencies are used by application, build, types, tests or packaging; keep dynamic OCR and Electron-builder dependencies even when absent from renderer imports.

## Disposable profiles

Never run data cleanup/reset against real user data for testing. In a fresh PowerShell terminal:

```powershell
$env:CARGO_RUN_TEST_USER_DATA = Join-Path $env:TEMP ('cargo-run-test-' + [guid]::NewGuid())
npm run dev
# Or: npm run build; npm start
```

Use --no-shortcuts with benchmark:startup when a game remains running: an ignored entry wrapper supplies a no-op global shortcut API; the native helper only discovers displays and no captures are requested. This condition is recorded separately in benchmark JSON.

The override deliberately does not depend on NODE_ENV: electron-vite sets that variable itself. Packaged applications ignore the override. Close the app before inspecting or copying its test database. Remove the environment variable when returning to normal use.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run test:desktop
```

The desktop command builds once, then executes five suites serially: shell/editor/Cargo/history/cleanup/security/layout, native one-shot OCR review/reprocess/restart, automatic capture/duplicates/retention, separate-window capture, and Game.log tailing/rotation/partial-line restart. Focus-sensitive native fixtures refuse to run when a real StarCitizen process exists. All use owned work/ profiles and generated images. When a real game must stay running, use npm run test:desktop:isolated. That command runs four current suites against an ignored build copy with a test-only generated-image backend and no-op shortcut API. It does not enumerate/capture windows, spawn the native capture helper, register global shortcuts or launch a synthetic StarCitizen process. Real Tesseract, IPC, SQLite, editor, scheduler and monitoring still run. This mode explicitly excludes native capture verification and the separate-window suite; never report it as native/game validation. Production source and normal builds do not load the adapter.

Individual entrypoints are test:ui:desktop, test:ocr:desktop, test:automatic:desktop, test:window:desktop and test:tracking:desktop.

Replaced Dashboard/Manifest/standalone Scan History/side-navigation harnesses are removed with their components. Current shell workflows cover their supported replacements; OCR quantity/multi-objective extraction, matching, corrections, migration, cargo allocation/audit, lifecycle Beta, cleanup, retention and recovery remain in the service-level Vitest suites. Sidebar-only breakpoint assertions are obsolete; legacy preference persistence/validation tests remain. Never remove shared regression fixtures or service assertions simply to reduce test size.

## Startup measurements

```powershell
npm run benchmark:startup -- local
```

The Windows benchmark creates isolated profiles in work/performance, launches the actual npm run dev twice, builds, then launches npm start for fresh and populated profiles. The populated profile contains 50 manual contracts and monitoring of an empty owned Game.log. It checks the database path before seeding. Results/logs are generated outputs, not repository documentation. Timings include npm/tool startup and CDP navigation confirmation; they are not reboot-level cold disk-cache measurements. The first dev run is not necessarily a cold Vite dependency cache. Append --cold-cache to remove only the project node_modules/.vite cache before measurement. For repeatable cache-cold runs use a fresh isolated npm ci checkout; compare the same command/profile/cache conditions. Do not flush OS caches or disable security tooling for benchmarking.

CARGO_RUN_STARTUP_METRICS=1 enables at most 40 main-process stage timing lines per process, including SQLite, native display discovery, initial data queries and first lazy OCR worker creation. It logs no paths, contract contents or keystrokes. Normal launches do not log those metrics. Benchmark remote debugging is passed only by the development tool, not enabled by application code.

## Game verification

Use a disposable profile to verify Add Contract with an accepted Mobiglas contract: confirm the actual game window image, correct fields, explicitly save, reprocess without recapture and restart. For automatic capture, select Game.log in Settings, enable monitoring and the desired acceptance capture policy, then accept a new contract. Check the current result and evidence in Contracts. Verify shortcut callback counters increase with physical presses while Star Citizen is focused; registration alone is insufficient. Test graphics modes yourself: synthetic Windows fixtures do not establish Star Citizen/Vulkan reliability.

## Generated files

node_modules/, out/, dist/, work/, coverage/, caches, logs, SQLite temporary databases, generated native binaries/sounds and scratch outputs are ignored. Keep canonical sanitized tests/fixtures and native test sources. Never treat user-profile backups or screenshots as repository scratch files. Project documentation describes current operation and maintenance; development-session reports belong outside the repository or in Git history.
