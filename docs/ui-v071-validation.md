# Cargo Run v0.7.1 UI validation

Task 07.1 refines presentation. Schema 9, main-process services, OCR parsing, matching, earnings, cargo calculations, evidence associations and capture behavior are unchanged. No user database, captures or Game.log were changed during development.

## Changes and shared components

- Dashboard: one shared `LocationStops` architecture for pickup/delivery. Rounded graphite cards, icon/label, location, required SCU and contract badge. Each objective retains its ID; identical routes show contract names to distinguish allocations. Shared `ChecklistToggle` provides a purple pending action and a checked green Undo state. Pickup bulk actions mark only pending entries at that location; Undo all clears only its pickup reminders. Delivery remains individually reversible.
- Shared `StatCard` uses compact spacing and optional keyboard-accessible `InfoTip` help. Dashboard retains all four calculations, with four/two/one-column responsive rules.
- Manifest: seven aligned columns and compact rows. Each objective's Progress button expands only its own advanced controls. Collection/Delivery can collapse independently. Existing `ProgressControls` retain validation, ship checks, corrections and undo. Retained onboard inventory remains directly accessible.
- Shared `ContractCards` serves Contracts and Dashboard By Contract. Completion/source and Details/Edit/Abandon occupy one footer; deliberately constrained cards use two aligned rows. Manual completion confirmation and cargo protection remain intact.
- Details: native centered `Overlay` remains the modal shell. Cargo controls and audit history use disclosures; evidence previews preserve the full image; footer actions remain outside the scrolling body. Header/footer spacing and radii are shared with other dialogs. OCR issue actions stay together in a sticky footer within the scrollable review.
- History: ledger and closed-run lists render at most 25 records per page through shared `Pagination`. Search/status changes reset the ledger page; counts, payouts, earnings and saved runs are unchanged. Expanding one saved run still displays its existing immutable snapshot.
- Scans: compact summary/thumbnail, clear Review issue or View contract, Advanced disclosure, separate destructive action region. Recognition/review/reprocess algorithms are unchanged.
- Settings: Screenshot & OCR, collapsible Game.log Monitoring, Ship & Fleet, Storage & Captures, compact Cargo Workflow, separate Experimental Automation, Local Data Management and About & Diagnostics. No unavailable appearance/fleet settings were invented. Automation remains Off by default. Long shortcut help is disclosed; registration/callback limitations remain visible.
- Graphite tokens: background #15191E, surface #23282E, elevated #323A42, accent #613DC1, highlight #A78BFA. Existing semantic colors and native focus/dismissal protections remain.

## Automated verification

