const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/cargo-progress-desktop-")),
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
      .getByRole("navigation", { name: "Temporary navigation" })
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
async function row(id, kind) {
  const section = page
    .locator(".manifest-section")
    .filter({ has: page.getByRole("heading", { name: kind, exact: true }) });
  return section.locator('[data-objective-id="' + id + '"]');
}
async function record(control, action, quantity) {
  await control.locator("summary").click();
  await control.getByLabel("Action", { exact: true }).selectOption(action);
  await control
    .getByLabel("Quantity (SCU)", { exact: true })
    .fill(String(quantity));
  await control
    .getByRole("button", { name: "Record progress", exact: true })
    .click();
}
(async () => {
  try {
    await launch();
    await page.evaluate(async () => {
      await window.cargoRun.selectShip("c2");
      for (const name of ["Primary Quartz", "Separate Quartz"])
        await window.cargoRun.saveContract({
          draft: {
            name,
            payout: 10000,
            objectives: [
              {
                commodity: "Quartz",
                pickupLocation: "Everus Harbor",
                destination: "Area18",
                quantitySCU: 9,
              },
            ],
          },
        });
    });
    const s = await state(),
      id = s.contracts[0].cargoObjectives[0].id,
      other = s.contracts[1].cargoObjectives[0].id;
    await nav("Manifest");
    let control = await row(id, "Collection");
    assert.match(await control.innerText(), /Load not confirmed/);
    await record(control, "Load", 3);
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].loadedSCU === 3,
    );
    assert.equal((await state()).contracts[1].cargoObjectives[0].loadedSCU, 0);
    await control
      .getByRole("button", { name: "Load remainder", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].loadedSCU === 9,
    );
    const delivery = await row(id, "Delivery");
    await record(delivery, "Deliver", 4);
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].deliveredSCU === 4,
    );
    assert.equal((await state()).contracts[0].cargoObjectives[0].loadedSCU, 5);
    await until(
      async () =>
        (await delivery
          .getByRole("button", { name: "Undo last cargo change", exact: true })
          .count()) === 1,
    );
    await delivery
      .getByRole("button", { name: "Undo last cargo change", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].deliveredSCU === 0,
    );
    // Correct then deliver on the same persistent objective.
    await control
      .getByLabel("Action", { exact: true })
      .selectOption("SetLoaded");
    await control.getByLabel("Quantity (SCU)", { exact: true }).fill("8");
    await control
      .getByRole("button", { name: "Record progress", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].loadedSCU === 8,
    );
    await delivery
      .getByLabel("Action", { exact: true })
      .selectOption("Deliver");
    await delivery.getByLabel("Quantity (SCU)", { exact: true }).fill("4");
    await delivery
      .getByRole("button", { name: "Record progress", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].loadedSCU === 4,
    );
    await page.screenshot({
      path: "work/cargo-manifest-v060.png",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Select ship", exact: true })
      .click();
    await page.getByLabel("Search ships", { exact: true }).fill("Hull C");
    await page
      .getByRole("button", { name: "Select Hull C", exact: true })
      .click();
    const switchDialog = page.getByRole("dialog", {
      name: "Keep cargo on its current ship?",
    });
    await switchDialog.waitFor();
    assert.equal((await state()).selectedShipId, "c2");
    await switchDialog
      .getByRole("button", {
        name: "Switch without transferring cargo",
        exact: true,
      })
      .click();
    await until(async () => (await state()).selectedShipId === "hull-c");
    assert.equal(
      (await state()).contracts[0].cargoObjectives[0].loadedShipId,
      "c2",
    );
    await nav("Dashboard");
    const onboard = page
      .locator(".stat-card")
      .filter({ hasText: "Recorded Onboard" });
    assert.match(await onboard.innerText(), /0.*4,608/s);
    await page.screenshot({
      path: "work/cargo-dashboard-v060.png",
      animations: "disabled",
    });
    await nav("Manifest");
    assert.match(
      await page
        .getByRole("heading", { name: "Retained onboard inventory" })
        .locator("..")
        .innerText(),
      /C2 Hercules/,
    );
    await page.evaluate(() => window.cargoRun.selectShip("c2"));
    await page.evaluate(async () => {
      const s = await window.cargoRun.getState();
      await window.cargoRun.abandonContract(s.contracts[0].id);
      await window.cargoRun.finishRun();
    });
    assert.equal((await state()).contracts[0].cargoObjectives[0].loadedSCU, 4);
    const retained = page
      .locator(".retained-cargo")
      .filter({ hasText: "Primary Quartz" });
    await retained.waitFor();
    assert.match(await retained.innerText(), /Abandoned/);
    await retained.locator("summary").click();
    await retained.getByLabel("Action", { exact: true }).selectOption("Unload");
    await retained.getByLabel("Quantity (SCU)", { exact: true }).fill("4");
    await retained
      .getByRole("button", { name: "Record progress", exact: true })
      .click();
    await until(
      async () =>
        (await state()).contracts[0].cargoObjectives[0].loadedSCU === 0,
    );
    await nav("Contracts");
    await page
      .getByRole("button", { name: "Details for Separate Quartz", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Cargo Activity", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await nav("History");
    // Verify audit and all cargo quantities survive app restart.
    const before = await state(),
      activity = await page.evaluate(
        (id) => window.cargoRun.cargoActivity(id),
        s.contracts[0].id,
      );
    assert(activity.length >= 6);
    assert(activity.every((a) => a.source === "Manual"));
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(
      (await state()).contracts,
      JSON.parse(JSON.stringify(before.contracts)),
    );
    assert.equal((await state()).runs.length, 1);
    assert.equal((await state()).contracts[1].cargoObjectives[0].id, other);
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 6);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.6.0 Windows isolated profile: objective-specific partial/full loading, partial delivery and undo, corrected totals, separate identical allocations, ship switch confirmation/no transfer, selected onboard total, abandoned onboard visibility/unload, run preservation, activity history, restart persistence and foreign-key integrity.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/cargo-progress-failure.png",
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
