// Real Windows Electron UI workflow, isolated profile. OCR text is an actual saved
// Mobiglas export; screenshot uses its original file when available, otherwise a labelled test PNG.
const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/ocr-contracts-desktop-"));
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: folder,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.CARGO_RUN_INPUT_PROTOTYPE;
delete env.CARGO_RUN_SHORTCUT_BACKEND;
delete env.CARGO_RUN_SHORTCUT_COMPARE;
let app, page;
const errors = [],
  ids = [randomUUID(), randomUUID(), randomUUID()];
async function launch() {
  app = await _electron.launch({
    args: [path.resolve("out/main/index.js")],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
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
async function checkFlags({
  target = false,
  distinct = false,
  consolidate = false,
} = {}) {
  await page
    .getByRole("button", { name: "Check changes", exact: true })
    .click();
  await page.getByLabel(/I confirm this contract was accepted/).check();
  await page.getByLabel(/I checked the potentially incomplete/).check();
  if (target) await page.getByLabel(/I confirm this evidence belongs/).check();
  if (distinct)
    await page.getByLabel(/This is a separate accepted instance/).check();
  if (consolidate) await page.getByLabel(/Consolidate this OCR-only/).check();
}
async function selectCapture(id) {
  await page.locator('[data-capture-id="' + id + '"]').click();
  await page
    .getByRole("button", { name: "Check changes", exact: true })
    .waitFor();
}
(async () => {
  try {
    await launch();
    await app.close();
    app = null;
    const fixture = JSON.parse(
      fs.readFileSync(
        "tests/fixtures/mobiglas/9ccc7ea4-c6f6-49bc-8bfc-701980e610da.json",
        "utf8",
      ),
    );
    const source = path.join(
        process.env.APPDATA,
        "Cargo Run",
        "captures",
        fixture.source.filename,
      ),
      actualImage = fs.existsSync(source);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=",
      "base64",
    );
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    db.exec(
      "DROP TABLE ocr_review_audit; DROP TABLE capture_contract_links; PRAGMA user_version=3;",
    );
    const oldPolicy = {
      source: "Display",
      allowDisplayFallback: false,
      autoEnabled: false,
      delaySeconds: 3,
      maxAttempts: 3,
      autoSource: "Window",
      cleanupEnabled: true,
      unlinkedDays: 7,
    };
    db.prepare(
      "INSERT INTO settings(key,payload) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
    ).run("ocr.policy", JSON.stringify(oldPolicy));
    for (const id of ids) {
      for (const suffix of [".png", ".thumb.png"]) {
        const dest = path.join(folder, "captures", id + suffix);
        if (actualImage) fs.copyFileSync(source, dest);
        else fs.writeFileSync(dest, png);
      }
      db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
        id,
        JSON.stringify({
          id,
          capturedAt: new Date().toISOString(),
          source: "Manual",
          status: "Processed",
          displayId: "fixture",
          displayLabel: actualImage
            ? "Saved game screenshot"
            : "Synthetic preview PNG; actual OCR export",
          screenshot: id + ".png",
          width: 3840,
          height: 2160,
          bytes: 100,
          attempts: 1,
          error: null,
          result: fixture.result,
          observation: null,
        }),
      );
    }
    db.close();
    await launch();
    let ocr = await page.evaluate(() => window.cargoRun.ocrState());
    assert.equal(ocr.policy.autoSourceOverride, true);
    assert.equal(ocr.policy.autoSource, "Window");
    for (const id of ids)
      await page.evaluate((id) => window.cargoRun.ocrReparse(id), id);
    await nav("Scan Review");
    await selectCapture(ids[2]);
    await checkFlags();
    await page
      .getByRole("button", { name: "Confirm new OCR contract", exact: true })
      .click();
    await page
      .getByText(
        "Reviewed contract saved. Dashboard, Manifest and History are updated.",
        { exact: true },
      )
      .waitFor();
    let s = await state(),
      first = s.contracts[0].id;
    assert.equal(s.contracts.length, 1);
    assert.equal(s.contracts[0].payout, 65250);
    assert.equal(s.contracts[0].acceptedAt, null);
    assert.equal(
      s.contracts[0].cargoObjectives.reduce((n, o) => n + o.quantitySCU, 0),
      25,
    );
    assert.equal(s.tracking.enabled, false);
    const replay = await page.evaluate(async (id) => {
      const r = await window.cargoRun.prepareOcr({
        captureId: id,
        targetId: "",
      });
      return window.cargoRun.confirmOcr({
        captureId: id,
        targetId: "",
        action: "Create",
        draft: r.draft,
        observationHash: r.observationHash,
        choices: {},
        acceptedConfirmed: true,
        incompleteConfirmed: true,
        associationConfirmed: true,
        distinctConfirmed: true,
        consolidationConfirmed: true,
        objectiveRemovalConfirmed: true,
      });
    }, ids[2]);
    assert.equal(replay.idempotent, true);
    await selectCapture(ids[1]);
    await checkFlags();
    assert.equal(
      await page
        .getByRole("button", { name: "Confirm new OCR contract", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByLabel("Review target contract").selectOption(first);
    await checkFlags({ target: true });
    await page
      .getByRole("button", { name: "Confirm update", exact: true })
      .click();
    await page
      .getByText(
        "Reviewed contract saved. Dashboard, Manifest and History are updated.",
        { exact: true },
      )
      .waitFor();
    assert.equal((await state()).contracts.length, 1);
    await selectCapture(ids[0]);
    await checkFlags({ distinct: true });
    await page
      .getByRole("button", { name: "Confirm new OCR contract", exact: true })
      .click();
    await page
      .getByText(
        "Reviewed contract saved. Dashboard, Manifest and History are updated.",
        { exact: true },
      )
      .waitFor();
    assert.equal((await state()).contracts.length, 2);
    await nav("Dashboard");
    assert.match(await page.locator(".stats-grid").innerText(), /130,500/);
    await nav("Manifest");
    await page
      .getByRole("heading", { name: "Cargo Manifest", exact: true })
      .waitFor();
    await nav("History");
    assert.equal(await page.locator(".history-table tbody tr").count(), 2);
    const mission = "7a9edaaa-aa44-4c3c-9be5-ccff802e525b",
      contract = (await state()).contracts.find((c) => c.id === first);
    const note = (text, obj) =>
      '<2026-10-27T15:00:00.000Z> <SHUDEvent_OnNotification> Added notification "' +
      text +
      ':" ... MissionId: [' +
      mission +
      "]" +
      (obj ? ", ObjectiveId: [" + obj + "]" : "");
    const log = path.join(folder, "Game.log");
    fs.writeFileSync(
      log,
      [
        note("Contract Accepted: " + contract.name),
        ...contract.cargoObjectives.map((o, i) =>
          note(
            "New Objective: Deliver 0/" +
              o.quantitySCU +
              " SCU of " +
              o.commodity +
              " to " +
              o.destination,
            "obj-" + i,
          ),
        ),
      ].join("\n") + "\n",
    );
    await nav("Settings");
    const headings = await page
      .locator(".settings-grid h2:visible")
      .allTextContents();
    assert.deepEqual(headings.slice(0, 4), [
      "OCR & Capture",
      "Game.log Monitoring",
      "Ships",
      "Storage & Data",
    ]);
    assert.equal(
      await page.locator(".advanced-panel").getAttribute("open"),
      null,
    );
    await page.screenshot({
      path: "work/settings-v040.png",
      animations: "disabled",
      fullPage: true,
    });
    await app.evaluate(({ dialog }, log) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [log],
      });
    }, log);
    await page
      .getByRole("button", { name: "Select Game.log", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import existing history", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm import", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.cargoRun
        .getState()
        .then((s) => s.contracts.some((c) => !!c.missionId)),
    );
    const logId = (await state()).contracts.find(
      (c) => c.missionId === mission,
    ).id;
    await nav("Scan Review");
    await selectCapture(ids[2]);
    await page.getByLabel("Review target contract").selectOption(logId);
    await checkFlags({ target: true, consolidate: true });
    await page
      .getByRole("button", { name: "Confirm update", exact: true })
      .click();
    await page
      .getByText(
        "Reviewed contract saved. Dashboard, Manifest and History are updated.",
        { exact: true },
      )
      .waitFor();
    s = await state();
    assert.equal(s.contracts.length, 2);
    assert.equal(
      s.contracts.find((c) => c.id === logId).cargoObjectives.length,
      4,
    );
    const links = await page.evaluate(
      (id) => window.cargoRun.contractEvidence(id),
      logId,
    );
    assert.equal(links.filter((l) => l.attached).length, 2);
    ocr = await page.evaluate(() => window.cargoRun.ocrCleanup());
    assert.equal(ocr.captures.find((c) => c.id === ids[2]).expiresAt, null);
    assert.equal(ocr.captures.length, 3);
    await nav("History");
    await page
      .locator(".history-table tbody tr")
      .filter({ hasText: "Log + OCR" })
      .getByRole("button", { name: /Details for/ })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Unlink evidence", exact: true })
        .count(),
      2,
    );
    await page
      .getByRole("button", { name: "Inspect evidence screenshot", exact: true })
      .first()
      .click();
    await page.locator(".full-screenshot img").evaluate((img) => img.decode());
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Unlink evidence", exact: true })
      .first()
      .click();
    await page.waitForFunction(
      (id) =>
        window.cargoRun
          .contractEvidence(id)
          .then((e) => e.filter((l) => l.attached).length === 1),
      logId,
    );
    await page.screenshot({
      path: "work/evidence-v040.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    const saved = await state();
    await app.close();
    app = null;
    await launch();
    s = await state();
    assert.deepEqual(s.contracts, JSON.parse(JSON.stringify(saved.contracts)));
    assert.equal(
      (
        await page.evaluate((id) => window.cargoRun.contractEvidence(id), logId)
      ).filter((l) => l.attached).length,
      1,
    );
    assert.equal(
      (await page.evaluate(() => window.cargoRun.ocrState())).policy
        .autoSourceOverride,
      true,
    );
    await nav("History");
    await page
      .locator(".history-table tbody tr")
      .filter({ hasNotText: "Log + OCR" })
      .getByRole("button", { name: /Details for/ })
      .click();
    await page
      .getByLabel(/I confirm completion of this local contract/)
      .check();
    await page
      .getByRole("button", { name: "Complete local contract", exact: true })
      .click();
    s = await state();
    assert.equal(s.contracts.filter((c) => c.status === "Completed").length, 1);
    assert.equal(
      s.contracts.reduce((n, c) => n + c.confirmedEarnings, 0),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.4.0 Windows Electron: v3 migration; legacy source override; OCR-only creation without monitoring; distinct-instance gating; repeated CaptureId idempotence; multiple screenshots; Dashboard/Manifest/History; explicit late Game.log consolidation; active retention; evidence preview/unlink; restart persistence; manual completion without earnings. Image source: " +
        (actualImage
          ? "existing saved screenshot"
          : "synthetic PNG preview with actual saved OCR text") +
        ".",
    );
  } catch (e) {
    console.error(e);
    if (page)
      await page
        .screenshot({ path: "work/ocr-contracts-failure.png" })
        .catch(() => {});
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})();
