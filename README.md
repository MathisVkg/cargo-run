# Cargo Run 0.6.3 — Fleet Operations 2.0

## Reliability fixes (v0.6.3)

Task 06.3 improves quantity extraction, mission association diagnostics and retained-cargo recovery without changing navigation, automatic scanning or the OCR-first workflow. SQLite stays at **schema 8**; existing records/settings are retained.

- The managed capture folder still contained the actual 3840 × 2160 Agricultural Supplies screenshot. Fresh bundled offline OCR reads **0/15 SCU** correctly. The historical OCR/database entry that produced 715 was unavailable, so that exact engine failure cannot be reconstructed. The parser previously trusted digit sequences and did not enforce objective ambiguity during automatic import. It now distinguishes delivered/required fractions, accepts checkbox/slash variants and thousands separators, checks explicit collection totals, and flags missing separators or low-confidence numeric words for review. Whole-line confidence averages and ship capacity never decide the quantity; legitimate 715, 1,500 and larger requirements remain supported.
- **Reprocess saved OCR** runs the offline image worker; **Re-extract saved text** reruns parser 0.4.2 against immutable saved text. Either can repair an OCR-owned requirement from the same attached capture when its single row identity, complete recognized evidence and recorded physical progress permit it. Manual corrections, verified MissionId, objective IDs, ship allocations, loading/delivery totals and audits are protected. Conflicts and uncertain readings require review; no leading digit is silently discarded.
- Acceptance matching now recognizes the standard **Aluminium / Aluminum** spelling difference found in real Game.log marker templates. Automatic association still requires corroborating objective identities/details or the existing complete marker pair plus accepted-capture evidence, uniqueness and timing rules. One active contract, title, reward and timing alone cannot establish identity. Manual fallback shows available marker/state evidence and the specific rejection reason.
- Completed/abandoned inventory offers **Unload cargo** and **Correct onboard quantity** (downward, including zero). Wrong-ship controls are disabled. Neither action changes delivery totals, status or earnings; audit history distinguishes Unload and SetLoaded. Undo remains available only when it cannot restore closed onboard quantities or change closed delivery progress.
- Settings reports the number of blocking closed contracts, retained SCU and holding ships, with **Open retained inventory** navigation. Unload/correct each allocation to zero before history cleanup. Full reset remains available behind the existing backup and typed RESET confirmation. Backups, transactions, foreign-key checks, settings/favorites retention and stopped monitoring after reset remain in force.

### v0.6.3 validation and gameplay checks

**Executed successfully on Windows (v0.6.3 build):** `npm run typecheck`, `npm run lint`, `npm test` (**339 tests / 25 files**), `npm run build` (native host, TypeScript and production main/preload/renderer), and `git diff --check`. All **12 isolated Windows/Electron suites** passed: `reliability-desktop`, `ocr-recovery-desktop`, `lifecycle-desktop`, `cargo-progress-desktop`, `data-management-desktop`, `automatic-import-desktop`, `ocr-review-desktop`, `tracking-desktop`, `polish-desktop`, `alignment-desktop`, `desktop`, and `automatic-desktop` (each run as `node tests/<name>.cjs` after the successful build). Older suites retain historical release labels in their console output; all were run against the current v0.6.3 artifacts. The recovery suite exercised the actual saved-image offline worker, and the automatic suite exercised owned log → native capture → offline OCR. The new reliability suite exercised legacy 715 → 15 repair, retained-cargo actions, wrong-ship controls, cleanup blocker recovery, backup/FK integrity and restart. No test was skipped or left blocked; live Star Citizen gameplay/foreground shortcut delivery remains unexecuted and requires the checklist below.

Automated checks run against isolated temporary profiles/databases, never the user's tracking database. The bundled OCR engine was also run read-only against the nine available managed screenshots; the sanitized 15-SCU contract-pane export is a new regression fixture. See the handoff for commands, final results and changed files.

