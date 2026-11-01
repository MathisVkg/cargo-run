# Cargo Run v0.5.2 — Task 04.2 handoff

Small corrective patch in `C:\Users\zeyros\Documents\repository\cargo-run`, continuing the clean, locally committed v0.5.1 tree. Reversible copies are under ignored `work/task042-backup/`. No live user database/captures were read or modified. No dependencies, migration, commit, PR or installer were added.

## Navigation correction

The controls and the bottom information block both had auto top margins, pushing the controls down. The primary collapse/hide action now directly follows the six navigation items with the same 5px gap. All sidebar rows use 40px height and 19px icons. Expanded controls align with item labels; compact controls center their icons. The existing wide-compact Expand action follows Hide; no toggle was added. Application information remains at the bottom.

Hamburger behavior, expanded/compact/hidden logic, responsive widths and preference persistence are unchanged. There is no width animation.

## Shared Contract Card footer correction

Root cause: the old Details `.text-button` had 17px bottom padding, icon actions used 25×27px boxes, and inline source text contained a nested inline-flex Evidence span. The outer flex row aligned these unequal boxes, not their actual text/icon centerlines. Long titles also left shorter cards' footers above their grid partners.

The shared component now uses explicit metadata and action groups. Source is a compact badge; Evidence text/icon are centered together. Actions use consistent 32px height/minimum width, 8px padding/gaps and 16px icons. Details is readable, Edit retains accessible labels/tooltips, and Abandon has a tooltip and destructive color. No per-action top margins, transforms or absolute nudges were added.

Metadata/actions wrap into clean rows when needed; the action row stays right-aligned. Flex-column cards keep footers bottom-aligned across long/short titles. The same component serves Dashboard → By Contract and Contracts. Action handlers, permissions, data and calculations are unchanged.

## Limited OCR title findings

The offline Tesseract provider exports recognized text, boxes and confidence with line-edge trimming. The parser uses title regions/explicit metadata, joins wrapped lines and excludes navigation/objective labels. Its normalization is conservative whitespace/case handling, not semantic replacement of corrupted words.

Exact current extraction passes from genuine repository OCR exports:

| Fixture                                     | Extracted title                       |
| ------------------------------------------- | ------------------------------------- |
| `de84af0a-5ad9-4458-a490-288293bdf989.json` | Rookie Rank - Extra Small Cargo Haul  |
| `88825398-27e5-4561-9516-c717ae7e750b.json` | Rookie Rank - Direct Small Cargo Haul |
| `9ccc7ea4-c6f6-49bc-8bfc-701980e610da.json` | Junior Rank - Small Cargo Haul        |

Tests verify complete endings, no reported unwanted glyphs and unchanged original input/evidence. No current title-parser defect was reproduced, so production OCR code remains unchanged.

Chosen OCR titles are stored as contract `name` in SQLite JSON. Startup loads that value and saved run snapshots; it does not recalculate names when the parser changes. Reprocess is an explicit action and follows existing import/conflict/manual-correction rules. A seeded isolated database confirms an old malformed title, run snapshot and older-version observation/raw payload remain unchanged after restart, even while a separate current parse returns the correct title.

The user's malformed title **could therefore persist from older recognition data**. Its actual origin/version was not inspected or proven. Fresh OCR can still misread glyphs; fixture parsing is not a guarantee of perfect new image recognition. Check the recognized and raw title on a newly accepted contract during live testing.

No parser fix, fuzzy mapping, sanitizer, automatic rename, historical reprocess or evidence overwrite was introduced. Parser evidence version stays 0.4.1; application version is 0.5.2.

## Files modified

