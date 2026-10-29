# Cargo Run 0.4.0

Cargo Run is a local Windows companion for Star Citizen hauling. OCR is the primary source of complete contract details. Review and explicit confirmation turn an observation into a contract; Game.log is optional supporting evidence for identity and mission events. The Fleet Operations Dashboard, Manifest, History, manual entry and offline capture pipeline remain.

## Run and verify

Requires Windows, Node.js 24+, and the installed .NET Framework C# compiler for the existing capture helper.

```powershell
cd C:\Users\zeyros\Documents\repository\cargo-run
npm ci
npm run dev
```

For a production launch, use `npm run build`, then `npm start`.

| Command                          | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `npm run typecheck`              | Strict TypeScript validation                                      |
| `npm run lint`                   | ESLint                                                            |
| `npm test`                       | 183 automated tests across 14 files                               |
| `npm run build`                  | Native helper and production Electron/React bundles               |
| `npm run test:desktop`           | Existing Windows application and tracking workflows               |
| `npm run test:ocr:contracts`     | New Windows OCR review, reconciliation and persistence workflow   |
| `npm run test:ocr:review`        | Saved OCR reprocessing and shortcut recorder regression           |
| `npm run test:window:desktop`    | Separate-process Electron window-surface capture                  |
| `npm run test:ocr:desktop`       | Native display capture, shortcut and offline OCR fixture          |
| `npm run test:automatic:desktop` | Native acceptance-triggered capture fixture                       |
| `npm run package:win`            | Unpacked Windows package; installer distribution remains deferred |

Generated test profiles, screenshots, native binaries and source backups remain in ignored `work/` or the existing generated-resource locations. No new runtime dependency was added.

## Create a contract without Game.log

1. Open **Settings → OCR & Capture**. Select **Capture Method** and, when displayed, the monitor. Automatic capture can remain off.
2. Display the contract in Mobiglas. Use **Capture now** or the saved shortcut. Open **Scan Review**.
3. Inspect the screenshot, original recognized fields, action/view evidence, objectives, quantities and warnings. **Reprocess saved OCR** reruns extraction without taking a screenshot or rewriting raw OCR.
4. In **Review and confirm contract**, keep **New OCR-only contract** selected. Correct title, company, optional reward, commodity, pickup, destination, required SCU and delivered SCU. Add/remove rows when needed. Original OCR values and manual corrections are shown separately.
5. Leave acceptance time blank when unknown. A manually entered time must be a valid ISO timestamp with timezone. Capture time is never substituted.
6. Select **Check changes**. Confirm that the contract was accepted and that you checked the potentially incomplete objective list. Offers and ambiguous screenshots require that same explicit acceptance confirmation. Invalid or missing required fields prevent saving.
7. If matching candidates exist, either select an existing contract or explicitly confirm that this is a separate accepted instance. Choose **Confirm new OCR contract**.
8. Dashboard, capacity, destination groups, potential earnings, Manifest and History update immediately. Potential payout is counted once per contract. Confirmed earnings stay zero unless supported independently.

**Cancel review changes** discards unsaved edits. Selecting a different target reloads its suggested mappings; choose the target before correcting fields. Older valid captures remain observations until confirmed.

OCR-only contracts have a real internal ContractId and no MissionId. They support manual editing, delivered quantities, abandonment, manual completion through **Details / evidence**, and run finalization. Manual completion and finishing a run do not turn potential reward into confirmed earnings.

## Enrich a Game.log contract

Game.log is optional for OCR-only use. It provides supported acceptance, delivery-objective and completion notifications when available.

1. In **Settings → Game.log Monitoring**, choose Game.log and start monitoring before accepting a new mission. First start skips pre-existing bytes. **Import existing history** reads older contents only after confirmation.
2. Capture the contract details. Automatic acceptance capture is optional and still saves observations only.
3. In Scan Review select the intended existing contract. Inspect the MissionId, candidate reasons, all objective mappings and the known acceptance time.
4. Use **Check changes**. Resolve each material conflict with **Keep stored** or **Use reviewed**. Both values and the choice remain in the review audit.
5. Confirm acceptance, incompleteness and the association, then **Confirm update**. The existing ContractId and MissionId remain. Known lifecycle, progress and confirmed earnings are preserved.

