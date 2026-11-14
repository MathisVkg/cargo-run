# Cargo Run v0.8.0 — foundation rebuild

## Implemented application

Exactly four fixed bottom destinations: **Contracts, Cargo, History, Settings**. The frameless top bar retains logo/name, ship/SCU selection, Add Contract and standard Windows controls. Content scrolls independently; there is no navigation hiding. The configured minimum is reduced from 1100 × 700 to **480 × 560**.

- **Contracts:** compact, paginated active ledger. Collapsed rows show title, concise pickup/destination, objective count, accessible status icon and expansion control. Expansion reveals company, potential reward, objective commodity/quantity/routes, source, linked screenshot and Complete/Edit/Abandon. Legacy active records without objectives show Needs review without changing their stored status.
- **One editor:** Add Contract opens a centered editor and requests one Star Citizen window capture. It does not substitute the Cargo Run foreground window or use a saved Full Display fallback. Fields remain editable while recognition runs; untouched fields populate from OCR while typed changes are preserved. Save waits for recognition or failure. Failure leaves manual entry available; Capture again explicitly requests one fresh capture.
- **OCR editing/recovery:** the same editor supports manual entries, OCR corrections, original screenshots, saved-image reprocessing, field conflicts, objective identity/removal safeguards and explicit attachment. Missing/ambiguous fields remain unsaved. Unassociated captures are accessible through the small Needs review disclosure in Contracts. Attached captures cannot be casually deleted from the editor. Expired screenshot evidence remains readable under Advanced.
- **Cargo:** required SCU of active canonical contracts, independent of physical onboard/delivered records. Location summaries aggregate commodity plus destination/origin; different routes stay distinct. Individual cards/groups collapse. Optional secondary reminders update only the represented objective IDs. Wide windows use pickup/delivery/schematic columns; narrow/portrait windows stack in that order. A capacity warning does not prevent contract entry.
- **Schematic:** isolated, non-interactive 48-cell proportional 2D capacity component. It explicitly represents planned capacity, with unknown ship geometry; it does not claim accurate container positions or physical loading.
- **History:** completed/abandoned ledger, completed count/known required SCU/confirmed earnings, search/status filter, pagination, expandable details and guarded cleanup. Immutable saved run snapshots remain accessible in a disclosure. Potential rewards never become confirmed earnings.
- **Settings:** General, Capture & OCR, Automation, Data Management, About & Diagnostics. Existing catalog/favorites, capture preferences, optional Game.log, Beta completion, retention, diagnostics and backup/reset services are reused. Beta remains Off by default; existing opt-in settings are preserved. Retained physical records are managed in a separate recovery dialog, with ship selection and existing guarded controls.

## Backend and database changes

No SQLite migration or table changes: **schema remains 9**. Old contract/objective/run/capture JSON, evidence, preferences, checkpoints and physical cargo remain compatible.

A small persisted optional capture field, `reviewMode: "Editor"`, distinguishes observations that must wait for explicit review. New editor captures set it before capture begins. Editor reprocessing also holds recognition for review. `TrackingService.processScan` skips implicit import for these records; explicit confirmation still uses the existing version/hash checks, duplicate protection, objective identity, provenance/audit and transactional review implementation. The marker survives restart. Other shortcut/automatic observations retain their existing import path.

Two new trusted preload/IPC methods:

- `ocrCaptureEditor()`: returns this request's capture ID and snapshot; forces Window mode and disables display substitution for that single request, without rewriting saved policy.
- `ocrReprocessEditor(id)`: reruns saved-image OCR with review-only intent, without taking a screenshot. Existing OCR result quality/recovery logic remains in use.

No OCR engine/parser, matching rules, earnings calculations, Game.log reconciliation, automatic lifecycle defaults or physical progress algorithms were replaced. No live profile, user captures or Game.log was changed during tests. An old binary predating review-only intent will not enforce that marker; restore the pre-upgrade backup if rolling back rather than opening pending editor captures with older code.

