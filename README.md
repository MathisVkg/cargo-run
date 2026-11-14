# Cargo Run

Cargo Run is a Windows desktop companion for Star Citizen. It helps players organize accepted hauling contracts and understand their pickup and delivery requirements. Current application version: **0.8.1**.

## Features

- **Contracts:** compact expandable ledger, multiple objectives, manual creation and editing, explicit completion or abandonment.
- **Screenshot recognition:** Add Contract takes one Star Citizen window capture into an editable review. Save explicitly; retry or reprocess saved evidence when needed. Offline English OCR also supports a configurable global screenshot shortcut.
- **Automatic capture:** optional Game.log acceptance-triggered screenshots and recognition. Clear, accepted observations can import automatically; ambiguous observations remain under Contracts → Needs review.
- **Cargo:** pickup and delivery summaries grouped by location, commodity and route; optional reminders, selected-ship capacity overview and a schematic cargo grid.
- **Ships:** bundled offline catalog, search, favorites and recent selections.
- **History:** closed contracts, confirmed earnings, search, filters and saved run snapshots.
- **Settings:** capture policies, retention, shortcuts, Game.log monitoring, backups and guarded local cleanup/reset.
- **Local storage:** SQLite persistence, screenshots and OCR evidence; no account or hosted backend.

Automatic **contract completion (Beta)** is experimental and off by default. It is separate from automatic screenshot capture. The optional Windows Raw Input shortcut prototype is development-only; Electron remains the normal shortcut backend.

## Requirements

- Windows 10/11 **x64**, with an unlocked interactive desktop for capture.
- **Node.js 24 or later**, as required by package.json; npm with the committed package-lock.json. Validation uses Node 24.
- **.NET Framework 4.8** and its x64 C# compiler at Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe for the native capture helper. No separately compiled SQLite addon: persistence uses Node's built-in node:sqlite inside Electron.
- Internet access for the initial npm dependency/Electron download. The root postinstall invokes the locked Electron package's checksum-verified installer (Electron 44 no longer installs its executable implicitly). OCR language data is bundled and recognition runs offline.

## Development

Run from the repository root in PowerShell:

```powershell
npm ci
npm run dev
```

Development uses Vite hot reload and an incremental native-helper build. It does not run a production build or TypeScript check on every launch. Generated profiles/build output are excluded from the renderer watcher and CSS scanning.

## Build and run

```powershell
npm run build
npm start
```

The build prepares native assets, checks TypeScript and builds main, preload and renderer. Start previews the existing production output. Rebuild after source changes. Windows packaging is available through npm run package:win; it is not required to develop or preview the app.

## Data storage

Normal Windows user data lives under **%APPDATA%/Cargo Run**:

- cargo-run.sqlite, with SQLite WAL/SHM sidecars while open.
- captures/: screenshot PNGs and thumbnails; OCR observations and links are stored in SQLite.
- backups/: local data-management backups, including a SQLite copy, screenshots and a manifest.

The actual database path is shown in Settings → Data Management. Cleanup previews its impact and creates a backup before changing data. Recorded onboard cargo protects closed contracts from ordinary cleanup; unload/correct it through retained inventory first. Full reset requires typing RESET, preserves supported preferences/ship selection and stops monitoring. Capture retention follows configured policy and evidence protection rules. Back up with Cargo Run closed before upgrades; restore compatible backups with the app closed rather than modifying a live database.

For development or testing with disposable data, set CARGO_RUN_TEST_USER_DATA to an absolute separate directory **before** running dev or start. This override is honored only by unpackaged builds. It never applies to packaged releases. See [developer documentation](docs/development.md) for isolated workflows and tests.

## Limitations

OCR accuracy depends on screenshot clarity, layout, text and numeric confidence. Review quantities and routes when uncertain. Window capture can fail with minimized windows or particular graphics modes; real Star Citizen/Vulkan capture and shortcut callback delivery must be verified in your game setup. Successful shortcut registration alone does not prove callbacks reach the app while the game is focused.

Cargo planning and reminder marks are not verified physical inventory. The grid has symbolic proportions; detailed ship geometry and container packing are not implemented. Optional retained cargo records describe explicit player entries. Automatic contract completion is experimental and depends on supported Game.log evidence and identity safeguards.

## License and attribution

Application code is currently marked **UNLICENSED** in package metadata; no open-source license grant is supplied. Cargo Run is independent and is not affiliated with Cloud Imperium Games. Star Citizen and associated names belong to their respective owners.

The bundled ship catalog is adapted from Star Citizen Wiki contributors under **CC BY-SA 4.0**. Preserve [catalog attribution, revision details and license links](src/data/ships.LICENSE.md). Dependency licenses and notices remain with their packages; Electron packaging tooling is retained.
