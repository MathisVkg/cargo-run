const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawn, execFileSync } = require("node:child_process"),
  { createInterface } = require("node:readline");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/automatic-desktop-")),
  log = path.join(folder, "Game.log"),
  fixtureExe = path.join(folder, "OcrFixture.exe");
fs.writeFileSync(log, "");
execFileSync(
  path.join(
    process.env.SystemRoot,
    "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
  ),
  [
    "/nologo",
    "/platform:x64",
    "/target:exe",
    "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll",
    "/out:" + fixtureExe,
    path.resolve("tests/native/OcrFixture.cs"),
  ],
  { windowsHide: true, stdio: "inherit" },
);
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: path.join(folder, "profile"),
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page, fixture;
const lines = [];
async function until(check, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Automatic desktop condition timed out");
}
const state = () => page.evaluate(() => window.cargoRun.ocrState());
const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
let index = 0;
function accept(n) {
  const timestamp = new Date(Date.now() + index++).toISOString();
  fs.appendFileSync(
    log,
    "<" +
      timestamp +
      '> [Notice] Added notification "Contract Accepted: Different Cargo Haul" MissionId: [' +
      id(n) +
      "]\n",
  );
}
(async () => {
  try {
    app = await _electron.launch({
      args: [path.resolve("out/main/index.js")],
      env,
    });
    page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    await until(async () => !!(await state()).displays.length, 10000);
    let s = await state();
    assert.equal(s.policy.autoEnabled, false);
    await page.evaluate((settings) => window.cargoRun.ocrConfigure(settings), {
      ...s.settings,
      sounds: false,
      displayId: s.displays.find((d) => d.primary).id,
    });
    await page.evaluate(
      (policy) => window.cargoRun.ocrConfigurePolicy(policy),
      {
        ...s.policy,
        autoEnabled: true,
        delaySeconds: 1,
        maxAttempts: 1,
        autoSource: "Display",
      },
    );
    // Stub only the native picker selection; reader/parser/transaction/observer/scheduler/capture/OCR are real.
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, log);
    await page.evaluate(() => window.cargoRun.chooseLog());
    await page.evaluate(() => window.cargoRun.startMonitoring());
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].minimize(),
    );
    fixture = spawn(fixtureExe, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    createInterface({ input: fixture.stdout }).on("line", (line) =>
      lines.push(line),
    );
    await until(() => lines.includes("READY"), 10000);
    accept(1);
    accept(1);
    accept(2);
    accept(3);
    await until(async () => {
      const s = await state();
      return (
        s.automaticRequests.length === 3 &&
        s.automaticRequests.every((r) =>
          ["Completed", "Skipped", "Failed"].includes(r.status),
        )
      );
    });
    s = await state();
    assert.equal(
      s.automaticRequests.filter((r) => r.status === "Completed").length,
      1,
      JSON.stringify(s.automaticRequests),
    );
    assert.equal(
      s.automaticRequests.filter((r) => r.status === "Skipped").length,
      2,
    );
    assert.equal(s.captures.filter((c) => c.screenshot).length, 1);
    const capture = s.captures.find((c) => c.screenshot);
    assert.equal(capture.validation, "ReviewUnassociated");
    assert.equal(capture.trigger.association, "Unverified");
    assert.equal(capture.backend, "Display");
    assert.equal(capture.observation.objectives.length, 4);
    assert.equal(
      (await page.evaluate(() => window.cargoRun.getState())).contracts.length,
      3,
      "Only Game.log acceptance may create contracts.",
    );
    await page.evaluate(
      (policy) => window.cargoRun.ocrConfigurePolicy(policy),
      { ...s.policy, delaySeconds: 3 },
    );
    accept(4);
    await until(
      async () =>
        (await state()).automaticRequests.some(
          (r) => r.missionId === id(4) && r.status === "Pending",
        ),
      10000,
    );
    await page.evaluate(() => window.cargoRun.stopMonitoring());
    await new Promise((r) => setTimeout(r, 3200));
    assert.equal((await state()).captures.length, 3);
    assert.equal(
      (await state()).automaticRequests.find((r) => r.missionId === id(4))
        .status,
      "Skipped",
    );
    fixture.stdin.write("close\n");
    await new Promise((r) => fixture.once("exit", r));
    fixture = null;
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.restore();
      w.show();
    });
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /^Scan Review/ })
      .click();
    await page
      .locator(".capture-item")
      .filter({ hasText: "Frontier Supply" })
      .first()
      .click();
    await page
      .getByText("Unverified trigger candidate · not a contract association", {
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: "work/automatic-review-v033.png",
      animations: "disabled",
    });
    const before = (
      await page.evaluate(() => window.cargoRun.getState())
    ).contracts.map((c) => c.id);
    const { DatabaseSync } = require("node:sqlite"),
      db = new DatabaseSync(path.join(folder, "profile", "cargo-run.sqlite"));
    const row = JSON.parse(
      db.prepare("SELECT payload FROM ocr_captures WHERE id=?").get(capture.id)
        .payload,
    );
    row.capturedAt = new Date(Date.now() - 8 * 86400000).toISOString();
    db.prepare("UPDATE ocr_captures SET payload=? WHERE id=?").run(
      JSON.stringify(row),
      row.id,
    );
    db.close();
    s = await page.evaluate(() => window.cargoRun.ocrCleanup());
    assert.equal(s.storage.deleted, 1);
    assert.equal(
      fs.existsSync(path.join(s.storagePath, capture.screenshot)),
      false,
    );
    assert.deepEqual(
      (await page.evaluate(() => window.cargoRun.getState())).contracts.map(
        (c) => c.id,
      ),
      before,
    );
    await page.evaluate(
      (policy) => window.cargoRun.ocrConfigurePolicy(policy),
      { ...s.policy, source: "Automatic", allowDisplayFallback: true },
    );
    await app.close();
    app = await _electron.launch({
      args: [path.resolve("out/main/index.js")],
      env,
    });
    page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    const restarted = await state();
    assert.equal(restarted.policy.source, "Automatic");
    assert.equal(restarted.policy.allowDisplayFallback, true);
    assert.equal(restarted.captures.length, 2);
    assert.deepEqual(
      (await page.evaluate(() => window.cargoRun.getState())).contracts.map(
        (c) => c.id,
      ),
      before,
    );
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /^Settings/ })
      .click();
    assert.equal(
      await page.getByLabel("Capture source", { exact: true }).inputValue(),
      "Automatic",
    );
    await page
      .getByLabel("Capture source", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "work/capture-settings-v033.png",
      animations: "disabled",
    });
    console.log(
      "PASS synthetic live Game.log -> committed acceptance -> bounded delayed capture -> offline OCR; duplicate MissionId ignored; unchanged screens skipped; unrelated title retained unassociated; monitoring stop cancels; retention removes expired image/metadata while four log contracts remain. No Star Citizen gameplay or automatic OCR contract creation tested.",
    );
  } finally {
    if (fixture) {
      fixture.stdin.write("close\n");
      fixture.kill();
    }
    if (app) await app.close().catch(() => {});
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
