# Cargo Run v0.3.2 — Task 03A.1 / 03A.2 handoff

Implemented in C:\Users\zeyros\Documents\repository\cargo-run. This completes the unfinished Task 03A.1 documentation and adds the optional Task 03A.2 experiment. Existing uncommitted Task 03A.1 work was preserved; backups for edits made in this task are in ignored work/task03a2-backup. No commit or PR was created.

## Root causes and changes

Actual Mobiglas screenshots exposed parser assumptions that the previous representative fixture did not cover. The title is in a header left of the metadata and below the Reward row; the former "title must precede metadata" rule missed it or selected navigation. Reward and value are on the same row but separated by more than the old proximity threshold. Objective checkbox glyphs appear as <>, <$, ¢, &, © and related OCR symbols, preventing anchored Deliver/Collect recognition. These are now handled only in parser working text, with raw evidence preserved. Header/panel regions use normalized coordinates. Wrapped delivery and pickup entries, internal periods in NB Int. Spaceport, imperfect currency glyphs, interleaved pickups and clipped destinations are covered. Existing stacked-header and 18 SCU synthetic cases still pass.

The game-specific shortcut failure is still unproven. Electron registration is separated from actual delivery and subsequent capture success/errors. F8/default shortcut delivery was confirmed outside Cargo Run; Ctrl+Shift+S conflicted in that test session. Neither Vulkan nor a privilege mismatch was established as the game failure's cause. Read-only foreground/elevation diagnostics remain available without elevation or game-memory access.

## Files and boundaries