## Validation

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm test`: **392 tests across 30 files**, including all 385 pre-existing tests.
- `npm run build`: native host plus production main/preload/renderer.
- `node tests/redesign-desktop.cjs`: four-section startup, editor/manual fallback, ledger/edit, route aggregation, objective reminder isolation, actual ship picker/capacity changes, capacity warning, landscape/portrait/minimum layouts, protected dialogs/focus, completion/abandonment, History, retained inventory/unload, blocked cleanup, backup/cleanup preserving active data, typed RESET/preferences/monitoring protection, restart/schema/FK checks.
- `node tests/redesign-ocr-desktop.cjs`: actual Windows capture of an owned synthetic game-identity process while Cargo Run is foreground, real offline Tesseract, four objective fields, typed field preservation, explicit save, screenshot access, correction/reprocess without recapture/auto-overwrite, saved-objective removal with confirmation, identity-preserving attachment, unresolved recovery/deletion, one-shot failure/Capture again, restart/FK.
- `node tests/automatic-desktop.cjs`: existing native monitored-log acceptance → scheduled capture → offline OCR; duplicate MissionId, unchanged screenshot skipping, unrelated trigger provenance, cancellation, retention and restart assertions migrated to the new Contracts editor.
- `node tests/window-desktop.cjs`: independent actual window-surface capture with overlapping content excluded. Game identity metadata is injected in this separate harness, not in production.

The automatic test now uses a stable, non-fullscreen owned synthetic window and explicit Window policy. Earlier fullscreen/display fixture attempts were sensitive to foreground content/window availability; production capture behavior was not altered to make the test pass.

The current `npm run test:desktop` builds and runs these four suites. Feature-specific npm desktop aliases now select the relevant redesigned workflow suite. Historical v0.7 page-selector scripts and superseded components remain on disk for the next task; they are not claimed to pass unchanged against removed navigation pages. Their backend unit regressions remain intact, and the current UI paths have replacement coverage. No repository/dependency/artifact cleanup was performed.

### Actual Windows viewports

| Target            | Actual renderer | Observed                                                                       |
| ----------------- | --------------- | ------------------------------------------------------------------------------ |
| Landscape         | 1440 × 900      | Compact table, three cargo columns, fixed navigation                           |
| Portrait          | 720 × 1100      | Single cargo column, readable routes, scrollable dialogs                       |
| Minimum 480 × 560 | 480 × 562       | Existing Windows/DPI height rounding retained; adaptive rows/two-row title bar |
| Maximized         | 2560 × 1392     | Fixed title bar/navigation, wide cargo columns                                 |

The monitor is 3840 × 2160 at 150% scale. No page/body horizontal overflow was found in the exercised views. Rendered screenshots were actually inspected, including expanded Contracts, portrait Cargo, editor, ship picker, Settings, History and retained recovery.

## Representative screenshots

Generated under ignored `work/ui-v080/`; rerun the tests to recreate them after a fresh checkout.

| View              | Landscape                                                    | Portrait                                                             |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Contracts         | [Contracts](../work/ui-v080/contracts-landscape.png)         | [Contracts portrait](../work/ui-v080/contracts-portrait.png)         |
| Expanded contract | [Expanded](../work/ui-v080/contracts-expanded-landscape.png) | [Expanded portrait](../work/ui-v080/contracts-expanded-portrait.png) |
| Cargo             | [Cargo](../work/ui-v080/cargo-landscape.png)                 | [Cargo portrait](../work/ui-v080/cargo-portrait.png)                 |
| Editor            | [OCR editor](../work/ui-v080/ocr-editor-landscape.png)       | [Minimum editor](../work/ui-v080/editor-minimum.png)                 |

Other views: [minimum Contracts](../work/ui-v080/contracts-minimum.png), [minimum Cargo](../work/ui-v080/cargo-minimum.png), [ship picker](../work/ui-v080/ship-picker-minimum.png), [Settings](../work/ui-v080/settings-portrait.png), [History](../work/ui-v080/history-landscape.png), [retained inventory](../work/ui-v080/retained-recovery.png), [maximized Cargo](../work/ui-v080/cargo-maximized.png).

## Exact manual checks on the user's machine

For a disposable profile (recommended for destructive tests), use a fresh PowerShell from the repository:

```powershell
npm run build
$env:NODE_ENV = 'test'
$env:CARGO_RUN_TEST_USER_DATA = Join-Path $env:TEMP ('cargo-run-v080-manual-' + [guid]::NewGuid())
& .\node_modules\.bin\electron.cmd .\out\main\index.js
```

1. Launch and verify only Contracts/Cargo/History/Settings appear at the bottom. Resize to landscape, portrait and the new minimum. Check scrolling, ship selection and all window controls. Open a dialog, use Tab/Shift+Tab/Escape, and verify outside clicks do not dismiss it.
2. With Star Citizen closed, click Add Contract. Confirm one failure is explained and type a valid title, company/reward, pickup, commodity, destination and quantity. Add a second objective, save, expand, edit and restart.
3. For real capture verification, show an accepted hauling contract in the actual game. Click Add Contract from Cargo Run on the secondary screen. Verify the preview shows the **game**, not Cargo Run; verify recognized title, company, reward, all objectives/SCU and destinations. Correct a field while OCR runs and confirm it is retained. Save only after review. Repeat with a minimized/unavailable game window and confirm manual fallback.
4. Open an OCR contract's editor. Open the screenshot, change an incorrect field, save conflict choices where needed, and rerun saved OCR. Reprocessing must not capture another frame or overwrite the contract automatically. Test the Needs review entry by canceling a fresh capture; attach it explicitly or delete it through confirmation. If objective mapping is ambiguous, use that row's Advanced identity control. Removing saved objectives requires explicit confirmation and remains subject to cargo safeguards.
5. Add contracts sharing a commodity/pickup/destination and another using a different destination. Verify the same-route total aggregates while the different route remains separate. Select a smaller ship to see a warning; select a larger ship and confirm the numerator stays unchanged. Toggle reminders; physical cargo, contract status and confirmed earnings must remain unchanged.
6. Complete and abandon contracts through confirmation. Verify History statuses, completed SCU, zero invented earnings, search/filter, pagination and expanded evidence. Inspect old saved runs where present.
7. In a disposable profile only, test cleanup with retained cargo: the reason and recovery path must appear, and assigned-ship unload/correction must remain available. Clear closed history after unloading, verify a backup and preservation of active contracts, then test the separately guarded RESET flow if desired.
8. In Settings, inspect existing capture/shortcut preferences and optional Game.log automation. Beta completion should be Off unless you previously opted in. Test automatic capture with real accepted game notifications separately from manual editor capture. Registration is not proof of callback delivery; use the existing diagnostics with the real game focused.

Automated native fixtures are named `StarCitizen.exe` only inside owned test directories to exercise existing process/window validation. These tests refuse to run alongside a real Star Citizen process and close only their own fixture. They are not real gameplay or Vulkan/anti-cheat/shortcut-delivery verification.

## Known limitations and intentionally deferred work

- This is the working foundation, not final visual polish. Schematic geometry is a labeled placeholder; no 3D, packing, trading or routing logic is added.
- Exact Star Citizen/Vulkan/background/minimized behavior, physical global shortcut delivery and portrait hardware/display scaling beyond the tested environment still require real-game verification.
- Explicit Window capture can fail if the game has no usable render surface; it fails closed and leaves manual entry available. It never silently captures the Cargo Run foreground window.
- Existing physical records, run-closing services and review/lifecycle APIs remain; detailed physical forms are excluded from the primary Cargo page. Recovery controls are in Settings.
- Current lists use client-side pagination under the existing snapshot architecture. Performance work, unused-page/style/test-file cleanup and repository organization are deferred.
- Direct editing of Log-owned contracts retains the existing backend restriction; new OCR may be explicitly attached through the shared editor.
- No installer/release packaging, repository commit or publication was performed.

## Changed files

- `Cargo-Run-Handoff.md`
- `README.md`
- `docs/task08-validation.md`
- `electron/main/index.ts`
- `electron/main/ocr/queue.ts`
- `electron/main/trackingService.ts`
- `electron/preload/index.ts`
- `package-lock.json`
- `package.json`
- `src/App.tsx`
- `src/components/cargo/RetainedInventory.tsx`
- `src/components/cargo/ShipCargoGrid.tsx`
- `src/components/contracts/ContractEditor.tsx`
- `src/components/contracts/ContractLedger.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/navigation/BottomNavigation.tsx`
- `src/components/ui/ContractStatus.tsx`
- `src/main.tsx`
- `src/pages/Cargo/index.tsx`
- `src/pages/Contracts/index.tsx`
- `src/pages/History/index.tsx`
- `src/pages/Settings/CargoWorkflow.tsx`
- `src/pages/Settings/LocalDataManagement.tsx`
- `src/pages/Settings/OcrSettings.tsx`
- `src/pages/Settings/index.tsx`
- `src/stores/cargoPlan.ts`
- `src/stores/useCargoStore.ts`
- `src/styles/foundation.css`
- `src/types/desktop.ts`
- `src/types/models.ts`
- `src/types/ocr.ts`
- `tests/automatic-desktop.cjs`
- `tests/cargo-plan.test.ts`
- `tests/editor-review.test.ts`
- `tests/ocr-queue.test.ts`
- `tests/redesign-desktop.cjs`
- `tests/redesign-ocr-desktop.cjs`
