const synthetic = process.env.CARGO_RUN_SYNTHETIC_CAPTURE === "1";
const syntheticCapture = synthetic
  ? require("./helpers/synthetic-capture.cjs")
  : null;
// Owned synthetic StarCitizen.exe window only. This is not live gameplay.
const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawn, execFileSync } = require("node:child_process"),
  { createInterface } = require("node:readline"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/redesign-ocr-")),
  profile = path.join(folder, "profile"),
  output = path.resolve("work/ui-v080");
fs.mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_STARTUP_METRICS: "1",
  CARGO_RUN_TEST_USER_DATA: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page, fixture;
const errors = [],
  lines = [];
let savedId;
const metrics = [];
const state = () => page.evaluate(() => window.cargoRun.getState()),
  ocr = () => page.evaluate(() => window.cargoRun.ocrState());
async function until(check, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error("OCR editor condition timed out");
}
async function launch() {
  app = await _electron.launch({
    args: [
      synthetic ? syntheticCapture.entry() : path.resolve("out/main/index.js"),
    ],
    env,
  });
  app.process().stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const at = line.indexOf("[startup] ");
      if (at >= 0)
        try {
          metrics.push(JSON.parse(line.slice(at + 10)));
        } catch {
          /* Chunk may end mid-line. */
        }
    }
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Contracts", exact: true }).waitFor();
  await page.evaluate(async () => {
    const s = await window.cargoRun.ocrState();
    await window.cargoRun.ocrConfigure({
      ...s.settings,
      enabled: false,
      sounds: false,
    });
  });
}
const editor = () =>
  page.getByRole("dialog", { name: /^(Add|Edit) Contract$/, exact: true });
