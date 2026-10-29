// Real Electron Game.log monitoring, secondary pending projection and persisted manual ledger.
const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/tracking-secondary-")),
  file = path.join(folder, "Game.log"),
  profile = path.join(folder, "profile"),
  A = "a50caaaa-aa44-4c3c-9be5-ccff802e525b",
  B = "96db3a01-4210-419d-ad38-45795e26324d",
  C = "c50caaaa-aa44-4c3c-9be5-ccff802e525b";
const note = (text, id = A, obj) =>
  '<2026-10-29T08:00:00.000Z> <SHUDEvent_OnNotification> Added notification "' +
  text +
  ':" ... MissionId: [' +
  id +
  "]" +
  (obj ? ", ObjectiveId: [" + obj + "]" : "");
const original = note("Contract Accepted: Historical Quartz cargo") + "\n";
fs.writeFileSync(file, original);
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({
    args: [path.resolve("out/main/index.js")],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
}
const state = () => page.evaluate(() => window.cargoRun.getState());
async function until(check) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const s = await state();
    if (check(s)) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Tracking condition timed out");
}
async function nav(name) {
  await page.getByLabel("Open navigation", { exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
}
function pending(id) {
  const db = new DatabaseSync(path.join(profile, "cargo-run.sqlite"), {
    readOnly: true,
  });
  try {
    const row = db
      .prepare("SELECT payload FROM pending_log_missions WHERE mission_id=?")
      .get(id);
    return row ? JSON.parse(row.payload) : null;
  } finally {
    db.close();
  }
}
(async () => {
  try {
    await launch();
    await page.evaluate(() =>
      window.cargoRun.saveContract({
        draft: {
          name: "Persistent manual cargo",
          payout: 5000,
          objectives: [
            {
              commodity: "Titanium",
              pickupLocation: "Everus Harbor",
              destination: "Area18",
              quantitySCU: 10,
            },
          ],
        },
      }),
    );
    await page
      .getByLabel("Selected ship", { exact: true })
      .selectOption("hull-c");
    await until((s) => s.selectedShipId === "hull-c");
    await nav("Settings");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
    await page
      .getByRole("button", { name: "Select Game.log", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start monitoring", exact: true })
      .click();
    await until((s) => s.tracking.status === "ONLINE");
    assert.equal((await state()).tracking.accepted, 0);
    fs.appendFileSync(
      file,
      note("Contract Accepted: Live Quartz run", B) + "\n",
    );
    await until((s) => s.tracking.accepted === 1);
    assert.equal((await state()).contracts.length, 1);
    assert.equal((await state()).tracking.pendingMissions, 1);
    const objective = note(
      "New Objective: Deliver 2/20 SCU of Quartz to Orison",
      B,
      "live-objective",
    );
    fs.appendFileSync(file, objective.slice(0, 90));
    await new Promise((r) => setTimeout(r, 650));
    assert.equal((await state()).tracking.objectives, 0);
    await app.close();
    app = null;
    await launch();
    assert.equal((await state()).selectedShipId, "hull-c");
    fs.appendFileSync(file, objective.slice(90) + "\n" + objective + "\n");
    await until((s) => s.tracking.objectives === 1);
    assert.equal(pending(B).cargoObjectives.length, 1);
    assert.equal(pending(B).cargoObjectives[0].deliveredSCU, 2);
    fs.appendFileSync(
      file,
      note("Contract Complete: Live Quartz run", B) + "\n",
    );
    await until((s) => s.tracking.completed === 1);
    assert.equal(pending(B).status, "Completed");
    assert.equal((await state()).contracts.length, 1);
    await nav("Settings");
    for (let i = 0; i < 2; i++) {
      await page
        .getByRole("button", { name: "Import existing history", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm import", exact: true })
        .click();
      await until((s) => s.tracking.accepted === 2 && !s.tracking.importing);
    }
    assert.equal((await state()).contracts.length, 1);
    assert.ok(fs.readFileSync(file, "utf8").startsWith(original));
    fs.appendFileSync(
      file,
      'Added notification "Contract Accepted: malformed:" MissionId: [invalid]\n',
    );
    await until((s) => s.tracking.parsingErrors === 1);
    await page.locator(".advanced-panel > summary").click();
    await page.getByLabel("Show parsing failures only").check();
    await page.locator(".diagnostic-event summary").click();
    await page
      .getByText(/Added notification "Contract Accepted: malformed/)
      .waitFor();
    fs.renameSync(file, path.join(folder, "old.log"));
    await until((s) => s.tracking.status === "ERROR");
    fs.writeFileSync(file, note("Contract Accepted: Rotated cargo", C) + "\n");
    await until(
      (s) => s.tracking.status === "ONLINE" && s.tracking.accepted === 3,
    );
    await page
      .getByRole("button", { name: "Stop monitoring", exact: true })
      .click();
    await until((s) => s.tracking.status === "OFFLINE");
    await nav("Dashboard");
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm & finish run", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Contract History", exact: true })
      .waitFor();
    const before = JSON.parse(JSON.stringify(await state()));
    assert.equal(before.runs[0].contractSnapshots.length, 1);
    await app.close();
    app = null;
    await launch();
    const after = await state();
    assert.deepEqual(after.contracts, before.contracts);
    assert.deepEqual(after.runs, before.runs);
    assert.equal(after.tracking.status, "OFFLINE");
    assert.equal(pending(B).status, "Completed");
    assert.deepEqual(errors, []);
    console.log(
      "PASS Windows secondary Game.log: first start skips history; acceptance remains pending-only; partial objective survives restart; duplicate events/imports; completion retained before OCR; diagnostics; file error/rotation/recovery; stop/restart; manual ledger/ship/run history preserved. Native picker response stubbed; no real game session.",
    );
  } catch (e) {
    console.error(e);
    if (page)
      await page
        .screenshot({ path: "work/tracking-secondary-failure.png" })
        .catch(() => {});
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})();