Run from the repository:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
node tests/ui-refinement-desktop.cjs
```

The visual command is also available as `npm run test:ui:desktop` (includes build). It creates an owned `work/ui-refinement-*` profile, synthetic contracts, generated evidence and imported/needs-review scan fixtures. It never reads historical user capture IDs. It checks page/body overflow, centered modal bounds/outside-click protection, independent expanders/sections, retained cargo access, default manual completion, pagination/filter reset and unchanged original fixture contracts. Screenshots and viewport measurements are generated under `work/ui-v071/`.

385 unit tests / 28 files pass. Windows desktop suites are listed in the README/handoff; their old console version labels identify their original scope. The native automatic-capture suite uses an owned test window and synthetic log; it does not prove Star Citizen foreground shortcut delivery.

## Viewport evidence

| Requested         | Actual renderer | Result                                                           |
| ----------------- | --------------- | ---------------------------------------------------------------- |
| 1100 × 700        | 1100 × 702      | Existing Windows minimum-size/DPI behavior retained; no override |
| 1280 × 800        | 1280 × 800      | Verified                                                         |
| 1440 × 900        | 1440 × 900      | Verified                                                         |
| Maximized desktop | 2560 × 1392     | Verified on 3840 × 2160 display at 150% scale                    |

Rendered screenshots were inspected, including pickup/delivery wrapping, both Dashboard modes, default/expanded Manifest, retained cargo, Contracts/footer geometry, Details/evidence scrolling, History, imported/needs-review scans, review dialog and Settings. Narrow navigation hides automatically; the hamburger reopens compact navigation without changing saved preferences. Expanded/icon-only navigation and keyboard focus remain covered by existing desktop tests.

Representative generated images:

- [Pickup card](../work/ui-v071/pickup-card.png)
- [Dashboard](../work/ui-v071/dashboard-1440.png)
- [Delivery cards at narrow size](../work/ui-v071/dashboard-delivery-1100.png)
- [Dashboard By Contract](../work/ui-v071/dashboard-contract-1280.png)
- [Compact Manifest](../work/ui-v071/manifest-1440.png)
- [Expanded Manifest](../work/ui-v071/manifest-expanded-1100.png)
- [Retained cargo](../work/ui-v071/manifest-retained-1440.png)
- [Contracts](../work/ui-v071/contracts-1440.png)
- [Contract Details](../work/ui-v071/details-1440.png)
- [Evidence with fixed footer](../work/ui-v071/details-evidence-1100.png)
- [History](../work/ui-v071/history-1440.png)
- [Scan History](../work/ui-v071/scans-1440.png)
- [Review dialog](../work/ui-v071/scan-review-1100.png)
- [Settings](../work/ui-v071/settings-1280.png)
- [Workflow settings](../work/ui-v071/settings-workflow-1440.png)
- [Compact navigation](../work/ui-v071/navigation-compact.png)

These artifacts are intentionally generated in ignored work storage; rerun the visual command to recreate them after a fresh checkout.

## Exact manual checks

Use a disposable profile to avoid changing live operations. From the repository, in a fresh PowerShell:

```powershell
npm run build
$env:NODE_ENV = 'test'
$env:CARGO_RUN_TEST_USER_DATA = Join-Path $env:TEMP ('cargo-run-ui-manual-' + [guid]::NewGuid())
& .\node_modules\.bin\electron.cmd .\out\main\index.js
```

1. Add two manual contracts sharing a pickup and commodity/destination; give one a second objective. In Dashboard By Location mark one pickup, then Mark all picked up and Undo all. Verify delivery marks stay independent and Recorded Onboard remains unchanged.
2. Toggle By Contract; open Details, Edit and completion confirmation. Cancel each, click outside and test Tab/Shift+Tab/Escape. Details/confirmation must resist outside dismissal; dirty edits retain their warning.
3. In Manifest expand one Progress row, record a partial load, deliver part, undo, correct and unload through existing controls. Other rows stay collapsed. Collapse Collection; Delivery remains open. Complete a contract with cargo onboard and confirm retained inventory remains manageable without earned aUEC being invented.
4. Open History, search/filter and use pagination when more than 25 records exist. Open details/evidence. In the automated synthetic screenshots compare Imported and Needs review scans; run `node tests/scan-ux-desktop.cjs` to exercise correction, Advanced tools and deletion safeguards in an isolated profile.
5. At 1100 × 700, 1280 × 800, 1440 × 900 and maximized, test hamburger/navigation modes, long locations, footers, internal dialog scrolling and Settings disclosures. Confirm Experimental Automation is Off. Use `node tests/data-management-desktop.cjs` for isolated backup/cleanup/reset verification; do not reset a live profile just to inspect the UI.

## Deliberate differences and limitations

The design combines reference A's rounded card/purple action with its grouped progress footer. Completed rows use an explicit green “Done · Undo” button instead of an unlabeled checkbox, retaining clear keyboard and undo behavior. Multi-contract identical routes display the contract name. Delivery does not add a new bulk mutation. At the narrow viewport, multi-stop pages require normal vertical scrolling; long advanced tables may scroll inside their own container. The 1100 × 700 target resolves to 702 CSS pixels high on this Windows/DPI setup.

This is client-side pagination: the existing snapshot loading architecture still loads the full ledger; individual expanded run snapshots are not virtualized. Actual game capture/physical shortcut delivery was not retested by this UI task. No installer, publish, commit or architecture change is included.
