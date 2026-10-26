const { _electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawn, execFileSync } = require("node:child_process"),
  { createInterface } = require("node:readline");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/ocr-desktop-")),
  fixtureExe = path.join(folder, "OcrFixture.exe");
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
const errors = [],
  fixtureLines = [];
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
  await until(async () => !!(await state()).displays.length);
}
const state = () => page.evaluate(() => window.cargoRun.ocrState());
async function until(check, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("OCR integration condition timed out");
}
async function navigate(name) {
  await page.getByLabel("Open navigation", { exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
}
async function command(text) {
  fixtureLines.length = 0;
  fixture.stdin.write(text + "\n");
  await until(
    () =>
      fixtureLines.includes(
        text === "keys" ? "KEYS_SENT" : text === "black" ? "BLACK" : text,
      ),
    10000,
  );
}
async function run() {
  try {
    await launch();
    let s = await state();
    assert.equal(s.engine.available, true);
    assert.equal(s.captureAvailable, true);
    const configured = {
      ...s.settings,
      enabled: true,
      accelerator: "Ctrl+Shift+F9",
      displayId: s.displays.find((d) => d.primary).id,
      sounds: true,
    };
    await page.evaluate(
      (settings) => window.cargoRun.ocrConfigure(settings),
      configured,
    );
    s = await state();
    assert.equal(
      s.registered,
      true,
      "Default shortcut must be registered for this integration test",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].minimize(),
    );
    fixture = spawn(fixtureExe, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    createInterface({ input: fixture.stdout }).on("line", (line) =>
      fixtureLines.push(line),
    );
    fixture.stderr.on("data", (b) => console.error(String(b)));
    await until(() => fixtureLines.includes("READY"), 10000);
    for (let i = 0; i < 3; i++) {
      await command("keys");
      await new Promise((r) => setTimeout(r, 200));
    }
    await until(async () => {
      const s = await state();
      return (
        s.captures.length === 3 &&
        s.captures.every((c) => c.status === "Processed")
      );
    });
    s = await state();
    assert.equal(
      s.captures.every((c) => c.source === "Shortcut"),
      true,
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isMinimized(),
      ),
      true,
      "Capture must leave Cargo Run minimized",
    );
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getFocusedWindow() === null,
      ),
      true,
      "Capture must not steal focus",
    );
    for (const c of s.captures) {
      assert.equal(c.observation.objectives.length, 4);
      assert.equal(c.observation.reward.value, 60000);
      assert.equal(c.observation.company.value, "Covalex Shipping");
      assert.match(c.result.text, /Pressurized Ice/);
      assert.equal(c.result.lines.length > 5, true);
      assert.equal(fs.existsSync(path.join(s.storagePath, c.screenshot)), true);
    }
    assert.equal(
      (await page.evaluate(() => window.cargoRun.getState())).contracts.length,
      0,
      "OCR must never create contracts",
    );
    await command("black");
    await command("keys");
    await until(async () => {
      const s = await state();
      return s.captures.length === 4 && s.captures[3].status === "Failed";
    });
    assert.match((await state()).captures[3].error, /black/i);
    fixture.stdin.write("close\n");
    await new Promise((r) => fixture.once("exit", r));
    fixture = null;
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.restore();
      w.show();
    });
    await navigate("Scan Review");
    await page
      .getByRole("heading", { name: "Scan Review", exact: true })
      .waitFor();
    await page
      .locator(".capture-item")
      .filter({ hasText: "Frontier Supply" })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Raw recognized text", exact: true })
      .waitFor();
    const imageWorks = await page
      .locator(".screenshot-preview img")
      .evaluate(async (img) => {
        await img.decode();
        return img.naturalWidth > 1000;
      });
    assert.equal(imageWorks, true);
    await page.locator(".page-content").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: "work/ocr-review.png",
      animations: "disabled",
    });
    const before = (await state()).captures;
    await app.close();
    await launch();
    s = await state();
    assert.equal(s.captures.length, 4);
    assert.equal(s.captures.filter((c) => c.status === "Processed").length, 3);
    assert.equal(s.settings.displayId, configured.displayId);
    assert.equal(s.settings.sounds, true);
    assert.deepEqual(
      s.captures.map((c) => c.id),
      before.map((c) => c.id),
    );
    await navigate("Settings");
    await page
      .getByRole("heading", {
        name: "Windows capture & OCR prototype",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "work/ocr-settings.png",
      animations: "disabled",
    });
    await page
      .getByLabel("Enable global capture shortcut", { exact: true })
      .uncheck();
    await until(async () => !(await state()).registered);
    await navigate("Scan Review");
    await page
      .getByRole("button", { name: "Clear captures", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm clear captures", exact: true })
      .click();
    await page.getByText("No captures yet", { exact: true }).waitFor();
    assert.equal((await state()).captures.length, 0);
    assert.equal(
      (await page.evaluate(() => window.cargoRun.getState())).contracts.length,
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual Windows capture + offline OCR: physical display screenshot, genuine global shortcut while synthetic WinForms app focused and Cargo Run minimized, three captures queued, raw text/boxes and four objectives recognized, black screenshot rejected, review image protocol, metadata/settings restart, clear/disable, and no contracts created. No Star Citizen session was tested; audio routing was exercised but subjective audibility was not verified.",
    );
  } finally {
    if (fixture) {
      fixture.stdin.write("close\n");
      fixture.kill();
    }
    if (app) await app.close().catch(() => {});
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
