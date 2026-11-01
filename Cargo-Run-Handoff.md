# Cargo Run v0.5.0 — Fleet Operations 2.0 handoff

Implemented Task 04 in `C:\Users\zeyros\Documents\repository\cargo-run`, continuing the clean local v0.4.1 repository. No public branch replacement, new dependency, commit, PR or installer. Reversible pre-edit copies are under ignored `work/task04-backup/`. All runtime tests use isolated profiles under `work/`; the user's live database and captures were not migrated or edited.

## Architecture and UI decisions

The existing Electron/React/TypeScript/Zustand/Tailwind/SQLite design remains. This is a presentation redesign with additive catalog/preferences support, not a reconciliation rewrite.

- One CSS system supplies the exact requested graphite/purple semantic tokens. Purple marks interactive selections, light purple provides readable links/focus, green success, warning gold warnings, muted red errors/destructive actions.
- Sidebar is 212px with labels at viewport ≥1400, 62px with named icon/tooltips at 1100–1399. The menu opens an independent temporary overlay without continuously resizing content. Existing 1100 × 700 minimum remains; smaller-width CSS is prepared.
- Native custom title-bar controls and no-drag buttons remain. The ship button shows name/capacity and opens the shared picker. OCR success is transient for five seconds; idle/loading/unavailable/processing/queue statuses are distinct.
- Dashboard is Cargo Operations, with four statistics and a persisted By Location / By Contract mode. Pickup and delivery groups are alphabetical with quantities, commodities, related locations and unique associated-contract counts.
- Full known payouts count once per unique active ContractId, never per destination. The allocated-payout selector, old route strip and old destination table component were removed.
- Selectors deduplicate only repeated persistent IDs. Matching-looking rows with different IDs remain separate. No mission/objective identity algorithm changed. Superseded records are excluded. A deliberately bounded display alias covers the supplied NB Int. Spaceport example; raw evidence is unchanged and no broad fuzzy merge exists.
- Manifest is an objective checklist projection, not a second Dashboard: collection/delivery rows retain contract/objective identity and existing delivered quantities. It does not claim pickup completion, loaded cargo or route distances.
- Contracts is the active-record page with search and compact active filters. History retains its complete ledger, closed runs, status/search filters and confirmed-earnings totals.
- Shared details expose Overview, Cargo Objectives and Evidence; technical IDs/raw OCR/provenance are Advanced. Edit, completion, abandonment, preview and unlink are preserved. Editing a detail refreshes from the current record.
- The existing ContractDrawer implementation now uses a centered 680px native dialog. Dirty dismissal opens a discard warning; pristine Escape/outside dismiss safely. Native focus trapping and explicit restoration are verified. The scroll body and fixed footer work at minimum height. A synchronous ref prevents double submission while the main-process save runs.
- Settings order: OCR, optional Game.log, Ships, Storage/Data, collapsed Advanced, App Information. No duplicate OCR configuration controls were added.

## Quantities, progress and capacity

Outstanding = sum(max(0, required − delivered)) over unique active objective IDs. Required totals remain visible separately. Potential rewards exclude unknowns and do not become earned income. Capacity utilization/unallocated SCU assume all outstanding cargo is carried together; excess warns that staged deliveries/additional trips may be needed. Actual onboard cargo is unknown.

Manifest uses Planned by default, Manual when the delivered field has manual provenance, supported log progress when the objective has a recorded log timestamp and delivered quantity, and otherwise Reported progress. Collection quantities remain requirements, not verified uncollected amounts. No nonfunctional checkbox, inventory reader, new progress model, route ordering or distance was added.

## Ship source, coverage and license

