// Actual saved game OCR -> protected screenshot review -> structured Reprocess.
// Uses an isolated profile; never mutates the user's live database or original image.
const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const folder = fs.mkdtempSync(path.resolve("work/ocr-review-v032-"));
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: folder,
  CARGO_RUN_INPUT_PROTOTYPE: "1",
  CARGO_RUN_SHORTCUT_BACKEND: "raw-input",
  CARGO_RUN_SHORTCUT_COMPARE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
(async () => {
  try {
    app = await _electron.launch({
      args: [path.resolve("out/main/index.js")],
      env,
    });
    const page = await app.firstWindow(),
      errors = [];
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1200, 800),
    );
    page.on("pageerror", (e) => errors.push(e.message));
    await page
      .getByRole("heading", { name: "Cargo Operations", exact: true })
      .waitFor();
    const id = randomUUID(),
      fixture = JSON.parse(
        fs.readFileSync(
          "tests/fixtures/mobiglas/9ccc7ea4-c6f6-49bc-8bfc-701980e610da.json",
          "utf8",
        ),
      );
    const record = {
      id,
      capturedAt: "2026-10-26T20:00:00Z",
      source: "Manual",
      status: "Processed",
      displayId: "fixture",
      displayLabel: "Generated preview; saved 4K OCR export",
      screenshot: id + ".png",
      width: 3840,
      height: 2160,
      bytes: 0,
      attempts: 7,
      error: null,
      result: fixture.result,
      observation: null,
    };
    // Preview transport is verified using a generated image; OCR coordinates remain from the repository export.
    fs.mkdirSync(path.join(folder, "captures"), { recursive: true });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuUAAAAASUVORK5CYII=",
      "base64",
    );
    for (const suffix of [".png", ".thumb.png"])
      fs.writeFileSync(path.join(folder, "captures", id + suffix), png);
    record.bytes = png.length;
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
      record.id,
      JSON.stringify(record),
    );
    db.close();
    let state = await page.evaluate((id) => window.cargoRun.ocrReparse(id), id);
    assert.equal(state.captures[0].observation.reward.value, 65250);
    assert.deepEqual(
      state.captures[0].observation.objectives.map((r) => r.requiredSCU.value),
      [7, 6, 7, 5],
    );
    assert.deepEqual(state.captures[0].result, record.result);
    assert.equal(state.captures[0].attempts, 7);
    if (
      await page
        .getByLabel("Hide navigation", { exact: true })
        .first()
        .isVisible()
    )
      await page.getByLabel("Hide navigation", { exact: true }).first().click();
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: /^Scan History/ })
      .click();
    await page.locator(".scan-advanced > summary").first().click();
    await page
      .getByRole("button", { name: "Re-extract saved text", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Junior Rank - Small Cargo Haul",
        exact: true,
      })
      .waitFor();
    if (record.screenshot)
      await page
        .locator(".scan-history-thumb img")
        .evaluate((img) => img.decode());
    await page.screenshot({
      path: "work/ocr-review-v032.png",
      animations: "disabled",
    });
    if (
      await page
        .getByLabel("Hide navigation", { exact: true })
        .first()
        .isVisible()
    )
      await page.getByLabel("Hide navigation", { exact: true }).first().click();
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: /^Settings/ })
      .click();
    await page
      .getByRole("button", { name: "Record Shortcut", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("ocr-shortcut")?.disabled,
    );
    await page.keyboard.press("F8");
    await page
      .getByRole("button", { name: "Save shortcut", exact: true })
      .click();
    await page.waitForFunction(
      () => !document.getElementById("ocr-shortcut")?.disabled,
    );
    assert.equal(
      (await page.evaluate(() => window.cargoRun.ocrState())).settings
        .accelerator,
      "F8",
    );
    await page
      .getByRole("button", { name: "Record Shortcut", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("ocr-shortcut")?.disabled,
    );
    await page.keyboard.press("Control+Shift+S");
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.getElementById("ocr-shortcut")?.disabled,
    );
    state = await page.evaluate(() => window.cargoRun.ocrState());
    assert.equal(state.settings.accelerator, "F8");
    assert.equal(state.captures.length, 1);
    assert.equal(state.inputPrototype.selected, "RawInput");
    assert.equal(state.inputPrototype.comparison, true);
    const deadline = Date.now() + 10000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 100));
      state = await page.evaluate(() => window.cargoRun.ocrState());
    } while (
      (state.recording ||
        !["Error", "Listening"].includes(state.inputPrototype.status)) &&
      Date.now() < deadline
    );
    assert.ok(
      ["Error", "Listening"].includes(state.inputPrototype.status),
      JSON.stringify(state.inputPrototype),
    );
    if (state.inputPrototype.status === "Error")
      assert.equal(state.registered, false);
    await page.locator(".advanced-panel > summary").click();
    await page
      .locator(".shortcut-diagnostics > summary")
      .scrollIntoViewIfNeeded();
    await page
      .getByText("Development input prototype", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "work/shortcut-diagnostics-v032.png",
      animations: "disabled",
    });
    assert.deepEqual(state.captures[0].result, record.result);
    assert.equal(
      (await page.evaluate(() => window.cargoRun.getState())).contracts.length,
      1,
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "work/ocr-review-v032-result.json",
      JSON.stringify(
        {
          rawInput: state.inputPrototype,
          captures: state.captures.length,
          reward: 65250,
          quantities: [7, 6, 7, 5],
          rawEvidenceUnchanged: true,
          recorderSaveCancel: true,
          contracts: 1,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS saved actual 4K OCR Reprocess, raw evidence/attempts preserved, generated-image screenshot preview, recorder F8 save/Escape cancellation/no capture, prototype status visible, automatic contract creation. Raw Input status: " +
        state.inputPrototype.status +
        ".",
    );
  } finally {
    if (app) await app.close().catch(() => {});
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