1. With Cargo Run closed, keep a recovery copy of its database/captures. Start v0.6.3 and check existing contracts, ships, cargo, settings and history. No migration beyond schema 8 is required.
2. Enable Game.log monitoring, accept a hauling contract and show the Accepted objective panel completely. Capture within two minutes for marker-context association. Compare each delivered/required quantity, wrapped location and reward against the game. A valid 0/15 row must show 15; a lost/uncertain separator must require review. Ship capacity must not alter a requirement.
3. In Contract Details check whether MissionId association is verified. Matching complete marker/template evidence (including Aluminum/Aluminium) may establish it; missing markers, late captures, incomplete OCR or competing missions must leave it unverified. The manual completion panel explains the reason and requires selecting a contract plus explicit confirmation.
4. Record loading and optionally delivery. Full recorded delivery alone must leave the mission Active. Complete/abandon it in Star Citizen: a verified MissionId should close it once, update History, and leave physical cargo and unsupported earnings unchanged. Restart and check persistence; repeat log notifications must not reopen an association prompt.
5. For existing saved captures, try image reprocessing, then saved-text extraction. Compare the observed quantity and import feedback. OCR-owned repairs must preserve row IDs, MissionId and physical progress; manual corrected values must remain protected. If the saved text itself reads a confident 0/715 with no contradictory evidence, text extraction cannot infer 15: inspect the saved image and explicitly correct it.
6. For a closed contract retaining cargo, open Settings → Local Data Management. Check blocker counts, SCU and ships; open retained inventory. Select another ship and verify controls are disabled; select the holding ship and partially unload, then correct downward or unload the remainder. Status, delivered total and earnings must stay unchanged; the entry disappears at zero and history cleanup can then proceed with its mandatory backup.
7. Test typed RESET only in a disposable profile: it must remain available while history cleanup is blocked, retain settings/favorites, back up evidence and leave monitoring stopped. Do not reset real tracking data merely to verify this release.

**Requires real gameplay verification:** in-game capture legibility/shortcut delivery and mission-event availability/association for the current Star Citizen build. Automated Windows tests replay owned genuine-format logs and fixtures; they do not run a live mission or establish game compatibility for every template.

The following sections retain the earlier release's architecture and operational documentation; the v0.6.3 rules above supersede earlier wording where applicable.

Cargo Run is a local Windows companion for Star Citizen hauling. The graphite and royal-purple workspace organizes accepted contracts, planned cargo, pickups and deliveries. OCR remains the primary contract source; Game.log is optional secondary evidence. SQLite, offline recognition, capture backends, identity matching and screenshot retention remain in place.

## Mission association and OCR recovery (v0.6.2)

OCR imports are now reconsidered when acceptance/identity evidence arrives later, at import and on restart. A unique MissionId can be associated in place from complete objective agreement or narrowly corroborated acceptance context. Title and timing alone never verify identity; ambiguous/weak cases retain explicit association.

The November 5 Game.log was located and inspected read-only. Its actual marker/template and objective-state formats are represented in a sanitized minimal fixture. The terminal parser now supports its unbracketed mission_id. Marker/state records are identity evidence only: they do not load cargo or change delivered quantities.

For the new acceptance path, saved Accepted evidence must agree with a recent acceptance and remain unambiguously owned by one contract/mission. Complete objective evidence allows a ten-minute capture window. The narrower marker-context rule requires one complete objective within two minutes, consistent pickup/dropoff marker families/definition and an exact template commodity token. Unsupported families, missing proof, competing same-title instances and reserved MissionIds remain unverified. See the handoff for precise criteria and limitations.

**Reprocess saved OCR** now recognizes the existing image with the offline worker. Scan History shows queued/processing, improved/changed, unchanged or actionable failure feedback. Blank/worse results and worker/import errors retain prior recognized data. Original recognition and up to three recovery attempts remain in Advanced diagnostics; screenshot bytes are not rewritten.

**Re-extract saved text** is a separate local parser/reconciliation action. If pickup was never visible, image reprocessing explains the limitation and the existing compact form lets you correct only missing fields without deleting the capture.

Schema **8** adds persisted identity evidence while preserving the cargo/lifecycle data model and existing records. Association/reprocessing preserve manual corrections, objective IDs, onboard allocations and cargo operations. Supported verified completion closes the correct contract; closure retains physical cargo discrepancies. Rewards remain unattributed evidence and never become earnings by amount/time alone.

The v0.6.1 navigation refinement remains: primary pages above, Settings/icon-only mode toggle below, hamburger hide/compact reopening and automatic narrow-width hiding.

## Cargo loading and delivery (v0.6.0)

Manifest is the detailed cargo checklist. Every persistent objective keeps separate **Required**, **Loaded** and **Delivered** SCU:

- Awaiting pickup = max(0, required - loaded - delivered).
- Remaining delivery = max(0, required - delivered).
- Selected-ship recorded onboard includes its loaded allocations on active **and closed** contracts; recorded available space subtracts this from catalog capacity.
- Conservative planned capacity still sums outstanding active deliveries separately.

Use **Load remainder** or **Record loading** for full/partial loading. Use **Deliver onboard** or **Record delivery** for full/partial delivery: loading 9 then delivering 4 leaves 5 onboard and 4 delivered. The inline action form also supports **Unload without delivery** and **Correct recorded onboard total**. Correction sets an absolute onboard amount; ordinary Load/Deliver/Unload are deltas. Individual controls always name their contract/commodity/route; identical commodities retain separate allocations. There is no automatic grouped distribution.

**Undo last cargo change** reverses only the latest unchanged manual operation for that objective. Supported external progress, intervening edits/operations, wrong ship or insufficient capacity can prevent undo. Activity is auditable under Contract Details (latest 50 entries; technical evidence collapsed). Duplicate request UUIDs cannot apply the same change twice. All writes and multi-objective transactions stay in Electron main.

Loading and delivery cannot exceed requirements, recorded onboard quantities or capacity. Inputs are rejected rather than silently clamped. Delivery does not automatically complete the contract or confirm payout. The contract editor cannot bypass these controls to invent delivered progress.

Loaded cargo remains assigned to its recorded ship. Switching asks for confirmation if cargo is being left behind and never transfers it. Manifest retains off-ship and completed/abandoned inventory; select its ship to update it. Closed cargo can be unloaded/corrected downwards. History cleanup is blocked until closed loaded cargo is explicitly unloaded; full RESET intentionally clears it after backup. Finish Run snapshots progress without unloading or inventing delivery.

SQLite migration **6** preserves existing required/delivered values and all other data, adding Loaded = 0 with **Unknown physical evidence**. “Load not confirmed” means zero is an unverified baseline, not proof of an empty ship. OCR required quantities and contract acceptance never load cargo. Rescans preserve manual progress; supported cumulative Game.log delivery can reconcile recorded inventory and is audited separately, without fabricated loading. Conflicting notifications retain inventory and raw evidence under Advanced diagnostics.

## Fleet Operations workspace

- **Dashboard — Cargo Operations:** four statistics, separate Pickup Stops and Delivery Stops, and a remembered By Location / By Contract view. Each known full payout counts exactly once, never by destination. Unknown rewards are excluded. Planned cargo is outstanding required SCU, not physically loaded cargo.
- **Manifest:** required/outstanding SCU and commodity/location counts, with separate collection and delivery tables. Rows keep their persistent objective IDs even when visible cargo matches. Collection and Delivery now show recorded progress with objective-specific loading/delivery controls.
- **Contracts:** active records, title/commodity/pickup/destination search, compact active filters, full rewards and source/evidence access. Completed and abandoned records remain in History.
- **Details:** centered, responsive modal up to 900px wide and 88% of viewport height. Overview statistics separate potential reward, confirmed earnings and required/delivered/remaining SCU. Objectives use a structured table; evidence uses thumbnails and a separate full viewer. IDs/raw OCR/provenance remain under Advanced, and permitted edit/completion/abandon/unlink actions remain accessible.
- **Add/Edit Contract:** centered 680px native-dialog modal, scrollable body, visible Save/Cancel footer, multiple objectives, total SCU, validation, duplicate-submit protection and an unsaved-changes warning.
- **History / Scan History / Settings:** existing workflows share the new semantic palette. Settings order is OCR & Capture, optional Game.log, Ships, Storage & Data, Local Data Management, collapsed Advanced & Diagnostics, Application Information.

The sidebar groups Dashboard, Manifest, Contracts, History and Scan History at the top, with Settings and an icon-only compact/expanded toggle anchored to the bottom. The hamburger hides either visible mode completely and reopens compact mode; there is no temporary drawer or duplicate hide/pin control. At 1400px+ choose expanded (212px) or compact (62px). At 1200–1399px constrain to compact. Below 1200px hide automatically without overwriting the saved wide preference; explicitly reopening remains compact, and the hamburger hides it again. Narrow reopening is temporary; returning wide restores the saved preference. Expansion is disabled below 1400px. Page selection, Escape and outside clicks leave the persistent sidebar in place. Width changes do not animate; window controls and drag regions remain intact.

