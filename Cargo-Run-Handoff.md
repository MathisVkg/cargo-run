# Cargo Run v0.3.3 — Task 03A.3 handoff

Implemented in C:\Users\zeyros\Documents\repository\cargo-run. Existing v0.3.2 functionality and Fleet Operations styling are preserved. Source backups for this task are in ignored work/task03a3-backup. No commit, PR, installer or game modification was created.

## 1. Delivered behavior and defaults

- Two capture backends: verified Star Citizen window surface through Electron desktopCapturer, and the existing native full-display helper.
- Source modes: Automatic/prefer window, Window-only, Full Display. Full Display remains the default; display fallback requires explicit permission and Automatic mode.
- Experimental acceptance capture defaults OFF; delay 3 seconds; maximum 3 total attempts; independent Window-only preference.
- Repeat guard for Electron callbacks: one initial capture, then a required one-second callback-free interval before rearming. No key-up claim is made.
- Cleanup defaults ON, retaining unlinked evidence for 7 days; configurable 1/7/14/30 days.
- Extended Scan Review metadata and preserved Reprocess Saved OCR.
- No OCR-to-contract creation, merging, reconciliation or verified MissionId association. Existing Game.log contract creation remains unchanged.

## 2. Files created and modified

New application modules:

- electron/main/ocr/windowCapture.ts — window selection/quality checks, explicit fallback and saved pixels.
- electron/main/ocr/automatic.ts — bounded persistent acceptance scheduler and retry/cancellation lifecycle.
- electron/main/ocr/retention.ts — owned-file usage, expiration and safe cleanup.
- src/types/capturePolicy.ts — policy, trigger, request and storage types plus runtime validation.
- src/pages/Settings/CapturePolicyControls.tsx — source, automatic workflow and retention controls.

Updated application files:

- resources/native/CaptureHost.cs — fixed read-only game-windows operation returning eligible HWND/PID/physical bounds/foreground state for StarCitizen.exe.
- electron/main/ocr/{nativeHost,integration,queue,repository}.ts — backend composition, serial image queue, validation, image fingerprints, metadata, lifecycle and repeat guard.
- electron/main/storage/database.ts — schema 3 automatic_captures table; existing payloads preserved.
- electron/main/trackingService.ts and electron/main/index.ts — post-commit live acceptance callback, monitoring lifecycle and trusted policy/cleanup IPC.
- electron/preload/index.ts, src/types/{desktop,ocr,shortcut}.ts, src/stores/useOcrStore.ts — typed fixed actions/snapshots.
- Settings/OcrSettings, ShortcutControls, ScanReview, global styles — controls, truthful diagnostics and candidate metadata.
- package.json/lockfile, app/navigation/settings version and native manifest — v0.3.3; no new dependencies.

New tests:

- tests/window-capture.test.ts, automatic-capture.test.ts, capture-retention.test.ts.
- tests/window-desktop.cjs and tests/native/{WindowCaptureHarness,WindowSurfaceFixture}.cjs.
- tests/automatic-desktop.cjs.

Extended existing queue, tracking and desktop bridge assertions. README and this handoff document current behavior and limits. Test profiles, native binaries, screenshots and architectural reference downloads remain ignored.

## 3. Capture backend architecture

The existing helper still captures physical displays using GDI. Window discovery uses public limited process queries and visible, non-minimized top-level windows at least 640×360. It verifies the executable basename StarCitizen.exe; launcher/helper titles alone cannot qualify.

The window backend selects a unique foreground eligible game window, otherwise requires one eligible window. It matches the HWND to an external-process Electron source ID, excludes Cargo Run's own process, and rechecks HWND/PID/process after enumeration. Multiple ambiguous surfaces fail rather than guessing the largest title match.

Window thumbnails are requested at the physical target bounds. The returned pixels are inspected: empty, black/blank, below minimum size or below 85% of expected dimensions are rejected. No low-resolution image is upscaled. Metadata records actual saved width/height. Source enumeration has a 10-second timeout; a still-pending query is not stacked with another window query. Shutdown cannot restart the native helper through a delayed capture operation.

Window-only never falls back. Automatic can fall back only when the user enabled full-display fallback. The selected display remains explicit, and failures retain both window and display reasons if necessary. Used/attempted backend, fallback flag/reason, dimensions and last saved source are visible/persisted.

