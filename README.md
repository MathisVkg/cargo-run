# Cargo Run 0.5.2 — Fleet Operations 2.0

Cargo Run is a local Windows companion for Star Citizen hauling. The graphite and royal-purple workspace organizes accepted contracts, planned cargo, pickups and deliveries. OCR remains the primary contract source; Game.log is optional secondary evidence. SQLite, offline recognition, capture backends, identity matching and screenshot retention remain in place.

## Fleet Operations workspace

- **Dashboard — Cargo Operations:** four statistics, separate Pickup Stops and Delivery Stops, and a remembered By Location / By Contract view. Each known full payout counts exactly once, never by destination. Unknown rewards are excluded. Planned cargo is outstanding required SCU, not physically loaded cargo.
- **Manifest:** required/outstanding SCU and commodity/location counts, with separate collection and delivery tables. Rows keep their persistent objective IDs even when visible cargo matches. Collection requirements do not prove cargo is still awaiting pickup. There are no fictitious collection checkboxes.
- **Contracts:** active records, title/commodity/pickup/destination search, compact active filters, full rewards and source/evidence access. Completed and abandoned records remain in History.
- **Details:** centered, responsive modal up to 900px wide and 88% of viewport height. Overview statistics separate potential reward, confirmed earnings and required/delivered/remaining SCU. Objectives use a structured table; evidence uses thumbnails and a separate full viewer. IDs/raw OCR/provenance remain under Advanced, and permitted edit/completion/abandon/unlink actions remain accessible.
- **Add/Edit Contract:** centered 680px native-dialog modal, scrollable body, visible Save/Cancel footer, multiple objectives, total SCU, validation, duplicate-submit protection and an unsaved-changes warning.
- **History / Scan History / Settings:** existing workflows share the new semantic palette. Settings order is OCR & Capture, optional Game.log, Ships, Storage & Data, collapsed Advanced & Diagnostics, Application Information.

The sidebar follows actual viewport width and a saved expanded / compact / hidden preference. Wide windows (1400px+) default to 212px expanded; 1100–1399px constrain it to 62px compact while retaining the wide preference. Below 1100px the effective mode is hidden, but the Windows minimum intentionally remains 1100 × 700. The hamburger beside Cargo Run collapses expanded, hides compact, and opens a temporary drawer from hidden. Compact mode can expand when width permits; the drawer can pin expanded/compact navigation. Selecting a page or pressing Escape closes the temporary drawer; outside clicks close only navigation. Persistent and temporary navigation never overlap, and width transitions do not animate. The title bar retains native controls and transient OCR success.

Centered Add/Edit, Details, Finish Run and Ship Selector dialogs **do not close on outside clicks**. Escape closes read-only dialogs, protects unsaved edits with a discard warning, and cancels confirmations without executing them. Shared native dialogs are portaled outside the draggable title bar, with no slide/scale/discrete exit transition and with focus trapping/restoration. Ship search and the concept checkbox now accept mouse and keyboard interaction; a status line explains extra concept matches or no additional matches.

Location cards link directly to one contract or expand a list of associated contracts, each with the relevant remaining SCU. Commodity quantities explicitly say “SCU remaining”; a secondary line labels delivered / required. Contract actions stay in the linked details. Contracts search, filter, count and Add share an aligned, wrapping toolbar.

Sidebar collapse/hide controls sit directly below the main items, using the same row height and icon alignment; application information remains at the bottom. Shared Contract Cards in Dashboard → By Contract and Contracts center source/evidence and Details/Edit/Abandon on the same axis. Actions stay 32px high, long-title cards keep bottom-aligned footers, and metadata/actions wrap into clean rows when space requires.

The shared tokens in `src/styles/global.css` are background #181A1D, secondary #23272B, panel #333B42, accent #613DC1, hover #7956D8, light accent #A994F0, text #F2F1E9, secondary text #A2B1BD, success #8BB79B, error #D57B84, warning #D8AD6F and border #424A52. Inter uses the installed system font when available, with Segoe UI fallback; numerical statistics use a restrained monospace stack. There are no downloaded fonts, gradients or added UI libraries.

### Planning assumptions