Centered Add/Edit, Details, Finish Run and Ship Selector dialogs **do not close on outside clicks**. Escape closes read-only dialogs, protects unsaved edits with a discard warning, and cancels confirmations without executing them. Shared native dialogs are portaled outside the draggable title bar, with no slide/scale/discrete exit transition and with focus trapping/restoration. Ship search and the concept checkbox now accept mouse and keyboard interaction; a status line explains extra concept matches or no additional matches.

Location cards link directly to one contract or expand a list of associated contracts, each with the relevant remaining SCU. Commodity quantities explicitly say “SCU remaining”; a secondary line labels delivered / required. Contract actions stay in the linked details. Contracts search, filter, count and Add share an aligned, wrapping toolbar.

Sidebar icons retain accessible labels/tooltips. Settings and the small icon-only mode toggle stay anchored at the bottom; application information remains in the status bar. Shared Contract Cards in Dashboard → By Contract and Contracts center source/evidence and Details/Edit/Abandon on the same axis. Actions stay 32px high, long-title cards keep bottom-aligned footers, and metadata/actions wrap into clean rows when space requires.

The shared tokens in `src/styles/global.css` are background #181A1D, secondary #23272B, panel #333B42, accent #613DC1, hover #7956D8, light accent #A994F0, text #F2F1E9, secondary text #A2B1BD, success #8BB79B, error #D57B84, warning #D8AD6F and border #424A52. Inter uses the installed system font when available, with Segoe UI fallback; numerical statistics use a restrained monospace stack. There are no downloaded fonts, gradients or added UI libraries.

### Planning assumptions

Capacity utilization assumes all outstanding cargo travels together; unallocated capacity is max(0, selected capacity − outstanding SCU). An excess warns about staged deliveries or additional trips; it does not claim simultaneous carriage is required. Required, delivered and remaining quantities stay separate. Manifest distinguishes required/awaiting/loaded/delivered and labels manual or supported reported evidence.

Grouping is a pure presentation projection. Exact case/whitespace equivalence and a bounded NB Int. Spaceport / NB Int. Spaceport on microTech alias are supported. Original strings are preserved. Grouping does not change mission/objective identity. Distinct persistent contract/objective IDs remain distinct; superseded records are excluded.

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

SQLite schema is **8**. Catalog refresh transactionally upserts only the ships table. The separate schema-6 migration initializes physical-load metadata without changing existing required/delivered amounts, evidence, audits, checkpoints or run history. Existing selected IDs are preserved. The additive `ui.preferences` setting stores navigation mode, view, favorites and recent IDs. Existing records default to expanded navigation without resetting other settings. A fixed, validated, trusted-sender IPC endpoint accepts only navigation mode, Dashboard view and known unique favorite IDs; the main process manages recents. Database access stays in main, context isolation/sandbox remain enabled and renderer Node integration remains disabled.

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

Schema **5** introduced `pending_log_missions`, keyed by MissionId, and reconstructs its secondary projection from saved immutable events. It does **not** delete, move or convert existing ledger contracts, captures, links, runs, checkpoints or corrections. Import outcome metadata and coverage are additive JSON fields.

Existing `capture_contract_links` and `ocr_review_audit` retain original observations, corrections, conflicts, before/after data and authorization type: Automatic, Issue resolved or Reviewed. Automatic associations are distinguished from user-confirmed associations.

Use **Details / evidence** from Dashboard, Manifest or History for screenshots, larger previews, date/source, warnings and field provenance. Unlinking does not delete the contract. Default retention remains 7 days unlinked, protected while attached to an active contract, and 30 days after closure. Missing/expired images leave contract data and structured evidence/audit. Deliberate Clear Captures removes files/capture rows while linked text evidence remains.

SQLite, WAL, foreign keys, full synchronous commits, the serial OCR queue, 12-pending/50-capture/512-MiB limits, protected UUID image protocol and local English Tesseract remain. Settings shows actual data paths. When protected evidence fills storage, explicit cleanup/unlink/clear is still needed.

Back up the database and captures folder with Cargo Run closed before upgrading. Older binaries intentionally refuse schema 8. Restore a pre-upgrade backup for rollback; do not lower PRAGMA user_version manually.

## Exact in-game test

