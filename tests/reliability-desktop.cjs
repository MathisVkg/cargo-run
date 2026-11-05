const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/reliability-desktop-")),
  env = { ...process.env, NODE_ENV: "test", CARGO_RUN_TEST_USER_DATA: folder };
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
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 900),
  );
  await page
    .getByRole("heading", { name: "Cargo Operations", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
}
const state = () => page.evaluate(() => window.cargoRun.getState());
async function nav(name) {
  const n = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  if (await n.isVisible())
    await n.getByRole("button", { name, exact: true }).click();
  else {
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
  }
}
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Cargo state timeout");
}

const { randomUUID } = require("node:crypto");
const captureId = randomUUID();
const result = JSON.parse(
  fs.readFileSync("tests/fixtures/mobiglas/agricultural-15-real.json", "utf8"),
).result;
async function progress(action, quantity) {
  await page.evaluate(
    async ({ action, quantity }) => {
      const s = await window.cargoRun.getState(),
        o = s.contracts[0].cargoObjectives[0];
      await window.cargoRun.cargoProgress({
        requestId: crypto.randomUUID(),
        shipId: s.selectedShipId,
        changes: [
          {
            objectiveId: o.id,
            action,
            quantity,
            expected: JSON.stringify({
              required: o.quantitySCU,
              loaded: o.loadedSCU ?? 0,
              delivered: o.deliveredSCU,
              shipId: o.loadedShipId ?? null,
              evidence: o.loadEvidence ?? "Unknown",
            }),
          },
        ],
      });
    },
    { action, quantity },
  );
}
(async () => {
  try {
    await launch();
    await app.close();
    app = null;
    let db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
      captureId,
      JSON.stringify({
        id: captureId,
        capturedAt: "2026-11-05T19:50:00Z",
        source: "Manual",
        status: "Processed",
        displayId: "fixture",
        displayLabel: "Sanitized real 15-SCU OCR",
        screenshot: null,
        width: 3840,
        height: 2160,
        bytes: 0,
        attempts: 1,
        error: null,
        result,
        observation: null,
      }),
    );
    db.close();
    await launch();
    await page.evaluate((id) => window.cargoRun.ocrReparse(id), captureId);
    assert.equal(
      (await state()).contracts[0].cargoObjectives[0].quantitySCU,
      15,
    );
    await progress("Load", 9);
    await progress("Deliver", 2);
    const c = (await state()).contracts[0],
      objectiveId = c.cargoObjectives[0].id,
      ship = c.cargoObjectives[0].loadedShipId;
    await app.close();
    app = null;
    // Simulate a legacy OCR extraction defect exclusively in this owned profile.
    db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    const objective = JSON.parse(
      db
        .prepare("SELECT payload FROM cargo_objectives WHERE id=?")
        .get(objectiveId).payload,
    );
    objective.quantitySCU = 715;
    db.prepare("UPDATE cargo_objectives SET payload=? WHERE id=?").run(
      JSON.stringify(objective),
      objectiveId,
    );
    const capture = JSON.parse(
      db.prepare("SELECT payload FROM ocr_captures WHERE id=?").get(captureId)
        .payload,
    );
    capture.observation.objectives[0].requiredSCU.value = 715;
    capture.observation.parserVersion = "0.4.1";
    capture.importResult.processedHash = "legacy-quantity-fixture";
    db.prepare("UPDATE ocr_captures SET payload=? WHERE id=?").run(
      JSON.stringify(capture),
      captureId,
    );
    db.close();
    await launch();
    assert.equal(
      (await state()).contracts[0].cargoObjectives[0].quantitySCU,
      715,
    );
    await nav("Scan History");
    await page
      .locator('[data-capture-id="' + captureId + '"]')
      .getByRole("button", { name: "Re-extract saved text", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].quantitySCU === 15,
    );
    const repaired = (await state()).contracts[0].cargoObjectives[0];
    assert.equal(repaired.id, objectiveId);
    assert.equal(repaired.loadedSCU, 7);
    assert.equal(repaired.deliveredSCU, 2);
    assert.equal(repaired.loadedShipId, ship);
    await page.evaluate((id) => window.cargoRun.completeContract(id), c.id);
    await nav("Settings");
    const management = page.locator(".local-data-management");
    await management.getByText(/1 closed contract.*7 SCU/).waitFor();
    assert.match(
      await management.innerText(),
      new RegExp((await state()).ships.find((s) => s.id === ship).name),
    );
    for (const label of [
      "Clear closed contract history",
      "Clear contract and run history",
    ]) {
      await management
        .getByRole("button", { name: label, exact: true })
        .click();
      await management
        .getByRole("alert")
        .filter({ hasText: /7 SCU onboard/ })
        .waitFor();
    }
    await management
      .getByRole("button", {
        name: "Reset all local tracking data",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Reset all local tracking data?" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Confirm reset", exact: true })
        .isEnabled(),
      false,
    );
    await page.keyboard.press("Escape");
    await management
      .getByRole("button", { name: "Open retained inventory", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Cargo Manifest", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator("#retained-inventory")
        .evaluate((e) => e === document.activeElement),
      true,
    );
    let retained = page.locator(".retained-cargo");
    assert.match(await retained.innerText(), /Completed/);
    assert.equal(
      await retained
        .getByRole("button", { name: "Deliver onboard", exact: true })
        .count(),
      0,
    );
    await page.evaluate(() => window.cargoRun.selectShip("hull-c"));
    await until(async () => (await state()).selectedShipId === "hull-c");
    assert.equal(
      await retained
        .getByRole("button", { name: "Unload cargo", exact: true })
        .isEnabled(),
      false,
    );
    await retained.locator("summary").click();
    assert.equal(
      await retained.getByLabel("Action", { exact: true }).isEnabled(),
      false,
    );
    assert.match(await retained.innerText(), /Select the ship holding/);
    await page.evaluate((id) => window.cargoRun.selectShip(id), ship);
    await until(async () => (await state()).selectedShipId === ship);
    assert.deepEqual(
      await retained
        .getByLabel("Action", { exact: true })
        .locator("option")
        .allTextContents(),
      ["Unload cargo", "Correct onboard quantity"],
    );
    await retained.getByLabel("Quantity (SCU)", { exact: true }).fill("2");
    await retained
      .getByRole("button", { name: "Record progress", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].loadedSCU === 5,
    );
    assert.equal(
      await retained
        .getByRole("button", { name: "Undo last cargo change", exact: true })
        .count(),
      0,
    );
    await retained
      .getByLabel("Action", { exact: true })
      .selectOption("SetLoaded");
    await retained.getByLabel("Quantity (SCU)", { exact: true }).fill("3");
    await retained
      .getByRole("button", { name: "Record progress", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].loadedSCU === 3,
    );
    await page.screenshot({
      path: "work/reliability-retained-v063.png",
      animations: "disabled",
    });
    await retained.getByLabel("Quantity (SCU)", { exact: true }).fill("0");
    await retained
      .getByRole("button", { name: "Record progress", exact: true })
      .click();
    await retained.waitFor({ state: "detached" });
    const closed = (await state()).contracts[0];
    assert.equal(closed.status, "Completed");
    assert.equal(closed.confirmedEarnings, 0);
    assert.equal(closed.cargoObjectives[0].deliveredSCU, 2);
    const activity = await page.evaluate(
      (id) => window.cargoRun.cargoActivity(id),
      c.id,
    );
    assert.deepEqual(
      activity.slice(0, 3).map((a) => a.action),
      ["SetLoaded", "SetLoaded", "Unload"],
    );
    await nav("Settings");
    await management
      .getByRole("button", {
        name: "Clear closed contract history",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Confirm local history cleanup",
      exact: true,
    });
    await dialog.waitFor();
    await dialog
      .getByRole("button", { name: "Confirm cleanup", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await until(async () => (await state()).contracts.length === 0);
    const stats = await page.evaluate(() => window.cargoRun.localDataStats());
    assert(
      stats.lastBackup.startsWith(path.join(folder, "backups") + path.sep),
    );
    const backup = new DatabaseSync(
      path.join(stats.lastBackup, "cargo-run.sqlite"),
      { readOnly: true },
    );
    assert.deepEqual(backup.prepare("PRAGMA foreign_key_check").all(), []);
    backup.close();
    await app.close();
    app = null;
    await launch();
    assert.equal((await state()).contracts.length, 0);
    db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.6.3 isolated Windows: real 15-SCU OCR extraction; legacy 715 repair with stable objective/cargo; closed-cargo actions, wrong ship disabled, partial unload/downward correction/zero removal; cleanup blocker counts/ships and direct focus navigation; guarded reset remains available; backed-up cleanup and restart/FK integrity.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/reliability-failure-v063.png",
          animations: "disabled",
        })
        .catch(() => {});
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