A title, reward, commodity, destination or nearby timestamp is supporting evidence, never unique identity. An automatic trigger's candidate MissionId stays unverified until a user-confirmed association. The app never selects a contract merely because it was accepted most recently.

ObjectiveId is the strongest objective identity. Unique supporting tuples can suggest mappings, but the user must confirm them. Identical objective rows remain distinct. Map each row to the appropriate existing objective or explicitly mark it separate. Unmapped stored rows are retained unless explicitly selected for removal; delivered rows cannot be discarded and progress cannot regress. Ambiguous later log objectives remain unresolved instead of being merged or appended twice.

When Game.log arrives after an OCR-only contract, review its already-bound capture and select the verified log contract. Explicit **consolidation** keeps the log contract canonical, redirects current-run references and all screenshot bindings, and retains the original OCR record as a superseded audit record. Historical run snapshots remain unchanged. Two different MissionIds cannot be consolidated.

Supported log formats remain:

- `Contract Accepted: <title>`
- `New Objective: Deliver <delivered>/<required> SCU of <commodity> to <destination>`
- `Contract Complete: <title>`

The existing parser requires the supported notification context and valid MissionId. Missing/ambiguous notifications stay diagnostic or unresolved. Completion does not confirm a payment. ONLINE means the file is readable and monitored, not that Star Citizen is running. Checkpoints resume unread bytes after restart/pause; detected rotation starts a new generation. Import is bounded to the initial file size and is replay-safe.

## Identity, review safety and storage

- **ContractId:** local ledger identity. **MissionId:** definitive verified log identity. **CaptureId:** observation identity. **ObjectiveId:** known log objective identity.
- One persistent binding per CaptureId prevents repeated confirmation from creating another contract. Many CaptureIds may bind to one contract.
- A separate identical-looking OCR instance requires explicit confirmation. Separate MissionIds always remain separate.
- Review submissions check both current contract/source versions and OCR evidence hashes. Stale submissions are rejected; newer edits and progress are preserved.
- Main-process SQLite transactions commit contract/objective changes, evidence bindings and review audit together. Failed writes roll back in-memory and persisted state.
- Sample data cannot be mixed with real reviewed OCR records.

SQLite schema **4** adds `capture_contract_links` and `ocr_review_audit` without rewriting old contracts, captures or run history. Links reference contracts and survive deletion/expiry of capture records. Contract saves use upserts so evidence foreign keys remain valid. The audit retains original observations, corrections, conflict decisions, confirmations, provenance and before/after values. Provenance for objectives uses stable internal objective IDs.

Data stays in `cargo-run.sqlite` and `captures/` under Electron's userData directory; Settings displays the exact paths. WAL, foreign keys, busy timeout and full synchronous commits remain enabled. Future schema versions and startup failures are refused explicitly without erasing data.

For backup or rollback, close Cargo Run and copy its database and captures folder. Older v0.3.3 binaries intentionally refuse schema 4; use a pre-upgrade backup to roll back instead of lowering PRAGMA user_version or deleting association tables.

## Screenshot evidence and retention

Use **Details / evidence** in Dashboard, Manifest or History to inspect stored contract values, linked screenshots, larger previews, capture date/source, warnings, original OCR, reviewed values, conflict decisions and field provenance. Unlink one association without deleting the contract or its audit.

| Evidence state                         | Default expiry                 |
| -------------------------------------- | ------------------------------ |
| Unlinked                               | 7 days; configurable 1/7/14/30 |
| Linked to active contract              | Protected                      |
| Linked to completed/abandoned contract | 30 days after closure          |

