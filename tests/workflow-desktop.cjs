const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/workflow-desktop-")),
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

const { randomUUID } = require("node:crypto"),
  captureId = randomUUID(),
  mission = randomUUID(),
  log = path.join(folder, "Game.log");
const note = (text) =>
  "<" +
  new Date().toISOString() +
  '> Added notification "' +
  text +
  '" MissionId: [' +
  mission +
  "], ObjectiveId: []\n";
const ocr = () => page.evaluate(() => window.cargoRun.ocrState());
async function physical(id, action, quantity) {
  await page.evaluate(
    async ({ id, action, quantity }) => {
      const s = await window.cargoRun.getState(),
        o = s.contracts
          .flatMap((c) => c.cargoObjectives)
          .find((o) => o.id === id);
      await window.cargoRun.cargoProgress({
        requestId: crypto.randomUUID(),
        shipId: s.selectedShipId,
        changes: [
          {
            objectiveId: id,
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
    { id, action, quantity },
  );
}
(async () => {
  try {
    await launch();
    await app.close();
    app = null;
    const r = JSON.parse(
      fs.readFileSync(
        "tests/fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
        "utf8",
      ),
    ).result;
    fs.writeFileSync(
      log,
      note("Contract Accepted: Rookie Rank - Direct Small Cargo Haul") +
        note(
          "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
        ),
    );
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
      captureId,
      JSON.stringify({
        id: captureId,
        capturedAt: new Date().toISOString(),
        source: "Manual",
        status: "Processed",
        displayId: "fixture",
        displayLabel: "OCR workflow fixture",
        screenshot: null,
        width: r.width,
        height: r.height,
        bytes: 0,
        attempts: 1,
        error: null,
        result: r,
        observation: null,
      }),
    );
    db.close();
    await launch();
    assert.equal((await state()).workflow.automaticCompletion, false);
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, log);
    await page.evaluate(async (id) => {
      await window.cargoRun.chooseLog();
      await window.cargoRun.importHistory();
      await window.cargoRun.ocrReparse(id);
      await window.cargoRun.startMonitoring();
    }, captureId);
    let s = await state(),
      first = s.contracts[0],
      o = first.cargoObjectives[0];
    assert.equal(first.missionId, mission);
    assert.equal(first.status, "Active");
    const section = (kind) =>
      page.locator(".stop-section").filter({
        has: page.getByRole("heading", { name: kind, exact: true }),
      });
    await section("Pickup Stops")
      .getByLabel("Mark pickup done for " + o.id, { exact: true })
      .click();
    await section("Delivery Stops")
      .getByLabel("Mark delivery done for " + o.id, { exact: true })
      .click();
    assert.equal((await state()).contracts[0].cargoObjectives[0].loadedSCU, 0);
    assert.equal(
      (await state()).contracts[0].cargoObjectives[0].deliveredSCU,
      0,
    );
    fs.appendFileSync(log, note("Contract Complete: " + first.name));
    await until(async () => (await state()).tracking.completed === 1);
    assert.equal((await state()).contracts[0].status, "Active");
    assert.equal((await state()).lifecycleIssues.length, 0);
    await page
      .getByRole("button", { name: "By Contract", exact: true })
      .click();
    let card = page.locator('[data-contract-id="' + first.id + '"]');
    assert((await card.innerText()).includes("1 / 1 deliveries marked done"));
    await card
      .getByRole("button", {
        name: "Complete contract " + first.name,
        exact: true,
      })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Complete contract?",
      exact: true,
    });
    await dialog.waitFor();
    await page.mouse.click(3, 350);
    assert(await dialog.isVisible());
    assert.match(await dialog.innerText(), /No payout is confirmed/);
    await dialog
      .getByRole("button", { name: "Confirm completion", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal((await state()).contracts[0].status, "Completed");
    assert.equal((await state()).contracts[0].confirmedEarnings, 0);
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i++)
        await window.cargoRun.saveContract({
          draft: {
            name: "Shared " + i,
            payout: 1000,
            objectives: [
              {
                commodity: "Quartz",
                pickupLocation: "Port Tressler",
                destination: "NB Int. Spaceport",
                quantitySCU: 9,
              },
              ...(i === 2
                ? [
                    {
                      commodity: "Tin",
                      pickupLocation: "Port Tressler",
                      destination: "Other Outpost",
                      quantitySCU: 3,
                    },
                  ]
                : []),
            ],
          },
        });
    });
    await page
      .getByRole("button", { name: "By Location", exact: true })
      .click();
    const pickup = section("Pickup Stops");
    assert.equal(await pickup.locator(".stop-card").count(), 1);
    assert.match(await pickup.innerText(), /3 associated contracts/);
    assert.equal(await pickup.locator("tbody tr").count(), 4);
    s = await state();
    let shared = s.contracts.filter((c) => c.status === "Active"),
      target = shared[0].cargoObjectives[0];
    await pickup
      .getByLabel("Mark pickup done for " + target.id, { exact: true })
      .click();
    assert.equal(
      (await state()).contracts
        .filter((c) => c.status === "Active")
        .flatMap((c) => c.cargoObjectives)
        .filter((o) => o.checklist?.pickedUp).length,
      1,
    );
    await pickup
      .getByRole("button", { name: "Mark all picked up", exact: true })
      .click();
    await until(async () =>
      (await state()).contracts
        .filter((c) => c.status === "Active")
        .every((c) => c.cargoObjectives.every((o) => o.checklist?.pickedUp)),
    );
    assert(
      !/awaiting pickup|Objective allocations/.test(await pickup.innerText()),
    );
    await page.screenshot({
      path: "work/workflow-locations-v070.png",
      animations: "disabled",
    });
    await physical(target.id, "Load", 5);
    await page
      .getByRole("button", { name: "By Contract", exact: true })
      .click();
    await page
      .locator('[data-contract-id="' + shared[0].id + '"]')
      .getByRole("button", { name: "Complete contract Shared 0", exact: true })
      .click();
    await dialog
      .getByText(/Some checklist entries are still pending/)
      .waitFor();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .locator('[data-contract-id="' + shared[0].id + '"]')
      .getByRole("button", { name: "Complete contract Shared 0", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Confirm completion", exact: true })
      .click();
    assert.equal(
      (await state()).contracts.find((c) => c.id === shared[0].id)
        .cargoObjectives[0].loadedSCU,
      5,
    );
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    const finishDialog = page.getByRole("dialog", {
      name: "Finish current run?",
      exact: true,
    });
    assert.match(await finishDialog.innerText(), /2 active contracts/);
    assert.match(await finishDialog.innerText(), /5 SCU recorded onboard/);
    await finishDialog
      .getByRole("button", { name: "Finish run only", exact: true })
      .click();
    await finishDialog.waitFor({ state: "hidden" });
    assert.equal(
      (await state()).contracts.filter((c) => c.status === "Active").length,
      2,
    );
    await nav("Dashboard");
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    await finishDialog.getByLabel(/Shared 2/).check();
    await finishDialog
      .getByRole("button", {
        name: "Complete selected and finish",
        exact: true,
      })
      .click();
    await finishDialog.waitFor({ state: "hidden" });
    s = await state();
    assert.equal(
      s.contracts.find((c) => c.name === "Shared 2").status,
      "Completed",
    );
    assert.equal(
      s.contracts.find((c) => c.name === "Shared 1").status,
      "Active",
    );
    assert(s.contracts.every((c) => c.confirmedEarnings === 0));
    await nav("Manifest");
    assert.equal(await page.locator(".retained-cargo").count(), 1);
    assert.match(await page.locator(".retained-cargo").innerText(), /5 SCU/);
    await nav("Settings");
    const beta = page.getByLabel("Automatic contract completion (Beta)", {
      exact: true,
    });
    assert.equal(await beta.isChecked(), false);
    const capturePolicy = await ocr();
    await beta.check();
    await until(async () => (await state()).workflow.automaticCompletion);
    assert.deepEqual((await ocr()).policy, capturePolicy.policy);
    await beta.uncheck();
    await until(async () => !(await state()).workflow.automaticCompletion);
    await nav("Dashboard");
    for (const [w, h] of [
      [1100, 700],
      [1440, 900],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, [w, h]) =>
          BrowserWindow.getAllWindows()[0].setSize(w, h),
        [w, h],
      );
      await page.screenshot({
        path: "work/workflow-" + w + "-v070.png",
        animations: "disabled",
      });
      assert(
        await page.locator("body").evaluate((e) => e.scrollWidth <= innerWidth),
      );
    }
    const before = JSON.parse(JSON.stringify((await state()).contracts));
    await app.close();
    app = null;
    await launch();
    assert.deepEqual((await state()).contracts, before);
    assert.equal((await state()).workflow.automaticCompletion, false);
    const check = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.equal(check.prepare("PRAGMA user_version").get().user_version, 9);
    assert.deepEqual(check.prepare("PRAGMA foreign_key_check").all(), []);
    check.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.7.0 manual-first Windows workflow: OCR import + known MissionId; checklist/physical independence; completion event retained with Beta Off; explicit manual closure/warning/cargo protection; shared-location IDs and bulk pickup; run-only vs selected completion; independent beta/capture settings; responsive views and restart/FK.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/workflow-failure-v070.png",
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
