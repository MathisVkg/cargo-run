const { _electron } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const A = "a50caaaa-aa44-4c3c-9be5-ccff802e525b",
  B = "96db3a01-4210-419d-ad38-45795e26324d",
  C = "c50caaaa-aa44-4c3c-9be5-ccff802e525b",
  D = "d50caaaa-aa44-4c3c-9be5-ccff802e525b";
const note = (text, id = A, objective) =>
  '<2026-10-19T17:00:00.000Z> <SHUDEvent_OnNotification> Added notification "' +
  text +
  ':" ... MissionId: [' +
  id +
  "]" +
  (objective ? ", ObjectiveId: [" + objective + "]" : "");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/desktop-phase2-")),
  log = path.join(folder, "Game.log");
const historic =
  note("Contract Accepted: Historical Quartz cargo") +
  "\n" +
  note(
    "New Objective: Deliver 0/11 SCU of Quartz to NB Int Spaceport",
    A,
    "historical-obj",
  ) +
  "\n";
fs.writeFileSync(log, historic);
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: path.join(folder, "profile"),
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
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
}
async function nav(name) {
  await page.getByLabel("Open navigation", { exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
}
async function state() {
  return page.evaluate(() => window.cargoRun.getState());
}
// Avoid eval inside the renderer's CSP: poll state through the typed bridge on the test side.
async function until(test) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const s = await state();
    if (test(s)) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out waiting for expected persistent state");
}
async function run() {
  try {
    await launch();
    assert.equal((await state()).contracts.length, 0);
    await page
      .getByRole("button", { name: "Add Contract", exact: true })
      .click();
    await page
      .getByLabel("Contract name", { exact: true })
      .fill("Persistent manual cargo");
    await page.getByLabel("Payout (aUEC)", { exact: true }).fill("5000");
    await page
      .getByLabel("Pickup location", { exact: true })
      .fill("Everus Harbor");
    await page.getByLabel("Destination", { exact: true }).fill("Area18");
    await page.getByLabel("Commodity", { exact: true }).fill("Titanium");
    await page.getByLabel("Cargo quantity (SCU)", { exact: true }).fill("10");
    await page
      .getByRole("button", { name: "Save contract", exact: true })
      .click();
    await until((s) => s.contracts.length === 1);
    await page
      .getByLabel("Selected ship", { exact: true })
      .selectOption("hull-c");
    await until((s) => s.selectedShipId === "hull-c");
    await app.close();
    await launch();
    assert.equal((await state()).contracts[0].name, "Persistent manual cargo");
    assert.equal(
      await page.getByLabel("Selected ship", { exact: true }).inputValue(),
      "hull-c",
    );
    await nav("Settings");
    // Stub only the native picker's returned selection, exercising the real select-file IPC and validation.
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, log);
    await page
      .getByRole("button", { name: "Select Game.log", exact: true })
      .click();
    await until((s) => s.tracking.path === log);
    await page
      .getByRole("button", { name: "Start monitoring", exact: true })
      .click();
    await until((s) => s.tracking.status === "ONLINE");
    assert.equal((await state()).contracts.length, 1);
    const liveAccepted = note('Contract Accepted: Live cargo: "Quartz" run', B);
    fs.appendFileSync(log, liveAccepted + "\n");
    await until((s) => s.contracts.some((c) => c.missionId === B));
    await nav("Dashboard");
    await page
      .getByRole("button", { name: /Unresolved Destination.*linked contract/ })
      .waitFor();
    assert.match(
      await page.locator(".stats-grid").innerText(),
      /Known payouts only/,
    );
    const liveObjective = note(
      "New Objective: Deliver 2/20 SCU of Quartz to Orison",
      B,
      "live-objective",
    );
    fs.appendFileSync(log, liveObjective.slice(0, 90));
    await new Promise((r) => setTimeout(r, 650));
    assert.equal(
      (await state()).contracts.find((c) => c.missionId === B).cargoObjectives
        .length,
      0,
    );
    fs.appendFileSync(
      log,
      liveObjective.slice(90) +
        "\n" +
        liveAccepted +
        "\n" +
        liveObjective +
        "\n",
    );
    await until(
      (s) =>
        s.contracts.find((c) => c.missionId === B)?.cargoObjectives.length ===
        1,
    );
    await page.getByRole("button", { name: /Orison.*linked contract/ }).click();
    await page
      .getByText("Required 20 · Delivered 2", { exact: true })
      .waitFor();
    assert.match(
      await page.locator(".destination-groups").innerText(),
      /Unknown/,
    );
    assert.equal((await state()).tracking.accepted, 1);
    const partial = note("Contract Accepted: UTF-8 resupply é", C);
    fs.appendFileSync(log, partial.slice(0, -2));
    await new Promise((r) => setTimeout(r, 650));
    await app.close();
    await launch();
    assert.equal((await state()).contracts.length, 2);
    fs.appendFileSync(log, partial.slice(-2) + "\n");
    await until((s) => s.contracts.some((c) => c.missionId === C));
    assert.equal((await state()).tracking.status, "ONLINE");
    fs.appendFileSync(
      log,
      note('Contract Complete: Live cargo: "Quartz" run', B) + "\n",
    );
    await until(
      (s) => s.contracts.find((c) => c.missionId === B)?.status === "Completed",
    );
    assert.equal((await state()).runs.length, 0);
    assert.equal(
      (await state()).contracts.find((c) => c.missionId === B)
        .confirmedEarnings,
      0,
    );
    await nav("History");
    await page.getByLabel("Search history", { exact: true }).fill("Live cargo");
    await page
      .getByLabel("Filter by status", { exact: true })
      .selectOption("Completed");
    await page.getByText('Live cargo: "Quartz" run', { exact: true }).waitFor();
    assert.match(await page.locator(".history-table").innerText(), /Unknown/);
    await nav("Settings");
    for (let i = 0; i < 2; i++) {
      await page
        .getByRole("button", { name: "Import existing history", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm import", exact: true })
        .click();
      await until((s) => s.tracking.accepted === 3 && !s.tracking.importing);
      await page
        .getByRole("button", { name: "Import existing history", exact: true })
        .waitFor({ state: "visible" });
    }
    assert.equal((await state()).contracts.length, 4);
    assert.equal((await state()).tracking.objectives, 2);
    fs.appendFileSync(
      log,
      'Added notification "Contract Accepted: malformed:" MissionId: [invalid]\n',
    );
    await until((s) => s.tracking.parsingErrors === 1);
    await page.getByLabel("Show parsing failures only").check();
    await page
      .getByText(
        "Recognized notification has no valid MissionId; no contract was changed.",
        { exact: true },
      )
      .waitFor();
    await page.locator(".diagnostic-event summary").click();
    await page
      .getByText(/Added notification "Contract Accepted: malformed/)
      .waitFor();
    await page.getByLabel("Show parsing failures only").uncheck();
    fs.renameSync(log, path.join(folder, "Game-old.log"));
    await until((s) => s.tracking.status === "ERROR");
    fs.writeFileSync(
      log,
      note("Contract Accepted: Rotated log mission", D) + "\n",
    );
    await until(
      (s) =>
        s.tracking.status === "ONLINE" &&
        s.contracts.some((c) => c.missionId === D),
    );
    await page.screenshot({
      path: "work/phase2-settings.png",
      animations: "disabled",
    });
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
    assert.equal((await state()).runs.length, 1);
    const before = await state();
    await app.close();
    await launch();
    const after = await state();
    assert.equal(after.contracts.length, before.contracts.length);
    assert.deepEqual(after.runs, before.runs);
    assert.equal(after.tracking.status, "OFFLINE");
    assert.equal(after.tracking.path, log);
    assert.equal(after.selectedShipId, "hull-c");
    assert.equal(after.tracking.accepted, 4);
    await page
      .getByRole("button", { name: /Unresolved Destination.*linked contract/ })
      .click();
    await page.locator(".page-content").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: "work/phase2-dashboard.png",
      animations: "disabled",
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Phase 2 Windows Electron: SQLite survives 3 restarts; manual contract and ship saved; live monitoring skips history; incomplete UTF-8 event resumes; mission/objective association; duplicates; automatic completion with zero earned payout; repeat imports idempotent; parser failure inspection; ERROR/recovery/rotation; stop configuration; run snapshots persist. Native picker response stubbed; actual game log not used.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: "work/phase2-desktop-failure.png" })
        .catch(() => {});
    throw e;
  } finally {
    if (app) await app.close().catch(() => {});
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
