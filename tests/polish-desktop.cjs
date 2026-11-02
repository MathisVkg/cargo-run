const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/polish-desktop-")),
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
  await page
    .getByRole("heading", { name: "Cargo Operations", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
}
const state = () => page.evaluate(() => window.cargoRun.getState());
const dialog = (name) => page.getByRole("dialog", { name, exact: true });
async function resize(w, h) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win.isMaximized()) win.unmaximize();
      win.setSize(...size);
    },
    [w, h],
  );
  await page.waitForFunction((width) => innerWidth === width, w);
}
async function nav(name) {
  const main = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  if (await main.isVisible())
    await main.getByRole("button", { name, exact: true }).click();
  else {
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
  }
}
async function outside(name) {
  await page.mouse.click(2, 350);
  assert(
    await dialog(name).isVisible(),
    name + " stays open after outside click",
  );
}
async function stable(name) {
  const css = await dialog(name).evaluate((el) => {
    const s = getComputedStyle(el),
      r = el.getBoundingClientRect();
    return {
      animation: s.animationName,
      transition: s.transitionProperty,
      transform: s.transform,
      width: r.width,
      height: r.height,
      center: Math.abs(r.x + r.width / 2 - innerWidth / 2),
      reachable: r.y >= 0 && r.bottom <= innerHeight,
    };
  });
  assert.equal(css.animation, "none");
  assert.equal(css.transition, "none");
  assert.equal(css.transform, "none");
  assert(css.center < 2);
  assert(css.reachable);
  return css;
}
async function close(name) {
  const handle = await dialog(name).elementHandle();
  await page.keyboard.press("Escape");
  await dialog(name).waitFor({ state: "hidden" });
  assert.equal(await handle.evaluate((el) => el.open), false);
}
(async () => {
  try {
    await launch();
    await resize(1440, 900);
    const security = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0],
        p = w.webContents.getLastWebPreferences();
      return {
        min: w.getMinimumSize(),
        node: p.nodeIntegration,
        isolation: p.contextIsolation,
      };
    });
    assert.deepEqual(security, {
      min: [1100, 700],
      node: false,
      isolation: true,
    });
    await page.locator(".sidebar.expanded").waitFor();
    await page.getByLabel("Collapse navigation", { exact: true }).click();
    await page.locator(".sidebar.compact").waitFor();
    await resize(1100, 700);
    await page.locator(".sidebar").waitFor({ state: "hidden" });
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.locator(".sidebar.compact").waitFor();
    await resize(1440, 900);
    await page.locator(".sidebar.compact").waitFor();
    await page.getByLabel("Expand navigation", { exact: true }).click();
    await page.locator(".sidebar.expanded").waitFor();
    await resize(1100, 700);
    await page.locator(".sidebar").waitFor({ state: "hidden" });
    assert.equal((await state()).preferences.navigationMode, "expanded");
    await resize(1440, 900);
    await page.locator(".sidebar.expanded").waitFor();
    await page.getByLabel("Hide navigation", { exact: true }).click();
    await page.locator(".sidebar").waitFor({ state: "hidden" });
    assert.equal((await state()).preferences.navigationMode, "hidden");
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.locator(".sidebar.compact").waitFor();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Manifest", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("heading", { name: "Cargo Manifest", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".sidebar.compact").count(), 1);
    await page.mouse.click(900, 300);
    assert.equal(await page.locator(".sidebar.compact").count(), 1);
    await nav("Dashboard");
    await resize(1100, 700);
    await page.evaluate(async () => {
      await window.cargoRun.saveContract({
        draft: {
          name: "Polish Alpha",
          company: "Test company",
          payout: 15000,
          objectives: [
            {
              commodity: "Food",
              pickupLocation: "Port Tressler",
              destination: "Area18",
              quantitySCU: 5,
            },
            {
              commodity: "Titanium",
              pickupLocation: "Everus Harbor",
              destination: "Orison",
              quantitySCU: 7,
            },
          ],
        },
      });
      await window.cargoRun.saveContract({
        draft: {
          name: "Polish Beta",
          payout: 25000,
          objectives: [
            {
              commodity: "Food",
              pickupLocation: "Port Tressler",
              destination: "Area18",
              quantitySCU: 3,
            },
          ],
        },
      });
    });
    const before = JSON.parse(JSON.stringify((await state()).contracts));
    await page
      .getByRole("button", { name: "By Location", exact: true })
      .click();
    const everus = page.locator(".stop-card").filter({
        has: page.getByRole("heading", {
          name: "Everus Harbor",
          exact: true,
        }),
      }),
      tressler = page.locator(".stop-card").filter({
        has: page.getByRole("heading", {
          name: "Port Tressler",
          exact: true,
        }),
      });
    assert.match(await everus.innerText(), /7 SCU remaining/);
    assert.match(await everus.innerText(), /0 delivered \/ 7 required/);
    assert(!/7 \/ 7 SCU/.test(await everus.innerText()));
    await tressler.locator(".associated-contracts > summary").click();
    assert.equal(await tressler.locator(".associated-contracts li").count(), 2);
    assert.match(await tressler.innerText(), /5 SCU remaining/);
    assert.match(await tressler.innerText(), /3 SCU remaining/);
    await everus
      .getByRole("button", { name: "View Contract", exact: true })
      .click();
    const layout = await stable("Polish Alpha");
    assert(layout.width <= 900 && layout.width >= 850);
    assert(layout.height <= 700 * 0.9);
    assert.equal(
      await dialog("Polish Alpha")
        .locator(".details-objectives tbody tr")
        .count(),
      2,
    );
    const stats = await dialog("Polish Alpha")
      .locator(".details-stats")
      .innerText();
    assert.match(stats, /15,000 aUEC/);
    assert.match(stats, /Confirmed earnings\s*0 aUEC/);
    assert.match(stats, /Required SCU\s*12/);
    assert.match(stats, /Delivered SCU\s*0/);
    assert.match(stats, /Remaining SCU\s*12/);
    assert.equal(
      await dialog("Polish Alpha")
        .getByRole("button", { name: "Complete local contract", exact: true })
        .isEnabled(),
      false,
    );
    await outside("Polish Alpha");
    await page.screenshot({
      path: "work/polish-details-1100.png",
      animations: "disabled",
    });
    await dialog("Polish Alpha")
      .getByRole("button", { name: "Abandon contract", exact: true })
      .click();
    await outside("Abandon contract?");
    await close("Abandon contract?");
    assert.equal((await state()).contracts[0].status, "Active");
    await dialog("Polish Alpha")
      .getByRole("button", { name: "Edit contract", exact: true })
      .click();
    await stable("Edit Contract");
    await outside("Edit Contract");
    await dialog("Edit Contract")
      .getByLabel("Company (optional)", { exact: true })
      .fill("Unsaved correction");
    await page.keyboard.press("Escape");
    await dialog("Discard unsaved changes?").waitFor();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    assert.equal(
      await dialog("Edit Contract")
        .getByLabel("Company (optional)", { exact: true })
        .inputValue(),
      "Unsaved correction",
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await dialog("Edit Contract").waitFor({ state: "hidden" });
    assert(await dialog("Polish Alpha").isVisible());
    await close("Polish Alpha");
    assert(
      await everus
        .getByRole("button", { name: "View Contract", exact: true })
        .evaluate((el) => el === document.activeElement),
    );
    await tressler
      .getByRole("button", { name: "Polish Beta", exact: true })
      .click();
    await dialog("Polish Beta").waitFor();
    await close("Polish Beta");
    assert.deepEqual(
      JSON.parse(JSON.stringify((await state()).contracts)),
      before,
    );
    await page
      .getByRole("button", { name: "Add Contract", exact: true })
      .click();
    await stable("Add Contract");
    await outside("Add Contract");
    await close("Add Contract");
    await page.getByRole("button", { name: "Finish Run", exact: true }).click();
    await stable("Finish current run?");
    await outside("Finish current run?");
    await close("Finish current run?");
    assert.equal((await state()).runs.length, 0);
    await page
      .getByRole("button", { name: "Select ship", exact: true })
      .first()
      .click();
    await stable("Select ship");
    await outside("Select ship");
    const search = dialog("Select ship").getByLabel("Search ships", {
        exact: true,
      }),
      concept = dialog("Select ship").getByLabel(
        "Include concept and other non-flight-ready ships",
        { exact: true },
      );
    const regions = await search.evaluate((el) => ({
      region: getComputedStyle(el).webkitAppRegion,
      insideTitlebar: !!el.closest(".topbar"),
      portal: el.closest("dialog").parentElement === document.body,
    }));
    assert.deepEqual(regions, {
      region: "no-drag",
      insideTitlebar: false,
      portal: true,
    });
    await search.click();
    assert(await search.evaluate((el) => el === document.activeElement));
    await search.pressSequentially("Hull C");
    assert.equal(await dialog("Select ship").getByRole("listitem").count(), 1);
    await search.press("Control+A");
    await search.pressSequentially("Drake");
    assert(
      (
        await dialog("Select ship").getByRole("listitem").allTextContents()
      ).every((t) => t.includes("Drake")),
    );
    await search.press("Control+A");
    await search.pressSequentially("4608");
    assert.equal(await dialog("Select ship").getByRole("listitem").count(), 1);
    await search.fill("");
    assert.equal(
      await dialog("Select ship").getByRole("listitem").count(),
      105,
    );
    await concept.click();
    assert(await concept.isChecked());
    assert.equal(
      await dialog("Select ship").getByRole("listitem").count(),
      126,
    );
    assert.match(
      await dialog("Select ship").locator("[role=status]").innerText(),
      /21 additional/,
    );
    await concept.focus();
    await page.keyboard.press("Space");
    assert.equal(await concept.isChecked(), false);
    assert.equal(
      await dialog("Select ship").getByRole("listitem").count(),
      105,
    );
    await search.fill("Hull C");
    await concept.click();
    assert.match(
      await dialog("Select ship").locator("[role=status]").innerText(),
      /No additional/,
    );
    await concept.click();
    assert.equal((await state()).selectedShipId, "c2");
    await dialog("Select ship")
      .getByRole("button", { name: "Favorite Hull C", exact: true })
      .click();
    await dialog("Select ship")
      .getByRole("button", { name: "Select Hull C", exact: true })
      .click();
    await dialog("Select ship").waitFor({ state: "hidden" });
    assert.equal((await state()).selectedShipId, "hull-c");
    assert.match(await page.locator(".operations-stats").innerText(), /4,608/);
    await nav("Contracts");
    await page.getByLabel("Search contracts", { exact: true }).click();
    await page
      .getByLabel("Search contracts", { exact: true })
      .pressSequentially("Food");
    assert.equal(await page.locator(".contract-card").count(), 2);
    const controls = await page.locator(".contracts-toolbar").evaluate((el) =>
      [...el.children]
        .filter(
          (n) =>
            !n.classList.contains("sr-only") &&
            n.getBoundingClientRect().height > 0,
        )
        .map((n) => {
          const r = n.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        }),
    );
    assert(
      Math.max(...controls.map((r) => r.top)) -
        Math.min(...controls.map((r) => r.top)) <
        15,
    );
    await page
      .getByLabel("Active contract filter", { exact: true })
      .selectOption("unknown");
    assert.equal(await page.locator(".contract-card").count(), 0);
    await page
      .getByLabel("Active contract filter", { exact: true })
      .selectOption("all");
    await page.getByLabel("Search contracts", { exact: true }).fill("");
    await page.screenshot({
      path: "work/polish-contracts-1100.png",
      animations: "disabled",
    });
    await resize(1440, 900);
    await nav("Dashboard");
    await everus
      .getByRole("button", { name: "View Contract", exact: true })
      .click();
    await stable("Polish Alpha");
    await page.screenshot({
      path: "work/polish-details-1440.png",
      animations: "disabled",
    });
    await close("Polish Alpha");
    await page.getByLabel("Maximize", { exact: true }).click();
    await page.getByLabel("Restore window", { exact: true }).waitFor();
    await everus
      .getByRole("button", { name: "View Contract", exact: true })
      .click();
    await stable("Polish Alpha");
    await close("Polish Alpha");
    await page.getByLabel("Restore window", { exact: true }).click();
    await page.getByLabel("Maximize", { exact: true }).waitFor();
    await app.close();
    app = null;
    // Add genuine repository OCR coordinates with generated preview pixels, in this isolated profile only.
    const id = randomUUID(),
      fixture = JSON.parse(
        fs.readFileSync(
          "tests/fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
          "utf8",
        ),
      ),
      png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuUAAAAASUVORK5CYII=",
        "base64",
      );
    fs.mkdirSync(path.join(folder, "captures"), { recursive: true });
    for (const suffix of [".png", ".thumb.png"])
      fs.writeFileSync(path.join(folder, "captures", id + suffix), png);
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
      id,
      JSON.stringify({
        id,
        capturedAt: new Date().toISOString(),
        source: "Manual",
        status: "Processed",
        displayId: "fixture",
        displayLabel: "Generated preview; repository OCR",
        screenshot: id + ".png",
        width: fixture.result.width,
        height: fixture.result.height,
        bytes: png.length,
        attempts: 1,
        error: null,
        result: fixture.result,
        observation: null,
      }),
    );
    const alpha = before.find((c) => c.name === "Polish Alpha"),
      row = db
        .prepare("SELECT payload FROM contracts WHERE id=?")
        .get(alpha.id),
      legacy = JSON.parse(row.payload);
    legacy.source = "Log";
    legacy.sources = ["Log"];
    legacy.missionId = randomUUID();
    db.prepare("UPDATE contracts SET mission_id=?,payload=? WHERE id=?").run(
      legacy.missionId,
      JSON.stringify(legacy),
      alpha.id,
    );
    db.close();
    await launch();
    await resize(1100, 700);
    assert.equal((await state()).preferences.navigationMode, "compact");
    assert.equal((await state()).selectedShipId, "hull-c");
    assert((await state()).preferences.favoriteShipIds.includes("hull-c"));
    assert((await state()).preferences.recentShipIds.includes("hull-c"));
    await nav("Contracts");
    await page.getByLabel("Details for Polish Alpha", { exact: true }).click();
    assert.equal(
      await dialog("Polish Alpha")
        .getByRole("button", { name: "Edit contract", exact: true })
        .isEnabled(),
      false,
    );
    assert.equal(
      await dialog("Polish Alpha")
        .getByRole("button", { name: "Complete local contract", exact: true })
        .count(),
      0,
    );
    await close("Polish Alpha");
    await page.evaluate((id) => window.cargoRun.ocrReparse(id), id);
    const imported = (await state()).contracts.find((c) => c.source === "OCR");
    assert(imported);
    await page
      .getByLabel("Details for " + imported.name, { exact: true })
      .click();
    const evidence = dialog(imported.name);
    await evidence
      .getByRole("button", { name: "Inspect evidence screenshot", exact: true })
      .waitFor();
    assert.equal(
      await evidence.locator(".details-evidence .evidence-record").count(),
      1,
    );
    assert.equal(
      await evidence
        .locator(".details-evidence details")
        .first()
        .getAttribute("open"),
      null,
    );
    await evidence
      .getByRole("button", { name: "Inspect evidence screenshot", exact: true })
      .click();
    await dialog("Evidence screenshot")
      .locator("img")
      .evaluate((img) => img.decode());
    await outside("Evidence screenshot");
    await close("Evidence screenshot");
    assert(await evidence.isVisible());
    await close(imported.name);
    await page.evaluate((id) => window.cargoRun.ocrReparse(id), id);
    assert.equal((await state()).contracts.length, 3);
    await page.getByLabel("Details for Polish Beta", { exact: true }).click();
    await dialog("Polish Beta")
      .getByRole("button", { name: "Abandon contract", exact: true })
      .click();
    await dialog("Abandon contract?")
      .getByRole("button", { name: "Confirm abandonment", exact: true })
      .click();
    await dialog("Polish Beta").waitFor({ state: "hidden" });
    assert.equal(
      (await state()).contracts.find((c) => c.name === "Polish Beta").status,
      "Abandoned",
    );
    await page.evaluate(() =>
      window.cargoRun.saveContract({
        draft: {
          name: "Polish Completion",
          payout: 5000,
          objectives: [
            {
              commodity: "Food",
              pickupLocation: "Everus Harbor",
              destination: "Area18",
              quantitySCU: 1,
            },
          ],
        },
      }),
    );
    await page
      .getByLabel("Details for Polish Completion", { exact: true })
      .click();
    await dialog("Polish Completion").getByRole("checkbox").check();
    await dialog("Polish Completion")
      .getByRole("button", { name: "Complete local contract", exact: true })
      .click();
    await dialog("Polish Completion").waitFor({ state: "hidden" });
    const completed = (await state()).contracts.find(
      (c) => c.name === "Polish Completion",
    );
    assert.equal(completed.status, "Completed");
    assert.equal(completed.confirmedEarnings, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.5.1 actual Windows Electron: 1440/1100/maximized navigation preferences, persistent compact reopening and keyboard page selection; single/multi-contract location links and explicit SCU; centered details/objectives/actions/evidence; protected outside clicks, Escape, dirty warning and focus; no dialog transforms/transitions; mouse/keyboard ship search and concept toggle, favorites/recents/selection restart; aligned filters; OCR evidence replay; secure bridge and unchanged minimum size.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: "work/polish-failure.png", animations: "disabled" })
        .catch(() => {});
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
