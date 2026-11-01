# Cargo Run v0.5.1 — Task 04.1 UI polish handoff

Implemented corrective UI work in `C:\Users\zeyros\Documents\repository\cargo-run`, continuing the clean, locally committed v0.5.0 repository. No user changes were overwritten. Reversible copies are under ignored `work/task041-backup/`. No dependency, commit, PR, installer or live-profile migration was introduced. All desktop runs use isolated profiles.

## Root causes verified

1. **Ship interaction:** the ship dialog was mounted beneath the draggable TopBar. A pre-fix Windows Electron probe reported `insideHeader: true`, dialog region `drag`, and search-input region `drag`. Native top-layer presentation does not remove DOM/CSS inheritance. Buttons/selects had no-drag exceptions but search and checkbox inherited the title-bar region.
2. **Dialog dismissal:** general closed-state CSS retained transform, display/overlay `allow-discrete` transitions and `@starting-style`, while centered `[open]` styles disabled transitions only while open. Closing re-enabled a different layout/transition path. Multiple legacy slide rules also remained. All dialog variants now use one static native-dialog lifecycle.
3. **Navigation:** width-only CSS forced wide labels and hid the hamburger. The menu always opened an independent overlay; there was no saved expanded/compact/hidden preference.
4. **Location access:** cards rendered only aggregates, with no link to a contract. Per-commodity remaining/required ratios were unlabeled.
5. **Details/layout:** details used the 470px right drawer with prose objectives. Contracts placed Add in a separate page-header row; its search label inherited an input top margin, causing control alignment differences.

## Implemented corrections

### Navigation

Persisted `navigationMode` supports expanded, compact and hidden. Expanded is the default preference; effective layout uses actual `window.innerWidth`.

| Viewport    | Effective layout                                                          |
| ----------- | ------------------------------------------------------------------------- |
| ≥1400px     | Saved expanded (212px), compact (62px), or hidden preference              |
| 1100–1399px | Compact unless explicitly hidden; a saved expanded preference is retained |
| <1100px     | Hidden; future support only, minimum window remains 1100×700              |

The hamburger always remains beside Cargo Run. It collapses expanded to compact, hides compact, and opens a temporary drawer from hidden. Compact mode has an Expand control when space permits. The drawer can pin expanded/compact navigation at supported widths; it closes after page selection, Escape or an outside click. The persistent sidebar is absent while the drawer is open. Resizing dismisses a temporary drawer and restores the appropriate preferred layout. No width animation or continuous resize transition is used. Active highlighting, keyboard activation and named icon tooltips remain.

The preference uses the existing main-process validated `cargo:preferences` endpoint and `ui.preferences` SQLite setting. Legacy preference records default to expanded without losing favorites, recent ships, selected ship or Dashboard view. Undefined patch fields no longer erase saved values. Schema remains 5.

### Shared modal behavior

Overlay portals native `<dialog>` elements to `document.body`; dialogs and their descendants are explicitly `no-drag`. The original CSS slide/keyframe/starting-style/display/overlay/transform transitions were removed, rather than masked with another open-state override.

Add/Edit, Contract Details, Finish Run and Ship Selector stay open on outside clicks. Read-only Escape closes; Add/Edit retains its dirty-change confirmation; Finish Run Escape cancels without confirming; destructive confirmations cancel safely. Native focus trapping is retained, with explicit restoration only while the closing dialog owns focus. Unmounting a previously closed dialog cannot steal focus from another active dialog. Temporary navigation alone explicitly opts into outside dismissal. No manual animation timers were added.

### Location cards

Pickup and Delivery Stops remain. A single-contract card has View Contract; multi-contract cards have a native expandable list with each unique contract name and that stop's relevant remaining SCU. Links open the shared details interface, where contract actions live. Aggregates have no ambiguous Edit/Abandon action.

Commodity rows now say **N SCU remaining**. The secondary line explicitly says delivered / required. Selectors, canonical grouping, contract/objective IDs and persisted quantities are unchanged.

### Centered Contract Details

The existing shared component is now centered, at most 900px wide and 88% of viewport height. Header/footer remain outside the scroll body.

- Overview: company, status, source, accepted time or Unknown; separately labeled full potential reward, confirmed earnings, required/delivered/remaining SCU.
- Cargo Objectives: structured six-column table retaining each distinct objective ID and unknown-field labels.
- Evidence: compact thumbnail cards, capture dates/source, linked/unlinked status, separate full-image viewer. Recognition diagnostics and identity/provenance stay collapsed under Advanced. Existing unlink, retention and image protocol are retained.
- Footer: existing edit permission (Log contracts remain read-only), explicit local-completion checkbox/no earnings claim when eligible, distinct abandon confirmation and Close. No lifecycle business rule changed.

Evidence loads are canceled logically when the selected contract changes so a late previous request does not populate another contract's details.

### Ships and Contracts

Ship filtering logic/catalog data are unchanged. Portal/no-drag isolation restores mouse search and checkbox interaction. Search still matches name/manufacturer/capacity, and an informative status explains added concept matches or that no additional records match. The bundled 105 default / 126 total entries were verified by the Windows checkbox test. Favorites, recents, selected ship and capacity updates persist as before.

Contracts search/filter/count/Add controls share an aligned, wrapping toolbar. The search icon is centered relative to the field and the inherited input top margin is removed within this toolbar. Cards are still shared with Dashboard.

## Files modified