1. Back up local data with Cargo Run closed, launch v0.6.2, and leave Game.log monitoring and automatic screenshot capture off.
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

## Matching reliability and local data management (v0.5.3)

An empty Dashboard can still have pending Game.log missions. Previously, title-only pending missions could cause an ambiguous match without any cargo evidence. They are now excluded from routine candidate competition and retained under Advanced, without expiration or deletion of authoritative events. Titles and nearest timestamps never establish identity alone. Objective-supported MissionId/ObjectiveId associations and existing capture bindings retain priority; distinct plausible active instances still require an explicit choice. Saved corrections and raw evidence remain protected. Scan History → Advanced diagnostics explains up to 50 relevant candidate decisions, including origin, status, objective overlap and time relationship.

Settings → **Local Data Management** shows real persisted counts and approximate database/managed-image storage. Each action requires a preview and confirmation:

| Action                         | Effect                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clear closed contract history  | Remove completed/abandoned contracts, their objectives/links/audits and references/snapshots from retained runs; preserve active contracts/evidence and current run.                     |
| Clear contract and run history | Also remove finished runs; preserve active contracts/current run and configuration.                                                                                                      |
| Reset all local tracking data  | Remove contracts, runs, OCR records/images, events/pending missions/diagnostics, automatic requests and checkpoints; create an empty current run. Type **RESET** to enable confirmation. |

All options preserve ship catalog/selection/favorites, layout/navigation and OCR/capture/shortcut/Game.log preferences. Smaller cleanups retain unlinked captures under normal retention, with a guard against silently reimporting cleared history. Removed closed MissionIds remain archived out of routine pending matching while raw log evidence is preserved.

A unique timestamp/UUID backup of SQLite and owned screenshot evidence is required before deletion, under the displayed userData `backups` path. SQLite online backup accounts for committed WAL data; backup integrity and foreign keys are verified. Backup failure cancels cleanup. Database cleanup is transactional and checks foreign keys. Backup directories are outside deletion targets; Game.log is never modified.

Backups provide **manual whole-snapshot recovery**, not one-click undo. Close Cargo Run, preserve current data separately, then restore the backup database and captures together; remove stale live WAL/SHM only while the app is fully closed. File deletion follows database commit: locked images are reported as warnings, without claiming filesystem rollback. Schema remains 5; there are no new dependencies.

Reset stops monitoring, cancels/drains capture and OCR work, and leaves monitoring stopped across restart. Explicitly starting monitoring tails **new events going forward** because checkpoints were cleared. **Import existing history** is the separate deliberate replay action. Other cleanups pause monitoring and resume only if it was running.

For a fresh v0.6.0 test, use Reset, record its backup path, verify empty pages and preserved settings, restart and confirm monitoring stays stopped. Then explicitly Start monitoring, accept a new mission and capture its accepted screen. Reprocess the same CaptureId to check idempotence. Exercise distinct identical missions with explicit identity choices. Enable automatic capture separately after this baseline.

## Verification and known limits

Task 06.2: TypeScript, lint, **315 tests across 24 files**, and production build pass (293 previous tests plus 22 association/recovery regressions). Tests use sanitized genuine event formats, repository OCR assets and synthetic cases.

The isolated Windows recovery suite uses the actual offline Tesseract worker on a generated saved PNG: Processing → Improved → Unchanged, original image/data preservation, missing-file feedback, no duplicate cargo/contract operations, real-format acceptance association/closure, restart and foreign keys. Existing import, review/recorder, lifecycle, cargo, cleanup, tracking, navigation/alignment and manual desktop suites pass with intentional schema/feedback expectations updated.

The native helper's initial file lock was resolved by closing Cargo Run; the normal production rebuild passed. No Windows security settings were changed. The native automatic screenshot/OCR, cancellation and retention suite also passes against a synthetic application. Real game logs and user screenshots/database were not modified by automated verification.

Actual November 5 source records were inspected, but automatic association/recovery has **not** been verified during fresh Star Citizen gameplay. Template naming and recognition can vary; weak or ambiguous proof remains pending. Unsupported formats require evidence-based support. Reward attribution remains unsupported.

See [Cargo-Run-Handoff.md](Cargo-Run-Handoff.md) for root causes, v0.6.1/v0.6.2 comparison, exact matching criteria, schema details, file list, verification boundaries and manual Star Citizen instructions.