Capacity utilization assumes all outstanding cargo travels together; unallocated capacity is max(0, selected capacity − outstanding SCU). An excess warns about staged deliveries or additional trips; it does not claim simultaneous carriage is required. Required, delivered and remaining quantities stay separate. Manifest distinguishes Planned, Reported manually, Supported Game.log progress and otherwise Reported progress only when backed by the existing model.

Grouping is a pure presentation projection. Exact case/whitespace equivalence and a bounded NB Int. Spaceport / NB Int. Spaceport on microTech alias are supported. Original strings are preserved. No broad fuzzy geographic merge or mission/objective matching change was introduced. Distinct persistent contract/objective IDs remain distinct; superseded records are excluded.

## Offline ship catalog

The bundled snapshot is **wiki-ships-2026-11-01**, from the maintained [Star Citizen Wiki Ships table](https://starcitizen.tools/Category:Ships), category revision 396448. It includes all **126** eligible positive-SCU rows in that source: **105 flight ready** by default and **21** other production states behind an explicit option. All ship roles are eligible. Of 250 rendered table rows, 124 zero, unknown or unsupported-capacity rows are excluded. Canonical source-page duplicates are removed; distinct source-named variants are retained.

Capacity means the Wiki **Cargo (SCU)** column, not personal storage in micro-SCU, an exact packing simulation or a verified onboard inventory reading. Wiki articles have different update dates; the snapshot makes no uniform game-patch guarantee. Source article links, available revisions/timestamps, production state, snapshot date and units are bundled. No price, image or article prose is bundled, and startup never scrapes a website.

Data reuse follows the Wiki [copyright policy](https://starcitizen.tools/Star_Citizen_Wiki:Copyrights) and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Attribution and adaptation details are in [ships.LICENSE.md](src/data/ships.LICENSE.md). The adapted catalog is CC BY-SA 4.0; application code retains its existing license.

The searchable picker supports manufacturer/capacity text search, a manufacturer filter, favorites first and then the eight most recently selected ships. Favorites, recent selection, selected ship and Dashboard view persist locally. Ship selection immediately updates capacity statistics. Existing `c2`, `caterpillar` and `hull-c` IDs remain; custom/retired saved IDs are retained.

Catalog maintenance is explicit development work:

```powershell
node scripts/update-ships.cjs --date 2026-11-01
```

The updater validates source column definitions, paginates article metadata, checks positive capacities/canonical duplicates and records an export hash. Review the resulting data/license/count changes before committing; it is never part of normal startup. The current snapshot was also reproduced from the downloaded source exports with `--from work/ship-research --date 2026-11-01`.

### Local migration

SQLite schema remains **5**. Startup transactionally upserts the merged catalog into the ships table; it does not rewrite contracts, objectives, evidence, audits, checkpoints or run history. Existing selected IDs are preserved. The additive `ui.preferences` setting stores navigation mode, view, favorites and recent IDs. Existing records default to expanded navigation without resetting other settings. A fixed, validated, trusted-sender IPC endpoint accepts only navigation mode, Dashboard view and known unique favorite IDs; the main process manages recents. Database access stays in main, context isolation/sandbox remain enabled and renderer Node integration remains disabled.

## Run and verify

Requires Windows and Node.js 24+. The existing native capture helper uses the installed .NET Framework compiler.

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm ci
npm run dev
```

For production use `npm run build`, then `npm start`.

| Command                          | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `npm run test:alignment:desktop` | Windows footer/navigation geometry and screenshots        |
| `npm run test:polish:desktop`    | Windows UI interaction regression for v0.5.1              |
| `npm run typecheck`              | Strict TypeScript validation                              |
| `npm run lint`                   | ESLint                                                    |
| `npm test`                       | 232 automated tests in 18 files                           |
| `npm run build`                  | Native capture helper and production Electron/React build |
| `npm run test:desktop`           | Windows application and secondary Game.log workflows      |
| `npm run test:ocr:contracts`     | Windows automatic import and compact correction workflow  |
| `npm run test:ocr:review`        | Saved OCR and shortcut recorder regression                |
| `npm run test:window:desktop`    | Separate-process window capture                           |
| `npm run test:ocr:desktop`       | Native display/shortcut/offline OCR fixture               |
| `npm run test:automatic:desktop` | Acceptance-triggered capture fixture                      |

No runtime dependency, cloud service, continuous scanning, game navigation or new input backend was added.

## Normal gameplay workflow

1. In **Settings → OCR & Capture**, choose the existing Capture Method and monitor where applicable.
2. Show an accepted hauling contract and use the saved capture shortcut or **Capture now**.
3. A structurally valid, sufficiently complete and unambiguous scan imports automatically. Dashboard, Manifest, capacity, destinations and potential earnings update immediately.
4. Open **Scan History & Issues** only to inspect a screenshot, edit details, or resolve a genuine issue.

**Automatic screenshot capture** and **automatic importing** are different. Acceptance-triggered screenshots remain optional and off by default. Safe importing runs after recognition or **Reprocess saved OCR**, regardless of whether monitoring is enabled. Existing valid v0.4.0 captures can be reprocessed; migration does not bulk-import them at startup.

Successful entries show title, recognized SCU/reward, capture time, preview, Imported/Updated status and **Dashboard and Manifest updated**. Full editing, ObjectiveId mappings, UUIDs and raw evidence are behind **Edit details / Advanced**. OCR processing, failed capture and import outcomes remain distinct.

## When a scan needs attention

| Issue                                                           | Normal action                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Missing pickup or another required field                        | Correct only that field and save                                                          |
| Ambiguous acceptance                                            | Confirm that the contract was actually accepted                                           |
| Offers screen                                                   | Accept it in-game and recapture, or explicitly confirm acceptance for an older screenshot |
| More than one plausible active instance                         | Choose the relevant active contract or create a separate contract                         |
| Unproven objective-list coverage                                | Confirm the full list, or recapture a complete panel                                      |
| Conflict with a saved value                                     | Keep the stored value or explicitly authorize the recognized value                        |
| Unusable/missing image                                          | Retry OCR only when an image exists; otherwise retry capture                              |
| Closed history or complex consolidation with manual corrections | Use explicit Advanced recovery                                                            |

Correction fields remain visible while typing. Successful resolution closes the issue form so old errors do not remain beside a success message. Correctly recognized rows are not reconstructed. Unmatched existing rows are preserved and never become mandatory editor fields just because they were absent from the screenshot.

## What can import automatically

Eligibility uses validity, bounding-box/layout evidence, acceptance actions, objective coverage and duplicate/identity checks. **There is no OCR confidence-percentage threshold.**

- Title and visible objective fields must be valid; missing optional reward/company remain unknown.
- Accepted state must be supported by positioned action/tab evidence. ACCEPT OFFER identifies Offers; TRACK, UNTRACK and ABANDON support Accepted. Contradictory indicators stay ambiguous.
- Coverage is established by independent description quantities, or by a positioned objectives heading with complete delivery/collection pairs ending clearly before the action bar. Explicit scrolling, clipping, truncation and ambiguous rows prevent declaring that layout complete.
- An existing verified ledger target's known objectives can support a partial update. Unseen rows remain unchanged and the observation stays marked incomplete. A pending log row alone does not establish a complete list for creating a new ledger contract.
- A unique active log identity requires agreeing title and unambiguous objective evidence; capture timing/context are supporting evidence, not identity on their own.
- A trigger MissionId is never verified merely because it scheduled capture.
- Material disagreements wait for a choice. Manual corrections and delivered progress cannot be silently overwritten by a later scan.

OCR coverage remains a conservative inference from the available text/layout. An undetected scrollbar or recognition error can still hide information; inspect unusual contracts and use Advanced when necessary.

## Identity and duplicate prevention

ContractId is the local ledger identity; MissionId is the verified log identity; CaptureId identifies one observation; ObjectiveId identifies a known log objective.

The same CaptureId cannot create another contract. Additional screenshots of a uniquely verified contract enrich the same record. Different MissionIds remain distinct. Identical OCR-only instances are never silently merged: a later matching screenshot presents a compact existing/separate choice.

Closed/abandoned historical records are excluded from routine candidate choices. A recent already-closed matching mission can block a potentially stale import without offering a historical list; choose a genuinely separate accepted instance or use Advanced recovery.

New log evidence can make an earlier OCR-only association ambiguous. The original capture then offers a compact identity choice. Confirming its matching log record consolidates current cargo/evidence without duplication; the source OCR record and historical snapshots remain. Saved manual corrections require explicit Advanced consolidation. Previously resolved choices are not reopened by unrelated events.

All contract/objective/evidence/audit/outcome changes commit in one main-process SQLite transaction. Failed writes roll back both persisted state and the in-memory ledger. Stale issue resolutions are rejected when OCR or the selected target changed. Recognition and its evidence remain available for retry.

## Game.log is a secondary mission-event source

Select Game.log in Settings and start monitoring if desired. New acceptance records **MissionId, title, known timestamp and objectives in pending mission storage** and can trigger the existing optional delayed capture. It no longer creates an incomplete active Dashboard contract.

A sufficiently supported OCR match promotes/enriches that identity in the cargo ledger. Completion events before association remain in pending evidence; events after verified association update the correct ledger contract. The app does not complete an unrelated OCR-only contract by guessing its identity. Historical/closed association is an explicit recovery operation.

Existing v0.4.0 log contracts, including incomplete ones, are preserved in place and still receive their supported lifecycle events. They can be enriched by OCR rather than duplicated.

Supported notifications remain Contract Accepted, New Objective: Deliver, and Contract Complete in the established notification/MissionId format. First monitoring start skips existing bytes; checkpoints resume after restart/pause. **Import existing history** is explicit and replay-safe. Rotation, partial UTF-8 lines, errors/recovery and bounded diagnostics remain. ONLINE indicates a readable monitored file, not a running game.

A missing acceptance timestamp stays null; capture time and event receipt time are separate. Potential reward never becomes confirmed earnings automatically. OCR-only records still support manual editing/completion/abandonment, run finalization and History.

## Persistence, migration and evidence

Schema **5** adds `pending_log_missions`, keyed by MissionId, and reconstructs its secondary projection from saved immutable events. It does **not** delete, move or convert existing ledger contracts, captures, links, runs, checkpoints or corrections. Import outcome metadata and coverage are additive JSON fields.

Existing `capture_contract_links` and `ocr_review_audit` retain original observations, corrections, conflicts, before/after data and authorization type: Automatic, Issue resolved or Reviewed. Automatic associations are distinguished from user-confirmed associations.

Use **Details / evidence** from Dashboard, Manifest or History for screenshots, larger previews, date/source, warnings and field provenance. Unlinking does not delete the contract. Default retention remains 7 days unlinked, protected while attached to an active contract, and 30 days after closure. Missing/expired images leave contract data and structured evidence/audit. Deliberate Clear Captures removes files/capture rows while linked text evidence remains.

SQLite, WAL, foreign keys, full synchronous commits, the serial OCR queue, 12-pending/50-capture/512-MiB limits, protected UUID image protocol and local English Tesseract remain. Settings shows actual data paths. When protected evidence fills storage, explicit cleanup/unlink/clear is still needed.

Back up the database and captures folder with Cargo Run closed before upgrading. Older binaries intentionally refuse schema 5. Restore a pre-upgrade backup for rollback; do not lower PRAGMA user_version manually.

## Exact in-game test

1. Back up local data with Cargo Run closed, launch v0.5.2, and leave Game.log monitoring and automatic screenshot capture off.
2. Show the accepted **Rookie Rank - Direct Small Cargo Haul**, 34,500 aUEC, 8 SCU Agricultural Supplies, NB Int. Spaceport → Port Tressler above microTech. Capture once. Without opening review, verify one active contract, correct route/SCU/reward and an Imported entry.
3. Inspect the saved screenshot. Reprocess the same CaptureId: contract count must not increase. Capture the same OCR-only instance again: choose the existing contract from the compact issue; no row reconstruction should be required.
4. With two genuinely separate identical accepted instances, choose **Create a separate contract**. Keep different MissionIds separate.
5. Test an Offers screen: no active import. Ambiguous acceptance must ask for confirmation. Test a missing pickup: only that field should need correction. Saving should close the issue controls and show a single success state.
6. Test a scrolling/partial list against a known contract. Unseen objectives must stay, and unrelated missing pickups on those rows must not become required edits. Unsupported list coverage must remain an issue.
7. Enable Game.log monitoring before accepting a new hauling mission. Acceptance alone must not add an active Dashboard row. Capture its contract: a unique title/objective match should promote/enrich one record with its MissionId and known timestamp.
8. Repeat a verified capture; verify the same contract/objective IDs and additional evidence. Change a stored value manually, rescan a conflicting value, and ensure it waits for your authorization.
9. Let a verified mission complete. Check Completed History and zero unobserved earnings. Restart and verify contracts, runs, ship, evidence and pending event state.
10. For late log evidence, use the compact identity choice on the original OCR-only capture; complex corrected/closed cases belong in Advanced recovery.
11. Optionally enable the existing delayed acceptance-capture experiment. It should produce automatic imports only when eligible, otherwise grouped failures or compact issues. Stop monitoring to cancel pending capture requests.
12. Repeat your usual Window/Display/Automatic capture and physical shortcut tests. Reset Advanced shortcut diagnostics, focus Star Citizen and physically press/release the chord once. Registration/Listening is not callback delivery: check Invocation → CaptureSaved/error. No real-game or Vulkan/physical-input validation is claimed here.

Electron remains the default input backend. Its existing quiet-period repeat guard, recorder and optional development-only Raw Input prototype are unchanged. Raw Input delivery remains unverified; only the explicitly selected backend triggers capture. Keep working Electron/manual capture if the native prototype is unreliable.

## OCR title inspection

The current parser extracts **Rookie Rank - Extra Small Cargo Haul**, **Rookie Rank - Direct Small Cargo Haul**, and **Junior Rank - Small Cargo Haul** completely from existing genuine repository OCR fixtures. Original OCR text and evidence remain unchanged. No current parser defect was reproduced, so the parser is unchanged.

Stored contract names and historical run snapshots are loaded from SQLite; parser updates do not automatically recalculate them. An older malformed title can remain visible. An isolated restart test confirms the ledger title, saved observation and raw payload remain unchanged. This does not establish which parser created the user's record or guarantee that fresh OCR never misrecognizes glyphs. Check the recognized/raw title on a newly accepted contract during live testing. Historical records are not automatically renamed or reprocessed.

## Verification and known limits

Task 04.2: TypeScript, lint, **232 tests across 18 files**, and production build pass. All previous 228 tests remain; four additional cases cover exact titles and historical-record/evidence preservation.

Actual Windows verification passed at **1440 × 900 expanded**, **1440 × 900 compact**, and **1100 × 700 compact** in both shared-card contexts. Geometry tests measure source/Evidence/Details text ranges and Edit/Abandon SVGs, verifying centerlines within one CSS pixel, matched 32px action heights/icons, bottom alignment, no overlap, wrapping, hover/focus, navigation placement and persistence. Screenshots were visually inspected; see ignored `work/alignment-*.png` and `work/alignment-metrics-v052.json`.

Existing Windows interaction, Fleet, Game.log, automatic OCR import/evidence and OCR reprocess/recorder suites pass on v0.5.2. They cover protected dialogs, ships/favorites, manual contracts, run finalization, Manifest/History and reconciliation. Repository fixtures and generated preview pixels avoid reliance on temporary user screenshots.

No live Star Citizen session, fresh image OCR accuracy, physical in-game shortcut, Vulkan/exclusive fullscreen or native full-display capture was revalidated in this small UI task. Earlier native display tests and the v0.5.1 foreground limitation are historical, not new v0.5.2 passes. No production capture/input or identity algorithm changed.

The genuine 61,500 fixture reads 7 SCU and the genuine 65,250 fixture reads 25 SCU; earlier reported representative quantities remain separate fixtures. No production calculation or historical record was changed to fit an example.

See [Cargo-Run-Handoff.md](Cargo-Run-Handoff.md) for files, root causes, exact fixtures and verification details.