Desktop verification returned 3840×2084 from a window on the primary 3840×2160 display. A visible magenta overlap was excluded from the saved target surface. The test uses a real separate-process window source with injected synthetic identity metadata only; it does not establish production StarCitizen.exe discovery or Vulkan compatibility.

SuperCargo's capture.ts, OCR orchestration and main trigger flow were reviewed for architectural understanding. No code, assets or interface were copied. Unlike silent source substitution or title-only selection, this implementation uses verified metadata and explicit fallback.

## 4. Automatic capture behavior

A capture observer runs only after the existing ledger/checkpoint transaction commits. It receives only first committed Live acceptance events while monitoring is running. A conservative title check requires cargo/haul/hauling/freight; unsupported names are ignored rather than guessed. Imports and duplicate MissionId notifications do not produce fresh requests. Observer failures cannot roll back contracts or stop monitoring.

The scheduler stores request state in its own table: Pending, Running, Completed, Failed, Skipped or Expired. Limits are 20 pending/running, one in flight, 100 terminal-history rows and a two-minute deadline. Delay is 1–10 seconds; maximum total attempts is 1–5. The existing capture tail serializes actual screenshot work with manual/shortcut requests; the OCR worker remains serial and offline.

Each attempt creates an independent CaptureId with candidate trigger metadata: MissionId, log event time, configured delay, attempt and explicit Unverified association. Queue request, capture-start and save timestamps are separate. A scheduled capture may run later than its nominal delay.

OCR must find a plausible title region plus Primary Objectives/delivery rows before an automatic image is usable. Options/home/unrelated screens are rejected; their images are removed while bounded diagnostics remain. A recognizable different title is retained as ReviewUnassociated. Even a matching title never verifies identity or links a mission. Raw OCR/evidence remain available for valid observations, and Reprocess changes only structured extraction.

An unchanged normalized image fingerprint suppresses duplicate automatic evidence. Changed screenshots with identical OCR fields remain separate: a text match is not proof of mission identity. Duplicate requests stop retrying; capture failures/rejected screens retry within configured attempts/deadline. No retained screenshot is automatically assigned to several missions.

Stopping/replacing the monitored log, errors, disabling/changing automatic configuration or shutdown cancel pending work. Graceful shutdown records cancellation; startup expires interrupted pending/running requests instead of replaying screenshots against a later screen. Already saved OCR work can recover independently. Manual deletion/clear does not cause an automatic observation to resurrect.

## 5. Shortcut-repeat solution

Electron globalShortcut exposes callbacks without key-up events. Cargo Run uses a trailing one-second quiet-period guard: every repeat extends the latch, and only the first callback invokes capture. Actual callback totals remain truthful; repeats are coalesced into a RepeatSuppressed diagnostic after the burst, with the existing 50-event bound.

This is a cooldown fallback, not a physical pressed/released state machine. Quick separate presses within the interval can be ignored. An unusually long OS initial-repeat delay can permit an extra capture. Hardware held-key behavior and Star Citizen-focused delivery were not verified in this task.

The recorder and configurable standalone function keys remain. Changing the binding rearms the guard. The optional Raw Input backend/comparison mode is preserved and remains experimental/off by default; its prior physical-key failure was not repaired or claimed resolved. No hooks, input interception or arbitrary key logging were introduced.

## 6. Retention implementation

Unlinked evidence expires after 7 days by default, with 1/7/14/30-day controls. Automatic cleanup runs at startup and hourly; disabling it suppresses those cleanup passes. Manual expired cleanup still works. Settings reports owned-file bytes, capture count, last cleanup result and bounded errors; Clear Captures remains available.

Captured/Processing records and active-request evidence are protected. Expired PNGs, thumbnails, temporary files and capture metadata are removed on a best-effort basis. Missing files are harmless. A partial file-deletion failure retains metadata so later cleanup can retry. Old orphan files in the owned UUID namespace use file modification age and the same unlinked policy. Unrelated filenames, filesystem links/non-files and paths outside the owned captures directory are not deleted.

A future-only evidenceLink model protects active linked evidence and expires closed evidence 30 days after completion/abandonment. No operation in this version creates an association or infers one from candidate trigger metadata. Contracts, mission events, runs and History are unaffected by cleanup or manual screenshot deletion.

Schema 3 adds only automatic_captures. Existing capture JSON/image references stay readable with optional new metadata; tests cover v1/v2 migration preservation. Policy is separate from the existing shortcut/display settings.

## 7. Automated verification

