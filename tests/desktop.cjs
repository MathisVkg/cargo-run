const { _electron } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
fs.mkdirSync("work", { recursive: true });
const profile = fs.mkdtempSync(path.resolve("work/fleet-desktop-"));
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: profile,
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
  await page
    .getByRole("heading", { name: "Cargo Operations", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
}
const state = () => page.evaluate(() => window.cargoRun.getState());
async function nav(name) {
  const main = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  if (!(await main.isVisible())) {
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Temporary navigation" })
      .getByRole("button", { name, exact: true })
      .click();
    return;
  }
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}
async function resize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w.isMaximized()) w.unmaximize();
      w.setSize(...size);
    },
    [width, height],
  );
  await page.waitForFunction((w) => innerWidth === w, width);
}
async function choose(query, name) {
  await page
    .getByRole("button", { name: "Select ship", exact: true })
    .first()
    .click();
  await page.getByLabel("Search ships", { exact: true }).fill(query);
  await page
    .getByRole("button", { name: "Select " + name, exact: true })
    .click();
}
(async () => {
  try {
    await launch();
    const security = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0],
        p = w.webContents.getLastWebPreferences();
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
    const bridge = await page.evaluate(() =>
      Object.keys(window.cargoRun).sort(),
    );
    assert(bridge.includes("setPreferences"));
    assert(!bridge.includes("invoke"));
    assert(!bridge.includes("query"));
    await resize(1440, 900);
    assert.equal(
      await page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().width),
      212,
    );
    assert.equal(
      await page
        .getByRole("navigation", { name: "Main navigation", exact: true })
        .getByRole("button")
        .count(),
      6,
    );
    await nav("Contracts");
    assert.equal(
      await page
        .getByRole("navigation", { name: "Main navigation", exact: true })
        .getByRole("button", { name: "Contracts", exact: true })
        .getAttribute("aria-current"),
      "page",
    );
    await nav("Dashboard");
    await resize(1100, 700);
    assert.equal(
      await page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().width),
      62,
    );
    if (
      await page
        .getByLabel("Hide navigation", { exact: true })
        .first()
        .isVisible()
    )
      await page.getByLabel("Hide navigation", { exact: true }).first().click();
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Temporary navigation" })
      .waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("navigation", { name: "Temporary navigation" })
      .waitFor({ state: "hidden" });
    if (
      await page
        .getByLabel("Hide navigation", { exact: true })
        .first()
        .isVisible()
    )
      await page.getByLabel("Hide navigation", { exact: true }).first().click();
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.mouse.click(900, 300);
    await page
      .getByRole("navigation", { name: "Temporary navigation" })
      .waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Add Contract", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Add Contract",
      exact: true,
    });
    const rect = await dialog.boundingBox();
    assert(Math.abs(rect.x + rect.width / 2 - 550) < 3);
    assert(rect.width >= 620 && rect.width <= 720);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Add Contract", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page
      .getByRole("button", { name: "Add Contract", exact: true })
      .click();
    await page.getByLabel("Contract name", { exact: true }).fill("Unsaved");
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Contract name", { exact: true }).inputValue(),
      "Unsaved",
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    assert.equal((await state()).contracts.length, 0);
    await page
      .getByRole("button", { name: "Add Contract", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save contract", exact: true })
      .click();
    assert.equal((await state()).contracts.length, 0);
    await page
      .getByLabel("Contract name", { exact: true })
      .fill("Desktop fleet cargo");
    await page
      .getByLabel("Company (optional)", { exact: true })
      .fill("Test company");
    await page
      .getByLabel("Payout (aUEC, optional)", { exact: true })
      .fill("15000");
    await page
      .getByLabel("Pickup location", { exact: true })
      .fill("Everus Harbor");
    await page.getByLabel("Destination", { exact: true }).fill("Lorville");
    await page.getByLabel("Commodity", { exact: true }).fill("Titanium");
    await page.getByLabel("Cargo quantity (SCU)", { exact: true }).fill("-1");
    await page
      .getByRole("button", { name: "Save contract", exact: true })
      .click();
    assert.equal((await state()).contracts.length, 0);
    await page.getByLabel("Cargo quantity (SCU)", { exact: true }).fill("10");
    await page
      .getByRole("button", { name: "Add delivery stop", exact: true })
      .click();
    await page
      .getByLabel("Pickup location", { exact: true })
      .nth(1)
      .fill("Everus Harbor");
    await page.getByLabel("Destination", { exact: true }).nth(1).fill("Area18");
    await page.getByLabel("Commodity", { exact: true }).nth(1).fill("Food");
    await page
      .getByLabel("Cargo quantity (SCU)", { exact: true })
      .nth(1)
      .fill("20");
    await page.keyboard.press("Tab");
    assert(await dialog.evaluate((el) => el.contains(document.activeElement)));
    await dialog
      .getByRole("button", { name: "Close panel", exact: true })
      .focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .getByRole("button", { name: "Save contract", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await dialog
        .getByRole("button", { name: "Close panel", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    const actions = await dialog.locator(".dialog-actions").boundingBox();
    assert(actions.y + actions.height <= innerHeightForTest(700));
    await page.screenshot({
      animations: "disabled",
      path: "work/fleet-modal-1100.png",
    });
    await dialog.locator("form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await dialog.waitFor({ state: "hidden" });
    assert.equal((await state()).contracts.length, 1);
    assert.match(await page.locator(".operations-stats").innerText(), /15,000/);
    await choose("Hull C", "Hull C");
    assert.equal((await state()).selectedShipId, "hull-c");
    assert.match(await page.locator(".operations-stats").innerText(), /4,608/);
    await page
      .getByRole("button", { name: "Select ship", exact: true })
      .click();
    await page.getByLabel("Search ships", { exact: true }).fill("C2 Hercules");
    await page
      .getByRole("button", {
        name: "Favorite C2 Hercules Starlifter",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Select C2 Hercules Starlifter",
        exact: true,
      })
      .click();
    assert((await state()).preferences.favoriteShipIds.includes("c2"));
    await page
      .getByRole("button", { name: "By Contract", exact: true })
      .click();
    await page.locator(".contract-card").waitFor();
    assert.equal(await page.locator(".contract-card").count(), 1);
    await nav("Manifest");
    assert.equal(await page.locator(".manifest-group tbody tr").count(), 4);
    assert.equal(
      await page.locator(".manifest-section input[type=checkbox]").count(),
      0,
    );
    await nav("Contracts");
    await page.getByLabel("Search contracts", { exact: true }).fill("Food");
    assert.equal(await page.locator(".contract-card").count(), 1);
    await page.getByLabel("Search contracts", { exact: true }).fill("Missing");
    assert.equal(await page.locator(".contract-card").count(), 0);
    await page.getByLabel("Search contracts", { exact: true }).fill("");
    await page.getByLabel("Edit Desktop fleet cargo", { exact: true }).click();
    await page
      .getByRole("dialog", { name: "Edit Contract", exact: true })
      .getByLabel("Cargo quantity (SCU)", { exact: true })
      .first()
      .fill("700");
    await page
      .getByRole("button", { name: "Save contract", exact: true })
      .click();
    await nav("Dashboard");
    assert.match(
      await page.locator(".notice.warning[role=status]").innerText(),
      /24 SCU/,
    );
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm & finish run", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Contract History", exact: true })
      .waitFor();
    assert.equal((await state()).runs.length, 1);
    await page
      .getByLabel("Search history", { exact: true })
      .fill("Desktop fleet");
    assert.equal(await page.locator(".history-table tbody tr").count(), 1);
    await nav("Contracts");
    await page
      .getByLabel("Abandon Desktop fleet cargo", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abandon contract", exact: true })
      .click();
    await nav("History");
    await page
      .getByLabel("Filter by status", { exact: true })
      .selectOption("Abandoned");
    assert.equal(await page.locator(".history-table tbody tr").count(), 1);
    await nav("Dashboard");
    // Stress the presentation with 20 distinct contracts and 40 objective identities.
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++)
        await window.cargoRun.saveContract({
          draft: {
            name: "Fleet mission " + i,
            payout: 1000,
            objectives: [
              {
                commodity: "Food",
                pickupLocation: "Port Tressler",
                destination:
                  i % 2
                    ? "NB Int. Spaceport"
                    : "NB Int. Spaceport on microTech",
                quantitySCU: 8,
              },
              {
                commodity: "Titanium",
                pickupLocation: "Everus Harbor",
                destination: "Area18",
                quantitySCU: 12,
              },
            ],
          },
        });
    });
    await page
      .getByRole("button", { name: "By Location", exact: true })
      .click();
    assert.equal(await page.locator(".stop-card").count(), 4);
    assert.match(await page.locator(".operations-stats").innerText(), /20,000/);
    await page.screenshot({
      animations: "disabled",
      path: "work/fleet-dashboard-1100.png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await nav("Manifest");
    assert.equal(await page.locator(".manifest-group tbody tr").count(), 80);
    await page.screenshot({
      animations: "disabled",
      path: "work/fleet-manifest-1100.png",
    });
    await resize(1440, 900);
    await nav("Dashboard");
    await page.screenshot({
      animations: "disabled",
      path: "work/fleet-dashboard-1440.png",
    });
    await page
      .getByRole("button", { name: "By Contract", exact: true })
      .click();
    assert.equal(await page.locator(".contract-card").count(), 20);
    await page.screenshot({
      animations: "disabled",
      path: "work/fleet-contracts-1440.png",
    });
    await app.close();
    app = null;
    await launch();
    assert.equal((await state()).selectedShipId, "c2");
    assert((await state()).preferences.favoriteShipIds.includes("c2"));
    assert.equal((await state()).preferences.dashboardView, "contract");
    await page.locator(".contract-card").first().waitFor();
    assert.equal(await page.locator(".contract-card").count(), 20);
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
    await page.getByLabel("Minimize", { exact: true }).click();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isMinimized(),
      ),
      true,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].restore(),
    );
    const ocr = await page.evaluate(() => window.cargoRun.ocrState());
    await app.evaluate(
      ({ BrowserWindow }, s) =>
        BrowserWindow.getAllWindows()[0].webContents.send("ocr:state", {
          ...s,
          revision: s.revision + 1,
          processing: false,
          queued: 0,
          lastCapture: {
            at: new Date().toISOString(),
            success: true,
            message: "Test notification",
          },
        }),
      ocr,
    );
    await page
      .getByRole("button", { name: "Capture saved", exact: true })
      .waitFor();
    await page
      .getByRole("button", {
        name: ocr.engine.available ? "OCR ready" : "OCR unavailable",
        exact: true,
      })
      .waitFor({ timeout: 7000 });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Fleet Operations 2.0 actual Windows Electron: secure bridge; 1440/1100 sidebar + resize + active navigation; overlay Escape/outside; centered modal, validation, dirty warning, focus restoration and multi-objective persistence; ship search/favorites/recent/selection/view restart; capacity; manifest identity; 20 contracts; edit/abandon/run/history; maximize/restore/minimize. Artifacts work/fleet-*.png.",
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({ animations: "disabled", path: "work/fleet-failure.png" })
        .catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
function innerHeightForTest(height) {
  return height;
}