| Area                   | Files                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Shell/navigation       | `src/App.tsx`, `components/navigation/Navigation.tsx`, `components/layout/TopBar.tsx`, new `src/utils/navigation.ts`                      |
| Shared dialogs         | `src/components/ui/Overlay.tsx`, `src/styles/global.css`                                                                                  |
| Contracts/location UI  | `ContractDetails.tsx`, `LocationStops.tsx`, `src/pages/Contracts/index.tsx`                                                               |
| Ships                  | `src/components/ships/ShipSelector.tsx`                                                                                                   |
| Preference persistence | `src/types/preferences.ts`, `src/stores/useCargoStore.ts`, one additive field in `electron/main/trackingService.ts` preference loading    |
| Version                | Package/lock root versions, native capture manifest, App/footer/navigation/Settings labels                                                |
| Tests                  | New `tests/polish.test.ts`, `tests/polish-desktop.cjs`; existing desktop navigation helpers and one additive preference assertion updated |
| Docs                   | README and this handoff                                                                                                                   |

No production OCR parsing, log interpretation, mission/objective identity, reconciliation, capture backend, shortcut, queue, retention or contract persistence algorithm was changed. The ship dataset/license is unchanged: `wiki-ships-2026-11-01`, 126 positive-SCU records, 105 flight ready, 21 optional other states; capacity remains a dated Wiki Cargo-SCU planning reference. See README and `src/data/ships.LICENSE.md` for source/license details.

## Verification executed

| Check                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                       | Pass                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm run lint`                            | Pass                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm test`                                | 228 tests / 17 files pass; all 225 previous tests retained, 3 navigation/preference tests added                                                                                                                                                                                                                                                                                                                                         |
| `npm run build`                           | Pass: native helper + production main/preload/renderer                                                                                                                                                                                                                                                                                                                                                                                  |
| `node tests/polish-desktop.cjs`           | Pass: actual Windows Electron at 1100×700, 1440×900 and maximized; navigation/keyboard/preference restart, single/multiple location links, quantity labels, structured details/evidence and action permissions, completion/abandonment, protected outside clicks, Escape/dirty/focus, no dialog transforms/transitions, mouse/keyboard ship search, concept toggle, favorites/recents/selection restart, capacity and toolbar alignment |
| `node tests/desktop.cjs`                  | Pass: existing Fleet regression including 20 contracts / 40 objectives, manual add/edit/abandon, save validation/double-submit, runs, History, window controls and OCR success expiry                                                                                                                                                                                                                                                   |
| `node tests/tracking-desktop.cjs`         | Pass: actual log reader/replay/checkpoints/pending identities, restart/rotation/recovery, completion and persisted ledger/runs                                                                                                                                                                                                                                                                                                          |
| `node tests/automatic-import-desktop.cjs` | Pass: automatic OCR import/correction, linked evidence, multi-objective log promotion, additive migration and restart                                                                                                                                                                                                                                                                                                                   |

Additional executed checks:

| Check                               | Result                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node tests/ocr-review-desktop.cjs` | Pass: raw evidence/attempts preserved; reprocess/import; recorder Save/Escape; optional Raw Input reported Listening                                                                                                                                                         |
| `node tests/window-desktop.cjs`     | Pass: actual separate-process capture 3840×2084, overlap excluded, no fallback/upscaling                                                                                                                                                                                     |
| `node tests/automatic-desktop.cjs`  | Pass: synthetic committed acceptance → delayed native display capture → offline OCR; duplicate screens, cancellation, retention, settings restart                                                                                                                            |
| `node tests/ocr-desktop.cjs`        | Attempted; did not complete because an unrelated application held foreground focus. The fixture rejected synthetic keys before sending them. Bounded diagnostics confirmed Cargo Run was not the foreground owner. No attempt was made to steal focus from that application. |

Native display/window suites were run sequentially. The legacy display/shortcut harness now includes existing foreground-probe context when its guard fails, making this test-environment limitation diagnosable. Its successful v0.5.0 run does not substitute for a completed v0.5.1 run.

The new desktop suite uses genuine repository OCR coordinates and clearly labeled generated preview pixels in an isolated profile. It also seeds a legacy verified Log record to check read-only/manual-completion permissions. No historical user capture image is required. Contract/objective snapshots are compared before/after read-only and canceled interactions to verify no quantity/identity mutation. Source-image transport and real capture are covered separately.

Visually inspected `work/polish-details-1100.png`, `work/polish-details-1440.png` and Contracts at minimum size. The minimum-size details footer remains visible while the body scrolls; full screenshots open in their own viewer. Images reflect Windows display scaling, not a different CSS viewport.

## Limits and next verification

- No live Star Citizen session, physical in-game shortcut callback, Vulkan or exclusive-fullscreen compatibility was tested in Task 04.1. Registration/Raw Input Listening is setup status, not evidence of game delivery.
- The <1100px navigation rule has unit coverage, but the real window intentionally cannot resize below 1100×700. Do not lower that minimum without a separate task.
- Native display tests use a synthetic foreground surface and synthetic SendKeys. They require an unobscured fixture and should not run concurrently with other UI automation.
- No cargo loading/collection progress model was added; remaining means outstanding required delivery, not physically loaded or confirmed uncollected cargo.
- No cloud services, new dependencies, schema/table migration or catalog refresh was introduced by this corrective task.

Recommended next step: validate these interactions with the user's normal live-game workflow and supported display scaling/window modes. Then scope a separate audited manual collection/onboard progress model; do not repurpose existing delivered quantities.

## Exact launch commands

Development:

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

UI regression: `npm run test:polish:desktop`. Dependencies are unchanged; use `npm ci` only if installation is needed. If a shell inherited Electron Node mode, first run `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`. No installer was produced.