- npm run typecheck: passed.
- npm run lint: passed.
- npm test: 138 passed across 13 files, including every existing real/synthetic OCR parsing regression.
- npm run build: passed, including Windows helper compilation and main/preload/renderer.
- Dependency audit: zero vulnerabilities; no new dependencies.

Coverage includes correct/incorrect/ambiguous/missing window sources, self-exclusion, blank/black/reduced images, actual resolution, explicit fallback and double failure, stalled source queries, shutdown, delays, bounded retries/overflow, duplicates, stale/recovered requests, stopped monitoring, invalid/unrelated screens, independent changed observations, callback bursts, policy validation, retention enable/disable/startup/hourly behavior, protected/missing/locked/orphan evidence, usage and migration preservation. Log tests verify the observer runs after commit and cannot roll back existing contract creation.

## 8. Windows desktop verification

Passed:

- Existing manual-contract/security/navigation/manifest/history/window-control suite.
- Existing SQLite/Game.log suite, including repeated restarts, duplicates, rotation/recovery and run snapshots.
- Actual separate-process Electron window-source test: 3840×2084 pixels, visible overlap excluded, actual dimensions recorded, no upscaling or display fallback. Identity metadata is injected for this normal-app test only.
- End-to-end synthetic Live Game.log acceptance → committed ledger → delayed native display capture → offline OCR. A duplicate notification did not duplicate requests; three distinct requests serialized, one unrelated-title observation was retained unassociated, two unchanged images were skipped, stop cancelled pending work, and expired cleanup removed evidence without changing four log-created contracts. Capture source/fallback settings and the Settings selector were verified after an actual application restart.
- Saved real OCR Reprocess/preview and recorder Save/Escape workflow in an isolated profile, with zero OCR-created contracts.

The standalone all-in-one shortcut/OCR desktop harness failed to launch its compiled WinForms fixture (spawn UNKNOWN). Windows Code Integrity event 3077 identified that specific test executable as blocked. No security controls were changed or bypassed. The automatic desktop test independently exercised the same native full-display capture/OCR path using its isolated synthetic fixture.

No actual Star Citizen window/gameplay/Vulkan capture or in-game automatic recognition was performed. The actual game-focused shortcut issue remains unresolved. Installer signing/packaging and subjective sound audibility remain unverified.

## 9. Exact real Star Citizen test

1. Keep acceptance capture off. In Settings select Full Display and the game monitor. Capture visible Mobiglas contract details manually; inspect screenshot, resolution and OCR.
2. Select Star Citizen Window, keep the game in borderless mode and capture with Cargo Run unfocused. Verify the game render surface, correct actual dimensions, no black frame and no overlapping Cargo Run UI. A failure must remain visible.
3. Test Automatic with fallback disabled. Then explicitly enable fallback if desired and confirm used backend, dimensions and window-failure reason. Window-only must never substitute a display.
4. Test the chosen shortcut in a normal app first, then in the game. Hold several seconds, release, wait over a second and press again. Inspect callbacks versus CaptureRequested/Saved and RepeatSuppressed; do not call the quiet-period fallback reliable physical key-up handling.
5. Start live monitoring. Enable acceptance capture with delay 3, attempts 3 and Window source. Accept one new hauling mission, keep the desired details visible, wait for OCR and inspect request/capture metadata. Candidate MissionId must remain Unverified.
6. Accept another mission and switch the visible details before capture. Confirm that differing content is retained for manual review without association or OCR contract changes. Test several rapid acceptances, duplicate notifications and an unchanged screen.
7. Test Options/home/unrelated screens, minimized/unavailable windows, black frames and explicit fallback failure. Check bounded attempts/expiry. Stop monitoring during a pending delay and verify cancellation.
8. Restart during pending work and verify it is cancelled/expired rather than replayed. Check settings and existing captures after migration. Review storage/expiry controls and cleanup; contract/run/history rows must remain unchanged.
9. Turn the experiment off when finished. Use Electron/manual full-display capture if window capture or input delivery is unreliable. Do not weaken Windows or anti-cheat protections to force a test.

## 10. Phase 3B boundary

The app now has reliable trigger provenance, source/fallback/resolution/validation metadata and a prepared retention model. These are observations and candidate triggers only. Verified associations, OCR-to-contract persistence, automatic merging, mission identity inference and reconciliation remain unimplemented. No timed continuous scanning, game navigation, keyboard/mouse automation, memory access, injection, anti-cheat bypass or cloud OCR was added.
