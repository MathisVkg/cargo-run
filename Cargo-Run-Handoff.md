# Cargo Run v0.6.0 — Task 05 handoff

Cargo loading and delivery tracking is implemented in `C:\Users\zeyros\Documents\repository\cargo-run`. Fleet Operations 2.0, Industrial Graphite/#613DC1, OCR-first import and optional Game.log monitoring remain. No dependencies, continuous OCR, new input hooks, game interaction, route optimization, cloud service or payout automation were added. Pre-edit copies are under ignored `work/task05-backup/`. No commit, installer or changes to the user's live profile were made.

## Data model and additive migration

SQLite **schema 6** adds:

- Objective JSON: `loadedSCU`, `loadedShipId` and `loadEvidence` (Manual or Unknown). Required remains `quantitySCU`; delivered remains `deliveredSCU`.
- `cargo_progress_activity`: immutable operation ID, owning contract FK with ON DELETE CASCADE, persistent objective ID, timestamp and JSON evidence. Evidence includes action, source (Manual or supported Log), previous/new quantities and ship/evidence state, loaded/delivered deltas, quantity delta and optional undo reference.
- `cargo_progress_requests`: request UUID + SHA-256 payload hash, so identical retries do not apply twice and conflicting reuse is rejected.

Migration runs transactionally, initializes missing loaded quantities to zero with **Unknown physical evidence**, and preserves previous required/delivered values and all existing contracts, captures, audit evidence, settings, checkpoints and runs. Historic snapshots retain their original payloads; missing additive fields display as zero/Unknown. Zero is a recorded baseline, never proof of an empty ship. Older binaries refuse schema 6; use a pre-upgrade backup for downgrade.

The existing saveDomain method rebuilds objective rows. Therefore activity uses a contract FK and a persistent objective identifier rather than an objective FK that would cascade on every ordinary save. Public manual and OCR removal paths prohibit deleting objectives with cargo activity or loaded inventory. Closed-history cleanup deletes the contract and its activity together. Operation tombstones contain only IDs/hashes and remain for retry protection until full reset.

All cargo writes stay in main, behind trusted-sender fixed IPC, strict payload validation and existing maintenance guards. Multi-objective requests (maximum 100 distinct IDs) commit together or roll back, including audits and deduplication. The UI performs one objective at a time; grouped stop quantities are presentation only. Stale required/loaded/delivered/ship/evidence snapshots are rejected. Six decimal places are supported; values are rejected rather than silently clamped to requirements or capacity.

## Quantities and capacity

For each normal tracked objective:

- Required, loaded and delivered are non-negative; loaded + delivered cannot exceed required.
- Awaiting pickup = max(0, required - loaded - delivered).
- Remaining delivery = max(0, required - delivered).
- Selected-ship onboard = sum of loaded quantities assigned to that ship across **active and closed** non-superseded contracts.
- Recorded available capacity = max(0, catalog capacity - recorded onboard). Conservative planning still sums outstanding active deliveries, independently of current loads.

Cargo is never loaded by acceptance or required OCR quantities. One objective's recorded load belongs to one ship at a time. Switching selection never transfers it. The picker asks for confirmation when leaving a ship with recorded cargo. Manifest retains off-ship allocations and labels their ship; select that ship to change them. Delivery and unloading cannot operate on a different selected ship. To move cargo between ships, explicitly unload its record, select the new ship and record the actual loading there; there is no inferred or automatic transfer.

Loading/corrections cannot increase recorded onboard above selected capacity. An already-over-capacity record (for example after a future catalog reduction) can still be reduced by unloading/delivery. No container packing or ship API verification is claimed.

## User workflow

Manifest remains the detailed checklist, with separate Collection and Delivery sections and distinct persistent objective allocations even when commodities and stops match.

- Collection shows required, awaiting pickup and loaded. **Load remainder** records the objective's entire outstanding pickup requirement.
- Delivery shows required, allocated onboard, delivered and remaining. **Deliver onboard** records the entire loaded allocation.
- **Record loading / Record delivery** opens a compact inline action/quantity form for partial Load, Deliver, Unload without delivery or Correct recorded onboard total.
- Load and Deliver quantities are deltas. Correction is an absolute onboard value; unloading returns cargo to awaiting pickup and does not claim delivery.
- **Undo last cargo change** reverses only the latest unchanged manual operation for that objective. External changes, intervening operations, requirement edits, a different original ship or insufficient capacity prevent unsafe undo. Undo is itself auditable; undo-of-undo is not offered.
- Unknown/migrated/OCR-only physical state says **Load not confirmed**. An explicit manual operation records physical-load evidence; this remains a user report, not a game inventory reading.