| Files                                                                    | Purpose                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/components/navigation/Navigation.tsx`                               | Control order/layout, matching icons and version label                   |
| `src/components/contracts/ContractCards.tsx`                             | Shared footer groups, consistent action classes/icons and tooltip        |
| `src/styles/global.css`                                                  | Navigation placement, footer geometry/wrapping and card bottom alignment |
| `src/App.tsx`, `src/pages/Settings/index.tsx`                            | Visible version labels                                                   |
| `package.json`, `package-lock.json`, `resources/native/capture.manifest` | Version metadata and alignment-test command; dependencies unchanged      |
| New `tests/alignment-desktop.cjs`                                        | Windows geometry/screenshots/actions/persistence verification            |
| New `tests/title-inspection.test.ts`                                     | Three exact title fixtures and historical-data preservation              |
| README, this handoff                                                     | Current results and limitations                                          |

No production backend, schema, parser/importer, Game.log, identity, payout/cargo selector, capture/input, retention or ship-catalog code changed. The existing v0.5.1 dialogs, navigation state model and workflows remain.

## Verification executed

| Command                                   | Result                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                       | Pass                                                                                                                                                                                                                                                                                             |
| `npm run lint`                            | Pass                                                                                                                                                                                                                                                                                             |
| `npm test`                                | 232 tests / 18 files pass: all previous 228 retained, four inspection/preservation cases added                                                                                                                                                                                                   |
| `npm run build`                           | Pass: native helper and production main/preload/renderer                                                                                                                                                                                                                                         |
| `node tests/alignment-desktop.cjs`        | Pass: 1440×900 expanded/compact and 1100×700 compact; both card contexts; actual text/SVG centers, matched dimensions, source/evidence variants, long titles, wrapping, hover/focus, Details/Edit/Abandon cancellation, Log permissions, preference restart and byte-identical contract payloads |
| `node tests/polish-desktop.cjs`           | Pass: previous protected dialogs, navigation, ships, details/evidence, completion/abandonment; both sizes and maximized                                                                                                                                                                          |
| `node tests/desktop.cjs`                  | Pass: Fleet/manual workflows, 20 contracts/40 objectives, calculations, Manifest/History/runs, security/window controls                                                                                                                                                                          |
| `node tests/tracking-desktop.cjs`         | Pass: pending identities, log replay/checkpoints/restart/rotation/recovery/completion                                                                                                                                                                                                            |
| `node tests/automatic-import-desktop.cjs` | Pass: OCR import/correction, multi-objective promotion, evidence, migration/restart                                                                                                                                                                                                              |
| `node tests/ocr-review-desktop.cjs`       | Pass: reprocess, original evidence/attempts, recorder and import; Raw Input reported Listening                                                                                                                                                                                                   |

The alignment test measures actual text ranges and SVG rectangles. OCR/source, Evidence text/icon, Details and Edit/Abandon centers are within 1 CSS pixel. All action boxes are 32px high with 16px icons. It checks matched 40px sidebar rows/19px icons and bottom application information. DOM structure alone is not the visual assertion.

Native minimum size remains 1100×700. A separate 300px card-width constraint exercises wrapping inside that supported window; cards wrap only when needed. Synthetic source variants are isolated test records, not user contracts.

Screenshots visually inspected: `work/alignment-1440-expanded-contracts.png`, `work/alignment-1100-contracts.png`, `work/alignment-footer-wrap.png`, `work/alignment-footer-focus.png`. Additional Dashboard/compact/hover screenshots and detailed geometry are in ignored `work/alignment-*.png` and `work/alignment-metrics-v052.json`. Images reflect Windows display scaling.

## Limits and next verification

No live Star Citizen session or fresh screenshot OCR was run. The historical title's original OCR/version is unknown. Physical in-game shortcuts, Vulkan/exclusive fullscreen and native full-display capture were not revalidated for this component/CSS-only patch. The v0.5.1 full-display shortcut harness's foreground limitation remains historical, not a new v0.5.2 pass. No focus takeover was attempted.

No cargo-loading state, cloud service or new OCR phase was added. Next: inspect the footer in normal gameplay and capture one newly accepted contract before explicitly correcting any historical title.

## Launch

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm run build
npm start
```

Development: `npm run dev`. Alignment regression: `npm run test:alignment:desktop`. If a shell inherited Electron Node mode, first run `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`.