- electron/main/ocr/parser.ts: actual header layout, same-row metadata, glyph prefixes, pickup association and partial warnings; parser version 0.3.2.
- resources/native/RawInputHost.cs: isolated hidden message-only window; keyboard RegisterRawInputDevices / RIDEV_INPUTSINK / WM_INPUT. Configured-key/modifier state only, make/break/repeat/layout handling, no hooks/injection/suppression or arbitrary key output.
- electron/main/ocr/rawInput.ts and src/types/inputPrototype.ts: asynchronous native readiness/error handling, bounded fixed protocol, lifecycle cleanup and per-backend counts.
- electron/main/ocr/queue.ts and integration.ts: unpackaged opt-in environment gating, explicit capture-backend selection, comparison observers, single-trigger capture routing, pause both observers while recording.
- src/pages/Settings/ShortcutControls.tsx: keyboard recorder, truthful registration/listening/invocation states, visible prototype controls/status via launch mode, bounded diagnostics and public elevation context.
- Scan Review: Reprocess saved OCR (existing fixed IPC reparse action). Changes only structured observation; keeps raw result, image, CaptureId, attempts, timestamps and status.
- tests/fixtures/mobiglas/*.json and tests/ocr-mobiglas.test.ts: five real 4K screenshot-derived OCR exports, normalized-layout tests and explicitly reported-data variants.
- tests/raw-input.test.ts and extended ocr-queue tests: readiness, timeout, stale output, errors, observer counts, selected-backend-only capture and recorder suppression.
- tests/ocr-review-desktop.cjs: isolated real saved-OCR review, preview, reprocess, recorder and prototype error UI.
- scripts/build-raw-input.cjs / npm run native:raw-input: optional helper build only.
- electron-builder.yml: includes only the existing CaptureHost EXE and sound assets; RawInputHost is excluded. Packaged builds ignore prototype flags.
- package metadata/UI version is 0.3.2. No new dependencies were added.

SQLite schema remains version 2. Contract tables, Game.log processing, manual workflows, Dashboard/Manifest/History, and run finalization are unchanged. No OCR contract creation, reconciliation, deletion, scanning timer or game automation was added. Context isolation/sandbox, disabled renderer Node integration, CSP and sender validation are preserved. Native helper paths/arguments are main-process-owned and are not renderer-supplied.

## Genuine OCR results and provenance

The supplied captures folder contained five original screenshots; the saved OCR table was empty. Original files were read only. The existing offline provider was rerun on 3840×2160 images and contract/navigation line subsets were exported with original boxes/confidences and source image hashes. Full temporary OCR exports remain in ignored work; screenshots were not committed.

| Actual source image                      | Reward | Visible deliveries | Required SCU |
| ---------------------------------------- | -----: | -----------------: | -----------: |
| 9ccc7ea4-c6f6-49bc-8bfc-701980e610da.png | 65,250 |                  4 | 25 (7+6+7+5) |
| 3544f29a-9fd0-49da-b48f-fc619d2c7172.png | 50,250 |                  1 |           11 |
| 32f3f1ae-895c-4a8c-9e34-7f81d4425ac9.png | 48,500 |                  2 |           13 |
| 7ab80543-0dd6-4384-9a59-d91586033683.png | 48,500 |                  2 |           13 |
| c68b9c33-4995-4bdc-af68-e259fa1e048e.png | 48,500 |                  2 |           13 |

All five now yield correct visible title, company, reward, delivery quantities and Port Tressler pickups. The 65,250 image has Pressurized Ice and Processed Food to Rayari Cantwell/McGrath Research Outposts on Clio. The actual screenshot shows 25 SCU, not 18; the parser does not force a reported total over visible evidence.

The original 61,500 / 8 SCU image was absent. Reported title Rookie Rank - Extra Small Cargo Haul, Covalex Independent Contractors, reward 61,500, two Aluminum deliveries (5 and 3), Port Tressler, Greycat Stanton IV Production Complex-A and NB Int. Spaceport on microTech are covered by representative reported-data fixtures using real header/panel geometry. The 65,250 / 18 SCU variant is tested separately with edited quantities explicitly marked as such and confidence cleared for edited lines. The original synthetic four-objective / two-commodity / 18 SCU case remains. These are not misrepresented as original exports.

OCR errors such as S4DCO0S/S4DCO05 are kept as read, not silently "corrected." One destination ending "on" is marked Ambiguous with a clipping warning. Selected tab highlight color is unavailable from OCR text; both labels stay Ambiguous. All observations remain potentially incomplete due to scroll visibility.

## Executed verification

- npm run typecheck: passed.
- npm run lint: passed.
- npm test: 101 tests passed across 10 files.
- npm run native:raw-input: C# x64 prototype compilation passed.
- npm run build: passed including native capture helper, TypeScript, main/preload/renderer. Initial rebuild was file-locked until the user closed Cargo Run.
- Existing Windows manual-contract/security/navigation suite: passed.
- Existing Windows SQLite/Game.log streaming/restart suite: passed.
- Actual OS shortcut test using the computer-use skill and a separate synthetic Electron Windows process: Cargo Run remained minimized/unfocused. F8 and Ctrl+Shift+F9 each caused one delivered Electron callback, successful screenshot save and completed offline OCR. Ctrl+Shift+S initially could not register while another Cargo Run instance was open; no game-failure conclusion was drawn from it. After that instance closed, the retained WinForms capture/OCR harness passed for Ctrl+Shift+S, F8 and Ctrl+Shift+F9: three 3840×2160 queued images, offline OCR/evidence, four synthetic objectives, black-frame rejection, preview, restart persistence, disable/clear and zero contract creation.
- Saved real OCR UI test: passed. Structured Reprocess retained raw result and attempt count, screenshot preview loaded, F8 Save and Escape cancellation caused no captures, both Raw Input Error handling and final Listening readiness were observed without automatic backend switching, contract count remained zero.
- Dependency audit: zero vulnerabilities.

## Blocked / not performed

Earlier RawInputHost builds were blocked by Windows Code Integrity event 3077 (spawn UNKNOWN). Error handling was verified without weakening policy or attempting a bypass. The final build successfully registered RIDEV_INPUTSINK and reached Listening. In an actual foreground-app comparison using an automated F8 press, Electron counted 1 and RawInput counted 0. The user then confirmed physical F8 testing in the same separate test window: Electron's cumulative count rose to 8, RawInput stayed 0 and no capture occurred with RawInput selected. The observer did not become a fallback capture trigger. **Raw Input is unreliable in this tested setup; registration alone did not establish a working native shortcut.** The receive/match failure is not isolated further. Electron remains the production default; the prototype stays optional/off and is excluded from packaged builds. Native repeats/layout/non-consuming gameplay behavior has not been runtime-confirmed. The WinForms capture/OCR harness was initially blocked but passed on its final rerun; no Windows security setting was changed.

No actual Star Citizen-focused shortcut test was performed. The real screenshots supplied OCR evidence only. The physical-key normal-app test did not produce a Raw Input match, so this experiment must not be treated as a functional replacement. Raw Input compatibility with Star Citizen, its Vulkan path or anti-cheat cannot be inferred from implementation or normal-app Electron success. Installer packaging/signing and subjective sound audibility remain outside verified scope.

## Launch and in-game verification

Follow README's full test procedure. Quick launch:

```powershell
npm run native:raw-input
$env:CARGO_RUN_INPUT_PROTOTYPE = "1"
$env:CARGO_RUN_SHORTCUT_BACKEND = "electron"
$env:CARGO_RUN_SHORTCUT_COMPARE = "1"
npm run dev
```

Normal packaged/default startup continues to use Electron only. For a pure Raw Input trial, stop the development process, set backend to "raw-input" and comparison to "0", then relaunch. Raw Input Starting is not Listening, and Listening is not proof of delivery. Error means do not proceed as though registration succeeded. A blocked helper is a limitation to report; do not disable security controls.

Close other Cargo Run instances to avoid chord conflicts. Choose F8, reset diagnostics, release all keys and test one physical press/release in a normal app. If the selected backend's count stays at zero, stop that backend's trial and use Electron/manual capture. Only after normal-app delivery succeeds, reset and repeat with Star Citizen focused on a contract in the already-working borderless capture configuration. Return to inspect backend invocation counts followed by CaptureRequested/Saved/Error. Repeat separately for Electron and Raw Input. Raw Input only observes the chord; choose an unused gameplay binding because the game still receives it. A held target key should cause one invocation until release/repress. After layout/device changes, release all keys. AltGr is intentionally unsupported.

Optional comparison mode registers both observers but only the selected backend captures. Electron still reserves its chord in comparison mode, so assess Raw Input's non-consuming behavior in Raw Input-only mode. If one backend receives zero callbacks, report that exact condition alongside registration/listening state and foreground/elevation data. Do not call it a screenshot failure unless an Invocation was followed by CaptureError. Manual Capture now remains the practical fallback. End the experiment by stopping the app and removing the three prototype environment variables or selecting Electron again.

Use Scan Review → Reprocess saved OCR on actual retained results to inspect parser changes without another screenshot or OCR pass. No OCR observation is converted into a contract. Future Phase 3B remains unstarted.