Dashboard keeps four cards: active contracts, potential rewards, outstanding planned cargo and recorded onboard/capacity with recorded available space. The existing conservative planning bar remains separate. By Location stop cards show aggregate required/awaiting/loaded or delivered/remaining quantities; expanding objective allocations exposes individual actions and contract/route labels before any update. By Contract has a compact awaiting/onboard/delivered summary and the aligned v0.5.2 footer.

Contract Details shows quantities, the same controls and the latest **50** Cargo Activity operations. Advanced operation evidence is collapsed and includes exact identities, deltas and prior/new state. Objective editing is not a delivery shortcut: the editor's delivered field is read-only; main rejects attempts to invent progress through saveContract. Loaded objectives cannot silently change commodity/route, be removed or have requirements reduced below their physical allocation.

## OCR and Game.log

OCR remains the primary identity/requirements source. Rescans preserve loaded quantities and ship allocation. Manually recorded delivery is protected; conflicting observations remain in the existing OCR evidence/review system instead of replacing physical state. A smaller requirement conflicting with onboard cargo is rejected. Identity consolidation of a loaded source is blocked until cargo is explicitly unloaded; no physical inventory is silently discarded or moved to a new objective identity.

Initial OCR delivery observations retain the established reported-progress semantics and Unknown physical loading evidence. They do not create fictional loading operations or prove ship inventory. Later manual changes are explicit audited operations.

Only the already supported and tested `New Objective: Deliver delivered/required SCU of commodity to destination` notification format can reconcile delivery automatically, using verified MissionId/ObjectiveId association. No pickup/loading notification detector was added.

Supported cumulative delivery increases consume min(recorded onboard, delivery delta). If a notification reports progress beyond recorded loading, delivered advances but loaded stays at zero and physical evidence becomes Unknown; a **Log / Reconcile delivery** audit records the before/after states. Earlier cumulative/timestamped evidence cannot regress newer progress. Conflicting changed cargo identity or an impossible requirement preserves existing inventory, retains raw mission evidence and adds a bounded Advanced **Cargo conflict** diagnostic. Trigger-only/unverified capture associations still do not bind a mission.

Manual or supported log delivery does not automatically close a contract or confirm earnings. Existing verified completion events and explicit permitted completion remain separate. An OCR-only mission is not completed by guessing from a matching log title.

## Lifecycle, cleanup and backups

Abandonment removes a contract from active planning but preserves onboard cargo and capacity use. Completion also preserves recorded cargo. Finish Run snapshots current values, creates the next run and does not deliver, complete or unload anything.

Manifest's Retained onboard inventory lists closed and off-ship cargo. Closed cargo can be unloaded or corrected downwards; loading/delivery is disabled for closed contracts. A/B history cleanup is blocked with an actionable message until closed cargo is unloaded. This intentionally avoids deleting a physical inventory record. Full RESET remains explicit and backed up, and intentionally clears all tracking inventory.

The v0.5.3 confirmation/preview/consistent online SQLite + managed-evidence backup system remains. Schema-6 backups include progress activity and deduplication. Closed cleanup cascades removed-contract activity and preserves retained-active activity. Reset deletes both progress tables along with other tracking data, checks foreign keys, drains workers and leaves monitoring stopped across restart. Game.log is never modified. Manual restoration requires the database and captures together with Cargo Run closed; no filesystem rollback or one-click undo of cleanup is claimed.

## Files created and modified

| Area                                           | Files                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New shared progress types/helpers              | `src/types/progress.ts`                                                                                                                                                                                                                                                                               |
| New main progress engine, audit/reconciliation | `electron/main/cargoProgress.ts`                                                                                                                                                                                                                                                                      |
| Persistence/lifecycle/maintenance              | `storage/database.ts`, `storage/maintenance.ts`, `trackingService.ts`, `log/reconcile.ts`, `ocr/review.ts` under `electron/main`                                                                                                                                                                      |
| IPC bridge                                     | `electron/main/index.ts`, `electron/preload/index.ts`, `src/types/desktop.ts`                                                                                                                                                                                                                         |
| New common UI controls/history                 | `src/components/cargo/ProgressControls.tsx`, `CargoActivity.tsx`                                                                                                                                                                                                                                      |
| Existing UI integration                        | Dashboard, Manifest, ContractCards, ContractDetails, ContractDrawer, LocationStops and ShipSelector                                                                                                                                                                                                   |
| Model/store/calculations/style                 | `src/types/models.ts`, `src/stores/cargoDomain.ts`, `useCargoStore.ts`, `selectors.ts`, `src/styles/global.css`                                                                                                                                                                                       |
| Version/scripts                                | package + lock, native manifest, App, Navigation and Settings labels; `test:cargo:desktop`                                                                                                                                                                                                            |
| Tests                                          | New `tests/cargo-progress.test.ts` and `cargo-progress-desktop.cjs`; schema-6 assertions in automatic-import/capture-retention/ocr-queue/polish tests; existing OCR correction test now loads/delivers through the supported API; polish desktop scopes the pre-existing associated-contract expander |
| Documentation                                  | README and this handoff                                                                                                                                                                                                                                                                               |