async function confirmations(d) {
  for (const label of [
    "I checked the full objective list; preserve existing unseen objectives.",
    "I accepted this contract in-game.",
    "This is a separate accepted contract from the matching candidates.",
  ]) {
    const c = d.getByLabel(label, { exact: true });
    if (await c.count()) await c.check();
  }
}
async function save(d) {
  await confirmations(d);
  await d.getByRole("button", { name: "Save contract", exact: true }).click();
  if (await d.isVisible()) {
    await confirmations(d);
    for (const choice of await d.locator(".editor-confirmations select").all())
      await choice.selectOption("Reviewed");
    await d.getByRole("button", { name: "Save contract", exact: true }).click();
  }
  await d.waitFor({ state: "hidden" });
}
(async () => {
  try {
    // Refuse ambiguous real-game metadata: this test must capture only its owned fixture.
    const existing = synthetic
      ? "0"
      : execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "@(Get-Process -Name StarCitizen -ErrorAction SilentlyContinue).Count",
          ],
          { encoding: "utf8", windowsHide: true },
        ).trim();
    if (!synthetic && Number(existing) > 0)
      throw Error(
        "Close or avoid the real game before this synthetic test; no user game process is controlled.",
      );
    if (!synthetic) {
      const source = fs
          .readFileSync("tests/native/OcrFixture.cs", "utf8")
          .replace("TopMost=true", "TopMost=false"),
        cs = path.join(folder, "EditorFixture.cs"),
        exe = path.join(folder, "StarCitizen.exe");
      fs.writeFileSync(cs, source);
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
          "/out:" + exe,
          cs,
        ],
        { windowsHide: true, stdio: "inherit" },
      );
      fixture = spawn(exe, [], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: false,
      });
      createInterface({ input: fixture.stdout }).on("line", (s) =>
        lines.push(s),
      );
    } else {
      env.CARGO_RUN_SYNTHETIC_IMAGE = syntheticCapture.imagePath(folder);
      fixture = syntheticCapture.startFixture(folder);
      createInterface({ input: fixture.stdout }).on("line", (s) =>
        lines.push(s),
      );
    }
    await until(() => lines.includes("READY"), 10000);
    await launch();
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1280, 800);
      w.focus();
    });
    // Saved Full Display preference must never override Add Contract's game-window-only attempt.
    await page.evaluate(async () => {
      const s = await window.cargoRun.ocrState();
      await window.cargoRun.ocrConfigurePolicy({
        ...s.policy,
        source: "Display",
        allowDisplayFallback: true,
      });
    });
    assert(
      !metrics.some((m) => m.stage === "ocr-worker-ready"),
      "OCR worker must remain lazy before capture",
    );
    await page.locator(".top-add").click();
    let d = editor();
    await d
      .getByLabel("Company (optional)", { exact: true })
      .fill("Typed during recognition");
    await until(async () => {
      const c = (await ocr()).captures.at(-1);
      return c && ["Processed", "Failed"].includes(c.status);
    });
    let c = (await ocr()).captures.at(-1);
    savedId = c.id;
    assert.equal(c.status, "Processed", c.error ?? "");
    assert.equal(c.backend, "Window");
    assert.equal(c.fallback, false);
    assert.equal(c.reviewMode, "Editor");
    assert.equal((await ocr()).policy.source, "Display");
    assert.equal((await state()).contracts.length, 0);
    await until(async () =>
      /Frontier Supply/i.test(
        await d.getByLabel("Contract name", { exact: true }).inputValue(),
      ),
    );
    assert.equal(
      await d.getByLabel("Company (optional)", { exact: true }).inputValue(),
      "Typed during recognition",
    );
    assert.equal(await d.locator(".objective-fields").count(), 4);
    assert(c.result.provider.toLowerCase().includes("tesseract"));
    assert(metrics.some((m) => m.stage === "ocr-worker-ready"));
    console.log(
      "First OCR worker initialization:",
      JSON.stringify(metrics.find((m) => m.stage === "ocr-worker-ready")),
    );
    await d
      .getByLabel("Contract name", { exact: true })
      .fill("Reviewed synthetic cold chain");
    await page.screenshot({
      path: path.join(output, "ocr-editor-landscape.png"),
      animations: "disabled",
    });
    await save(d);
    let s = await state();
    assert.equal(s.contracts.length, 1);
    assert.equal(s.contracts[0].source, "OCR");
    assert.equal(s.contracts[0].cargoObjectives.length, 4);
    const id = s.contracts[0].id,
      before = JSON.parse(JSON.stringify(s.contracts[0]));
    await page
      .getByLabel("Expand Reviewed synthetic cold chain", { exact: true })
      .click();
    await page
      .locator(".contract-expansion")
      .getByRole("button", { name: "Edit contract", exact: true })
      .click();
    d = editor();
    await d
      .getByRole("button", { name: "Open original screenshot", exact: true })
      .waitFor();
    await d
      .getByRole("button", { name: "Open original screenshot", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Original screenshot", exact: true })
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    await d
      .getByRole("button", { name: "Reprocess saved OCR", exact: true })
      .click();
    await until(async () =>
      ["Unchanged", "Improved", "Failed"].includes(
        (await ocr()).captures.find((c) => c.id === savedId).recovery?.status,
      ),
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify((await state()).contracts[0])),
      before,
    );
    assert.equal((await ocr()).captures.length, 1);
    assert.equal(
      await d.getByLabel("Contract name", { exact: true }).inputValue(),
      before.name,
    );
    await d
      .getByLabel("Reward (aUEC, optional)", { exact: true })
      .fill("61000");
    await save(d);
    s = await state();
    assert.equal(s.contracts[0].id, id);
    assert.deepEqual(
      s.contracts[0].cargoObjectives.map((o) => o.id),
      before.cargoObjectives.map((o) => o.id),
    );
    assert.equal(s.contracts[0].payout, 61000);
    assert.equal(s.contracts.length, 1);
    // Removing an OCR-owned saved objective requires explicit confirmation and preserves the other IDs.
    await page
      .locator(".contract-expansion")
      .getByRole("button", { name: "Edit contract", exact: true })
      .click();
    d = editor();
    await d
      .getByRole("button", { name: "Remove objective 4", exact: true })
      .click();
    await d
      .getByLabel("Remove the selected saved objectives", { exact: true })
      .check();
    await save(d);
    assert.equal((await state()).contracts[0].cargoObjectives.length, 3);
    assert.deepEqual(
      (await state()).contracts[0].cargoObjectives.map((o) => o.id),
      before.cargoObjectives.slice(0, 3).map((o) => o.id),
    );
    // Explicit new capture may be discarded and recovered through the same editor.
    await page.locator(".top-add").click();
    d = editor();
    await until(async () => {
      const c = (await ocr()).captures.at(-1);
      return c.id !== savedId && c.status === "Processed";
    });
    await until(
      async () =>
        !!(await d.getByLabel("Contract name", { exact: true }).inputValue()),
    );
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    const discard = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    });
    if (await discard.isVisible())
      await discard
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
    assert.equal((await state()).contracts.length, 1);
    await page.locator(".needs-review > summary").click();
    await page
      .getByRole("button", { name: "Review capture", exact: true })
      .click();
    d = editor();
    await d
      .getByLabel("Contract association", { exact: true })
      .selectOption(id);
    await until(
      async () =>
        (await d.locator("select[aria-label='Objective identity 1']").count()) >
        0,
    );
    // Use backend-confirmed exact row mapping; no title-only identity selection is performed.
    await save(d);
    assert.equal((await state()).contracts.length, 1);
    // No game window: one request fails, and Capture again adds exactly one new request.
    fixture.stdin.write("close\n");
    await until(() => fixture.exitCode !== null, 10000);
    const count = (await ocr()).captures.length;
    await page.locator(".top-add").click();
    d = editor();
    await until(
      async () =>
        (await ocr()).captures.length === count + 1 &&
        (await ocr()).captures.at(-1).status === "Failed",
    );
    await page.waitForTimeout(350);
    assert.equal((await ocr()).captures.length, count + 1);
    await d.getByRole("button", { name: "Capture again", exact: true }).click();
    await until(
      async () =>
        (await ocr()).captures.length === count + 2 &&
        (await ocr()).captures.at(-1).status === "Failed",
    );
    await page.waitForTimeout(350);
    assert.equal((await ocr()).captures.length, count + 2);
    await d
      .getByRole("button", { name: "Delete capture", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Delete capture?", exact: true })
      .getByRole("button", { name: "Confirm delete capture", exact: true })
      .click();
    await until(async () => (await ocr()).captures.length === count + 1);
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    const persisted = JSON.parse(JSON.stringify((await state()).contracts));
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(
      JSON.parse(JSON.stringify((await state()).contracts)),
      persisted,
    );
    const db = new DatabaseSync(path.join(profile, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS capture review -> offline Tesseract -> editable unsaved fields; explicit OCR save and corrections; evidence preview; reprocess without recapture/auto-overwrite; identity-preserving attachment/no duplicate; unresolved recovery/deletion; one-shot failure + explicit Capture again; restart/FK. No real gameplay. Profile: " +
        profile,
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(output, "ocr-failure.png") })
        .catch(() => {});
    console.error("Renderer errors", errors);
    throw e;
  } finally {
    if (app) await app.close();
    if (fixture && fixture.exitCode === null) {
      fixture.stdin.write("close\n");
      await new Promise((r) => setTimeout(r, 300));
      if (fixture.exitCode === null) fixture.kill();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