Chosen source: [Star Citizen Wiki Category:Ships](https://starcitizen.tools/Category:Ships), rendered Cargo (SCU) table, category revision 396448. Its resolved table values are used; raw templates alone omit inherited capacities.

Snapshot: `wiki-ships-2026-11-01`. Of 250 rendered rows, 126 have positive finite supported Cargo SCU and valid names/manufacturers. 105 are flight ready after recognizing case/hyphen spelling variants; 21 other production states require an explicit picker option. 124 zero/unknown/unsupported rows are excluded. All roles qualify. Canonical source-page duplicates are removed; distinct source-named variants remain even when capacities coincide. Coverage is of this table, not every possible game entity.

Each record includes capacity SCU, manufacturer, raw availability, source URL, snapshot version and available article revision/update timestamp. Some alternate variant pages have no revision in the category metadata export; their canonical page URL and snapshot date remain. There is no invented capacity, uniform game-patch guarantee, packing simulation or runtime scraping.

Wiki content reuse is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) per its [copyright policy](https://starcitizen.tools/Star_Citizen_Wiki:Copyrights). `src/data/ships.LICENSE.md` attributes contributors and adaptations. Only the adapted data has that license; no Wiki images/prose or third-party API dataset were bundled. Application licensing/dependencies are unchanged.

`scripts/update-ships.cjs` is an explicit developer updater. It validates table headers rather than assuming column offsets, paginates article metadata and validates IDs/capacities. The current export was reproduced offline using `--from work/ship-research --date 2026-11-01`; a source-export SHA-256 is recorded. Future updates need source/coverage review and revised baseline assertions.

## Persistence and migration

Schema remains 5. Existing `ships` JSON payloads accept additive metadata. Main merges catalog entries with saved entries, preserving unknown/custom/retired IDs, selected ID and the original `c2`, `caterpillar`, `hull-c` identifiers. A ship-only transactional upsert refreshes catalog records at startup; no contract/objective/evidence/audit/run/checkpoint is rewritten by this refresh.

The additive `ui.preferences` SQLite setting stores Dashboard view, unique favorite IDs and eight recent ship IDs. A fixed `cargo:preferences` IPC handler accepts only validated view/favorite patches for known ships. Main manages recents when selection commits. Trusted sender validation, context isolation, sandbox and disabled renderer Node integration remain.

Contract saving/completion, sample removal, run finalization and OCR import retain existing transactional workflows. There is no separate frontend database or localStorage persistence.

## Changed files

| Area                       | Files                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell/navigation/title bar | `src/App.tsx`, `components/navigation/Navigation.tsx`, `components/layout/TopBar.tsx`                                                                                                  |
| Views                      | `pages/Dashboard/index.tsx`, `pages/Manifest/index.tsx`, new `pages/Contracts/index.tsx`, `pages/Settings/index.tsx`, History/ScanReview semantic badge corrections                    |
| Reusable contract UI       | new `ContractCards.tsx`, `LocationStops.tsx`; updated `ContractDrawer.tsx`, `ContractDetails.tsx`, `ui/Overlay.tsx`; removed obsolete `DestinationGroups.tsx`                          |
| Ships                      | new `components/ships/ShipSelector.tsx`, `data/ship-catalog.json`, `data/ships.LICENSE.md`, `scripts/update-ships.cjs`; updated `data/ships.ts`                                        |
| State/types                | `stores/selectors.ts`, `stores/useCargoStore.ts`, `types/models.ts`, `types/tracking.ts`, new `types/preferences.ts`, `types/desktop.ts`                                               |
| Main/preload               | `electron/main/trackingService.ts`, `storage/database.ts`, `electron/main/index.ts`, `electron/preload/index.ts`                                                                       |
| Styling/version            | `src/styles/global.css`, package and lock root versions, native capture manifest                                                                                                       |
| Tests                      | new `tests/fleet.test.ts`; updated selector assertions and desktop harnesses for current headings/navigation/picker; OCR preview fixtures no longer depend on deleted user screenshots |
| Documentation              | README and this handoff                                                                                                                                                                |

Production OCR parser, importer, reconciliation, capture/input backends, retention and automatic scanning algorithms were not modified. Their versioned evidence semantics remain v0.4.1 where appropriate; application version is v0.5.0.

## Verification executed

| Check                                     | Result                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                       | Pass                                                                                                                                                                                                                                                                                                          |
| `npm run lint`                            | Pass                                                                                                                                                                                                                                                                                                          |
| `npm test`                                | 225 tests / 16 files pass; all 213 prior tests retained, obsolete allocation expectation replaced                                                                                                                                                                                                             |
| `npm run build`                           | Pass: native helper and production main/preload/renderer                                                                                                                                                                                                                                                      |
| `node tests/desktop.cjs`                  | Pass: real Windows Electron; 1100×700/1440×900, sidebar resize/active navigation/overlays; modal dirty warning/focus/validation/multiple rows/double-submit; ship search/favorites/selection/view restart; planning capacity; 20 contracts/40 objectives; edit/abandon/run/history; minimize/maximize/restore |
| `node tests/tracking-desktop.cjs`         | Pass: pending-only acceptance, monitor/checkpoints/replay/import, partial restart, completion, diagnostics, rotation/error recovery, manual ledger/ship/runs                                                                                                                                                  |
| `node tests/automatic-import-desktop.cjs` | Pass: v4→v5 additive migration; automatic OCR-only 34,500/8 import with monitoring off; compact duplicate/missing-pickup correction; unique multi-objective pending-log promotion; evidence; restart/later completion without invented earnings                                                               |
| `node tests/ocr-review-desktop.cjs`       | Pass: real repository OCR, raw evidence and attempts unchanged, generated preview, recorder Save/Escape/no capture, automatic import; Raw Input reported Listening                                                                                                                                            |
| `node tests/window-desktop.cjs`           | Pass: actual separate-process native window capture 3840×2084; overlap excluded, dimensions retained, no fallback/upscaling                                                                                                                                                                                   |
| `node tests/automatic-desktop.cjs`        | Pass in isolation: live synthetic acceptance → delayed native display capture → offline OCR; duplicate-frame skip, unrelated-title non-association, stop cancellation, retention and settings restart                                                                                                         |

The native display suite `node tests/ocr-desktop.cjs` also passes: three actual Electron shortcut callbacks via synthetic SendKeys while a separate WinForms surface is focused and Cargo Run is minimized; native screenshots, four OCR objectives, black-frame rejection, full-image protocol, reprocess, restart, disable and clear. The stale thumbnail-size assumption was corrected to check the small thumbnail and separately decode the full screenshot. Obsolete Capture source labels were updated to the existing Capture Method label. Initial overlapping/full-display attempts could receive an invalid frame; isolated sequential reruns passed. No production capture algorithm was changed.

The Fleet harness also injects a test-only OCR status event through the existing event channel to verify the five-second success expiry; this is notification testing, not a claim that a capture succeeded. Core workflows use actual IPC/main/SQLite/React. Tracking's native file picker response is stubbed; log file reading and processing are real.

Generated UI screenshots are under ignored `work/fleet-*.png`. Visually inspected Dashboard at both sizes, Manifest and centered modal at minimum size. Images reflect the system's 150% display scale (1100 CSS px produces 1650 physical px). Current tests use repository OCR exports and clearly labeled generated preview pixels, not historical user screenshots. Missing originals never block the suite or cause one contract's screenshot to substitute for another.

## Remaining user-machine verification and limits

No Star Citizen gameplay was run. Raw Input Listening or Electron shortcut registration confirms setup only, not actual physical callback delivery while the game has focus. Verify the explicitly selected backend's invocation count, a new CaptureId, screenshot/backend dimensions and recognition/import outcome in-game. Keep one production trigger backend; compare diagnostics do not compete as capture triggers.

At both requested sizes, use accepted multi-objective contracts, switch views, change ship and restart. Confirm full rewards once, required/delivered/remaining values and no duplicated objective IDs after repeated OCR/log enrichment. Inspect an actual linked screenshot and retention behavior after completion. Then test physical shortcut delivery in the chosen graphics/window mode; automatic acceptance screenshots remain optional/off by default. Vulkan/exclusive fullscreen, real StarCitizen.exe identity and physical keys need live validation. Existing capture limitations are preserved.

No trade planning, live inventory reading, route optimization, distance estimates, automatic ship switching, multi-ship allocation, OCR/input engine changes, cloud or authentication were added. The catalog is a dated community reference; availability/capacity can change. There is no actual pickup/onboard progress model, so checklist interaction is intentionally deferred.

## Launch commands and next task

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm run dev
```

Production:

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm run build
npm start
```

Use `npm ci` only if dependencies need installation. In a shell that inherited Electron's Node-mode environment variable, first run `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`. No installer was produced.

Recommended next task: complete the live in-game matrix, then separately design audited manual collection/onboard progress and reversal before enabling interactive cargo checkboxes. Keep that new state distinct from delivered quantities and OCR recognition.