## Verification results

All tests use repository OCR fixtures, generated/synthetic data and temporary databases/profiles. No personal Game.log or user's live Cargo Run database/captures was needed.

- TypeScript validation, ESLint, **272 tests across 21 files** (253 previous tests + 19 focused cargo regressions), and production build all pass.
- New unit coverage: partial/full load/delivery, over-requirement/onboard/capacity validation, independent identical allocations, atomic multi-objective rollback, correction/undo, idempotence, ship selection/undo ownership, abandonment/completion/run preservation, restart, real schema-5 upgrade, supported/out-of-order/conflicting log evidence, OCR rescan preservation, protected editing, consistent backups, reset and FK checks.
- `node tests/cargo-progress-desktop.cjs`: actual Windows Electron, partial/full loading, partial delivery/undo, correction, independent identical objectives, ship-switch confirmation/no transfer, selected onboard totals, closed inventory visibility/unloading, history, restart and FK integrity.
- Existing Windows alignment, polish, Fleet/manual desktop, Game.log, automatic OCR import, OCR review and all three data-management workflows pass. Historical suite output labels refer to their original task version; tests ran against v0.6.0 artifacts.
- Ignored screenshots: `work/cargo-manifest-v060.png`, `cargo-dashboard-v060.png`, existing regression artifacts; isolated profiles/backups remain under ignored `work/`.

No real Star Citizen session, fresh image OCR accuracy, physical in-game shortcut or native fullscreen/Vulkan capture validation was performed. Existing capture/input backends are unchanged.

## Detailed real-game test

1. Close Cargo Run and preserve your v0.5.3 database + captures before first v0.6.0 launch. Launch and verify contracts, history, evidence, favorites, paths, monitoring configuration and old required/delivered values. Existing loads must say unconfirmed.
2. Select the ship actually being used. With monitoring/automatic capture off initially, capture an accepted hauling contract and verify identity, required quantities, pickups/destinations and reward. No physical load should be inferred.
3. Physically load part of one allocation, then record that exact quantity in Manifest → Collection → Record loading. Check awaiting pickup, selected onboard and available capacity update immediately. Inspect that a second identical commodity objective remains unchanged.
4. Finish loading that objective and use Load remainder. Try a quantity over the objective requirement and one over ship capacity; both must fail without changing quantities or activity.
5. Deliver a partial amount physically. For 9 loaded / 4 delivered, Manifest must show loaded 5, delivered 4 and remaining delivery 5. Attempt delivery over recorded onboard; it must fail.
6. Test an intentional mistaken recording with Undo last cargo change. Use Correct recorded onboard total or Unload without delivery when the physical situation differs; inspect the activity's prior/new values. Do not use these as automatic game inventory verification.
7. Switch ship while cargo remains. Confirm the dialog; the new ship must start with its own recorded inventory, while Manifest lists cargo on the original ship. Select the original ship before adjusting that allocation.
8. Rescan the accepted contract. Manually recorded loaded/delivered values and objective IDs must survive; conflicts should require review. Reprocess the same capture without creating duplicates.
9. Optionally enable Game.log monitoring before a new mission. Verify supported delivery notification increments reconcile only the verified objective, record a Log activity entry and never fabricate a Load event. Unsupported/missing notifications require manual reporting.
10. Deliver all recorded cargo. The contract must remain Active until explicit local completion or verified completion notification. Potential reward must not become confirmed earnings merely because delivery is full.
11. Abandon a test contract with cargo onboard; verify active planning excludes it but recorded capacity and Retained onboard inventory preserve it. Unload its record when physically appropriate. Finish Run and verify cargo is not erased or delivered.
12. Restart and verify per-ship allocations, activity, contracts, snapshots and configuration. In an isolated or intentionally disposable testing environment, exercise the existing cleanup previews/backup/reset; closed-loaded history cleanup must be blocked until unloaded, and full reset must clear progress while leaving monitoring stopped.
