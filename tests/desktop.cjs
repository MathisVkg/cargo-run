const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
async function run() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync("work", { recursive: true });
  env.NODE_ENV = "test";
  env.CARGO_RUN_TEST_USER_DATA = fs.mkdtempSync(
    path.resolve("work/desktop-phase1-"),
  );
  const app = await _electron.launch({
    args: [path.resolve("out/main/index.js")],
    env,
  });
  let page;
  const errors = [];
  try {
    page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    assert.equal(await page.title(), "Cargo Run");
    const security = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const p = w.webContents.getLastWebPreferences();
      return {
        isolation: p.contextIsolation,
        node: p.nodeIntegration,
        sandbox: p.sandbox,
        minimum: w.getMinimumSize(),
      };
    });
    assert.deepEqual(security, {
      isolation: true,
      node: false,
      sandbox: true,
      minimum: [1100, 700],
    });
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    assert.deepEqual(
      await page.evaluate(() => Object.keys(window.cargoRun).sort()),
      [
        "abandonContract",
        "chooseLog",
        "close",
        "completeContract",
        "confirmOcr",
        "contractEvidence",
        "finishRun",
        "getState",
        "importHistory",
        "isMaximized",
        "loadSamples",
        "minimize",
        "ocrBeginRecording",
        "ocrCapture",
        "ocrCleanup",
        "ocrClear",
        "ocrConfigure",
        "ocrConfigurePolicy",
        "ocrDelete",
        "ocrDisplays",
        "ocrEndRecording",
        "ocrProbeShortcut",
        "ocrReparse",
        "ocrResetShortcutDiagnostics",
        "ocrRetry",
        "ocrState",
        "onMaximized",
        "onOcrState",
        "onState",
        "prepareOcr",
        "removeSamples",
        "saveContract",
        "selectShip",
        "startMonitoring",
        "stopMonitoring",
        "toggleMaximize",
        "unlinkEvidence",
      ],
    );
    await page.evaluate(() => window.cargoRun.loadSamples());
    await page.locator(".sample-banner").waitFor();
    await page
      .getByLabel("Selected ship", { exact: true })
      .selectOption("hull-c");
    assert.match(await page.locator(".stats-grid").innerText(), /4,608 SCU/);
    await page.getByLabel("Selected ship", { exact: true }).selectOption("c2");
    const area = page.getByRole("button", { name: /Area18.*linked contract/ });
    assert.equal(await area.getAttribute("aria-expanded"), "true");
    const orison = page.getByRole("button", {
      name: /Orison.*linked contract/,
    });
    await orison.click();
    assert.equal(await area.getAttribute("aria-expanded"), "true");
    assert.equal(await orison.getAttribute("aria-expanded"), "true");
    await page
      .getByRole("button", { name: "Add Contract", exact: true })
      .click();
    await page
      .getByLabel("Contract name", { exact: true })
      .fill("Desktop validation cargo");
    await page
      .getByLabel("Payout (aUEC, optional)", { exact: true })
      .fill("15000");
    await page
      .getByLabel("Pickup location", { exact: true })
      .fill("Everus Harbor");
    await page.getByLabel("Destination", { exact: true }).fill("Lorville");
    await page.getByLabel("Commodity", { exact: true }).fill("Titanium");
    await page.getByLabel("Cargo quantity (SCU)", { exact: true }).fill("300");
    await page
      .getByRole("button", { name: "Save contract", exact: true })
      .click();
    await page
      .getByText("Capacity exceeded by 24 SCU", { exact: true })
      .waitFor();
    const navigate = async (name) => {
      await page.getByLabel("Open navigation", { exact: true }).click();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: new RegExp("^" + name) })
        .click();
    };
    await navigate("Manifest");
    await page
      .getByRole("heading", { name: "Cargo Manifest", exact: true })
      .waitFor();
    assert.match(await page.locator(".stats-grid").innerText(), /720/);
    await page
      .getByRole("button", { name: /Lorville.*linked contract/ })
      .click();
    await page.getByText("Desktop validation cargo", { exact: true }).waitFor();
    assert.match(await page.locator(".stats-grid").innerText(), /Unavailable/);
    await navigate("Dashboard");
    await page
      .getByRole("button", { name: /Lorville.*linked contract/ })
      .click();
    await page
      .getByLabel("Edit Desktop validation cargo", { exact: true })
      .click();
    await page.getByLabel("Cargo quantity (SCU)", { exact: true }).fill("10");
    await page
      .getByRole("button", { name: "Save contract", exact: true })
      .click();
    assert.match(await page.locator(".stats-grid").innerText(), /430/);
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm & finish run", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Contract History", exact: true })
      .waitFor();
    await page.locator("summary").filter({ hasText: "Finished" }).click();
    assert.match(
      await page.locator(".run-detail").innerText(),
      /Desktop validation cargo/,
    );
    assert.match(await page.locator(".run-detail").innerText(), /Active/);
    await page
      .getByLabel("Search history", { exact: true })
      .fill("Desktop validation");
    assert.equal(await page.locator(".history-table tbody tr").count(), 1);
    await page
      .getByLabel("Filter by status", { exact: true })
      .selectOption("Completed");
    await page.getByText("No contracts found", { exact: true }).waitFor();
    await page.getByLabel("Search history", { exact: true }).fill("");
    assert.equal(await page.locator(".history-table tbody tr").count(), 1);
    assert.match(await page.locator(".stats-grid").innerText(), /32,500/);
    await navigate("Dashboard");
    await page
      .getByRole("button", { name: /Lorville.*linked contract/ })
      .click();
    await page
      .getByLabel("Abandon Desktop validation cargo", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abandon contract", exact: true })
      .click();
    assert.match(await page.locator(".stats-grid").innerText(), /420/);
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("navigation").waitFor({ state: "hidden" });
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.mouse.click(700, 300);
    await page.getByRole("navigation").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Add Contract", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Add Contract", exact: true })
      .waitFor({ state: "hidden" });
    await navigate("Settings");
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    await page
      .getByLabel("Demonstration ship", { exact: true })
      .selectOption("caterpillar");
    assert.equal(
      await page.getByLabel("Selected ship", { exact: true }).inputValue(),
      "caterpillar",
    );
    await page
      .getByRole("button", { name: "Remove sample contracts", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove sample contracts", exact: true })
      .click();
    await navigate("Dashboard");
    await page.getByText("Cargo hold standing by", { exact: true }).waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    fs.mkdirSync("work", { recursive: true });
    await page.screenshot({
      path: "work/dashboard.png",
      animations: "disabled",
    });
    await page.getByLabel("Maximize", { exact: true }).click();
    await page.getByLabel("Restore window", { exact: true }).waitFor();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isMaximized(),
      ),
      true,
    );
    await page.getByLabel("Restore window", { exact: true }).click();
    await page.getByLabel("Maximize", { exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 700),
    );
    await page.screenshot({
      path: "work/dashboard-minimum.png",
      animations: "disabled",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual Electron Windows runtime; security, navigation, ships, add/edit/abandon, capacity, grouped destinations, manifest, history filters, run snapshots, drawer dismissal, sample removal, empty states, maximize/restore, and minimum width.",
    );
  } catch (error) {
    if (page) {
      fs.mkdirSync("work", { recursive: true });
      await page
        .screenshot({ path: "work/desktop-failure.png" })
        .catch(() => {});
    }
    throw error;
  } finally {
    await app.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