Cleanup runs at startup and hourly when enabled; manual expired cleanup is separate. It uses current link/contract state, including protection for a surviving active binding whose capture metadata is missing. Expiry removes owned image files/capture metadata and preserves contracts plus structured evidence/audit. Missing files show an unavailable-image message. **Clear stored captures** deliberately removes images and raw capture records, including linked images, after confirmation; minimal linked evidence and contracts remain.

The existing queue stays serial with 12 pending, 50 stored captures and 512 MiB limits. It refuses additional work when full rather than evicting protected active evidence. Interrupted work recovers with the existing queue rules. Retry OCR requires an existing image; retry capture creates a new screenshot. Failed/rejected automatic attempts are grouped by request, with attempt count and final reason, while usable observations remain individually reviewable.

## Settings

Settings now follows this order: **OCR & Capture → Game.log Monitoring → Ships → Storage & Data → Advanced & Diagnostics**. Advanced is collapsed initially and contains provider/parser information, shortcut diagnostics, automatic request history and the per-trigger source override.

**Capture Method** controls manual, shortcut and automatic capture by default:

- **Star Citizen Window:** verified window surface; no fallback.
- **Full Display:** existing native display capture, including other visible content.
- **Automatic:** prefer the game window; full-display fallback only when explicitly enabled.

The monitor selector appears only when a configured method may capture a display. Old saved preferences with a different automatic source are preserved as an explicit advanced override; normalization occurs on read and persists on the next policy save. Disable that override to use the shared method. Automatic capture remains experimental and off by default, with the existing 3-second delay, 3 attempts, 20 pending requests and two-minute request expiry. Imports never trigger screenshots; stopping monitoring/settings changes cancel pending work.

## Shortcut delivery and real-game validation

**Registered** means Electron reserved the binding; **Listening** means the optional native listener acknowledged registration. Neither proves delivery while Star Citizen is focused. Only an **Invocation** event/callback count proves callback delivery. **CaptureRequested**, **CaptureSaved**, or **CaptureError** then identifies capture behavior. Diagnostics retain at most 50 lifecycle events and counts, not a raw keystroke history.

Electron remains the production default. Its existing one-second quiet-period guard suppresses repeated callbacks; rapid separate presses may also be ignored because Electron provides no key-up signal. Recorder Save/Escape/Cancel/focus loss and the 45-second lease remain. No new input experiment was added.

The existing development-only Raw Input prototype is off by default and excluded from packaged releases. It uses a hidden WM_INPUT window and RIDEV_INPUTSINK; it observes only the configured chord and does not consume gameplay input. Earlier physical-key delivery failures remain unresolved. Do not treat Listening, synthetic presses, or a normal-app callback as proof of game compatibility.

For an optional comparison of the existing backends, close Cargo Run, then:

```powershell
npm run native:raw-input
$env:CARGO_RUN_INPUT_PROTOTYPE="1"
$env:CARGO_RUN_SHORTCUT_BACKEND="electron"
$env:CARGO_RUN_SHORTCUT_COMPARE="1"
npm run dev
```

Only Electron triggers captures in this configuration. To test Raw Input as the sole trigger, close the app, set `CARGO_RUN_SHORTCUT_BACKEND="raw-input"`, and launch again. Reset diagnostics between runs, release all keys after registration/layout changes, physically press/release the saved chord once with the game focused, and compare per-backend counts. Never enable competing production triggers. Close the test app and remove these three environment variables to return to the default configuration. Preserve Electron/manual capture if native input remains unreliable.

### Exact Star Citizen test

1. Back up local data with Cargo Run closed. Start v0.4.0 with automatic capture off and Game.log monitoring stopped.
2. In Settings select **Full Display**, select the game monitor, and save the desired shortcut. Reset diagnostics under Advanced. Open an accepted Mobiglas hauling contract in Star Citizen.
3. Physically press/release the shortcut once. Return to Cargo Run: check Invocation → CaptureSaved/error, screenshot dimensions, and raw/structured OCR. Registration alone is insufficient. If no callback arrived, use manual Capture now and retain the diagnostic evidence.
4. Test **Star Citizen Window**, then **Automatic** with fallback disabled. Confirm the saved surface, dimensions and overlapping-window behavior. Test an explicitly enabled fallback separately. Record game graphics API, window/fullscreen mode, monitor scaling and privilege context; production game identity/Vulkan behavior remains unverified.
5. Review/correct all objectives. For A verify 61,500 aUEC, 8 SCU, two rows and Port Tressler. For B use the screenshot's actual quantities; the saved regression export is 7+6+7+5 = 25 SCU. For C verify 60,750 aUEC, 31 Hydrogen, microTech Logistics Depot S4LD13 → Rayari Deltana Research Outpost.
6. Confirm a new OCR-only contract. Check one mission/payout, all destinations, capacity and History. Recapture it and attach to the same contract. Reprocess/reconfirm the same CaptureId: no new contract.
7. Test an Offers screen containing ACCEPT OFFER and an accepted screen containing TRACK/UNTRACK/ABANDON. Contradictory action/tab evidence must stay ambiguous. With acceptance confirmation unchecked, saving must be unavailable.
8. Enable optional Game.log monitoring, accept a new contract, capture it and select its exact MissionId manually. Review conflicts and objective mappings before updating. Do not associate by latest-event timing.
9. Test late Game.log association from an existing OCR-only record. Confirm consolidation, check one canonical ledger entry and intact previous run snapshots/evidence. Test two identical-looking separately accepted contracts; confirm separation explicitly and never merge different MissionIds.
10. Test manual edit/completion/abandonment and run finalization for an OCR-only contract. Confirm potential reward never becomes earned money automatically. Restart and recheck all values.
11. Open contract evidence, enlarge screenshots, unlink one of several observations, and run expired cleanup. Active attached evidence must remain protected; missing/expired images must leave contract values and structured evidence accessible. Closed-image 30-day expiry is covered with controlled clocks in automated tests.
12. Only then enable experimental acceptance capture with a 3-second delay/3 attempts. It must create observations for review, never save a contract or verify its trigger MissionId. Test unrelated/Options/minimized/black screens, bounded retries, grouped failures and cancellation when monitoring stops. Turn the experiment off if unreliable.

## Current verification and limits

On Windows for Task 03B: TypeScript, lint, **183 tests**, native build and production build pass. Existing application and Game.log desktop workflows, the new OCR contract desktop workflow, saved OCR/shortcut recorder, and separate-process window-surface capture passed. The new integration workflow uses actual saved OCR text and a synthetic preview PNG because the corresponding original screenshot is no longer present.

Both `tests/ocr-desktop.cjs` and `tests/automatic-desktop.cjs` were attempted but stopped at their compiled WinForms fixture launch with `spawn UNKNOWN`. Their full native capture/shortcut/OCR paths could not be reverified in this run. No security configuration was changed. Unit tests cover serial routing/retries/shared methods and automatic-capture behavior.

The window-surface test returned actual 3840×2084 pixels and excluded an overlap; it uses synthetic window identity, not a real StarCitizen.exe session. No actual Star Citizen gameplay, Vulkan/exclusive fullscreen, physical in-game shortcut delivery, real mission reconciliation, or subjective sound audibility was verified.

Fixture provenance: five `tests/fixtures/mobiglas/*.json` files retain actual OCR text/boxes/confidence from earlier saved 3840×2160 images. A is a clearly labelled representative reconstruction. B's genuine export has 25 SCU. C is a new spatial reconstruction of the user's reported content; it is not claimed as original screenshot OCR. Earlier synthetic and representative 18-SCU variants remain separate regressions.

No continuous scanning, automatic saving, game navigation/input, memory access, injection, anti-cheat bypass, cloud OCR, external APIs, authentication or routing calculations were introduced. See [Cargo-Run-Handoff.md](Cargo-Run-Handoff.md) for file inventory, migration and verification details.
