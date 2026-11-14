const synthetic = process.env.CARGO_RUN_SYNTHETIC_CAPTURE === "1";
const syntheticCapture = synthetic
  ? require("./helpers/synthetic-capture.cjs")
  : null;
const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { DatabaseSync } = require("node:sqlite");
const { execFileSync } = require("node:child_process");
if (
  !synthetic &&
  Number(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "@(Get-Process -Name StarCitizen -ErrorAction SilentlyContinue).Count",
      ],
      { encoding: "utf8", windowsHide: true },
    ).trim(),
  ) > 0
)
  throw Error(
    "The isolated manual-fallback test expects no real Star Citizen process. No user game process is controlled.",
  );
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/redesign-desktop-")),
  output = path.resolve("work/ui-v080");
fs.mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: folder,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [],
  viewports = [];
async function launch() {
  app = await _electron.launch({
    args: [
      synthetic ? syntheticCapture.entry() : path.resolve("out/main/index.js"),
    ],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Contracts", exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
  await page.evaluate(async () => {
    const o = await window.cargoRun.ocrState();
    await window.cargoRun.ocrConfigure({
      ...o.settings,
      enabled: false,
      sounds: false,
    });
  });
}
const state = () => page.evaluate(() => window.cargoRun.getState()),
  ocr = () => page.evaluate(() => window.cargoRun.ocrState());
async function nav(name) {
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: name === "Cargo" ? "Cargo Plan" : name,
      exact: true,
    })
    .waitFor();
}
async function size(w, h) {
  await app.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win.isMaximized()) win.unmaximize();
      win.setSize(w, h);
    },
    [w, h],
  );
  await page.waitForFunction((w) => innerWidth === w, w);
  await page.waitForTimeout(150);
}
async function shot(name) {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.screenshot({
    path: path.join(output, name + ".png"),
    animations: "disabled",
  });
  assert(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    "Body overflow " + name,
  );
  assert(
    await page
      .locator("main")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    "Main overflow " + name,
  );
  const n = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  assert(await n.isVisible());
  assert.equal(await n.getByRole("button").count(), 4);
  const top = await page.locator(".topbar").boundingBox();
  assert(top.y >= 0 && top.y < 1, "Title bar position " + name);
  const rect = await n.boundingBox();
  assert(rect.y + rect.height <= (await page.evaluate(() => innerHeight)) + 1);
  viewports.push({
    name,
    ...(await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }))),
  });
}
async function editorFocusCheck() {
  const d = page.getByRole("dialog", { name: "Add Contract", exact: true });
  await d.getByLabel("Contract name", { exact: true }).focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    assert(await d.evaluate((e) => e.contains(document.activeElement)));
  }
  await page.keyboard.press("Escape");
  await d.waitFor({ state: "hidden" });
  assert(
    await page
      .locator(".top-add")
      .evaluate((e) => e === document.activeElement),
  );
}
async function until(fn) {
  for (let i = 0; i < 300; i++) {
    if (await fn()) return;
    await page.waitForTimeout(50);
  }
  throw Error("Condition timed out");
}
async function fillEditor(name) {
  const d = page.getByRole("dialog", { name: /^(Add|Edit) Contract$/ });
  await d.getByLabel("Contract name", { exact: true }).fill(name);
  await d
    .getByLabel("Company (optional)", { exact: true })
    .fill("Synthetic Hauling");
  await d.getByLabel("Reward (aUEC, optional)", { exact: true }).fill("12000");
  const stop = d.locator(".objective-fields").first();
  await stop
    .getByLabel("Pickup location", { exact: true })
    .fill("Everus Harbor");
  await stop.getByLabel("Destination", { exact: true }).fill("Area18");
  await stop.getByLabel("Commodity", { exact: true }).fill("Quartz");
  await stop.getByLabel("Required SCU", { exact: true }).fill("12");
  return d;
}
(async () => {
  try {
    await launch();
    const security = await app.evaluate(({ BrowserWindow }) => {
      const p =
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        isolation: p.contextIsolation,
        node: p.nodeIntegration,
        sandbox: p.sandbox,
        webSecurity: p.webSecurity,
      };
    });
    assert.deepEqual(security, {
      isolation: true,
      node: false,
      sandbox: true,
      webSecurity: true,
    });
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    const bridge = await page.evaluate(() => Object.keys(window.cargoRun));
    assert(bridge.includes("setPreferences"));
    assert(!bridge.includes("invoke"));
    assert(!bridge.includes("query"));
    await size(1440, 900);
    const navItems = await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button")
      .allTextContents();
    assert.deepEqual(navItems, ["Contracts", "Cargo", "History", "Settings"]);
    // Manual editor stays usable even when no game is available; capture is a single explicit attempt.
    await page.locator(".top-add").click();
    let d = await fillEditor("Manual foundation contract");
    assert(await d.getByLabel("Contract name", { exact: true }).isEnabled());
    await until(
      async () =>
        !(await ocr()).captures.some(
          (c) => c.status === "Captured" || c.status === "Processing",
        ),
    );
    const capturesBeforeSave = (await ocr()).captures;
    await d.getByRole("button", { name: "Save contract", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    assert.equal((await state()).contracts.length, 1);
    // Shared routes aggregate quantities but retain each underlying reminder identity.
    await page.evaluate(async () => {
      for (const [name, objectives] of [
        [
          "Orbital supplies",
          [
            {
              commodity: "Titanium",
              pickupLocation: "Port Tressler",
              destination: "NB Int. Spaceport",
              quantitySCU: 25,
            },
          ],
        ],
        [
          "MicroTech circuit",
          [
            {
              commodity: "Titanium",
              pickupLocation: "Port Tressler",
              destination: "NB Int. Spaceport",
              quantitySCU: 5,
            },
            {
              commodity: "Titanium",
              pickupLocation: "Port Tressler",
              destination: "New Babbage",
              quantitySCU: 10,
            },
            {
              commodity: "Hydrogen",
              pickupLocation: "Everus Harbor",
              destination: "Rayari Outpost",
              quantitySCU: 8,
            },
          ],
        ],
      ])
        await window.cargoRun.saveContract({
          draft: {
            name,
            company: "Synthetic Hauling",
            payout: 15000,
            objectives,
          },
        });
    });
    await nav("Contracts");
    assert.equal(
      await page.locator(".contracts-ledger > tbody > tr").count(),
      3,
    );
    assert(
      !/aUEC|Synthetic Hauling|Source:/.test(
        await page.locator(".contracts-ledger").innerText(),
      ),
    );
    await page.getByLabel("Expand MicroTech circuit", { exact: true }).click();
    assert.match(
      await page.locator(".contract-expansion").innerText(),
      /15,000 aUEC/,
    );
    await page
      .locator(".contract-expansion")
      .getByRole("button", { name: "Edit contract", exact: true })
      .click();
    d = page.getByRole("dialog", { name: "Edit Contract", exact: true });
    await d
      .getByLabel("Contract name", { exact: true })
      .fill("MicroTech circuit revised");
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await d.getByRole("button", { name: "Save contract", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    assert(
      (await state()).contracts.some(
        (c) => c.name === "MicroTech circuit revised",
      ),
    );
    const beforeReminder = JSON.parse(
      JSON.stringify((await state()).contracts),
    );
    await nav("Cargo");
    const pickup = page.locator(".plan-group").first(),
      tressler = pickup.locator(".plan-stop").filter({
        has: page
          .locator("summary > strong")
          .filter({ hasText: "Port Tressler" }),
      });
    assert.match(await tressler.innerText(), /40 SCU/);
    assert.equal(await tressler.locator(".plan-line").count(), 2);
    assert.match(
      await tressler.locator(".plan-line").first().innerText(),
      /30 SCU/,
    );
    await tressler
      .getByRole("button", { name: /Mark pickup reminder for Titanium NB/ })
      .click();
    let s = await state();
    assert.equal(
      s.contracts
        .flatMap((c) => c.cargoObjectives)
        .filter((o) => o.checklist?.pickedUp).length,
      2,
    );
    assert(
      s.contracts.every((c) =>
        c.cargoObjectives.every(
          (o) => (o.loadedSCU ?? 0) === 0 && o.deliveredSCU === 0,
        ),
      ),
    );
    assert(
      s.contracts.every(
        (c) => c.status === "Active" && c.confirmedEarnings === 0,
      ),
    );
    await tressler
      .getByRole("button", { name: /Undo pickup reminder/ })
      .click();
    assert(
      (await state()).contracts.every((c) =>
        c.cargoObjectives.every((o) => !o.checklist?.pickedUp),
      ),
    );
    assert.equal(await page.locator(".cargo-progress-control").count(), 0);
    const planned = beforeReminder.reduce(
      (n, c) => n + c.cargoObjectives.reduce((a, o) => a + o.quantitySCU, 0),
      0,
    );
    assert.equal(planned, 60);
    const small = s.ships.find(
      (ship) => ship.cargoCapacitySCU > 0 && ship.cargoCapacitySCU < planned,
    );
    await page.evaluate((id) => window.cargoRun.selectShip(id), small.id);
    await page.getByText(/Planned cargo exceeds capacity/).waitFor();
    await page
      .locator(".topbar")
      .getByRole("button", { name: "Select ship", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Select ship",
      exact: true,
    });
    await picker
      .getByLabel("Search ships", { exact: true })
      .fill("C2 Hercules");
    await picker
      .getByRole("button", {
        name: "Select C2 Hercules Starlifter",
        exact: true,
      })
      .click();
    await until(async () => (await state()).selectedShipId === "c2");
    assert.match(
      await page.locator(".plan-utilization").innerText(),
      /60 \/ 696 SCU/,
    );
    // Landscape, portrait and minimum-size views keep title bar and all four destinations.
    for (const [w, h, label] of [
      [1440, 900, "landscape"],
      [720, 1100, "portrait"],
      [480, 560, "minimum"],
    ]) {
      await size(w, h);
      await nav("Contracts");
      await shot("contracts-" + label);
      await page
        .getByRole("button", { name: /Expand Orbital supplies/ })
        .click();
      await shot("contracts-expanded-" + label);
      await nav("Cargo");
      await shot("cargo-" + label);
      await page
        .locator(".plan-group")
        .first()
        .locator("summary")
        .first()
        .click();
      await shot("cargo-collapsed-" + label);
      await page
        .locator(".topbar")
        .getByRole("button", { name: "Select ship", exact: true })
        .click();
      await shot("ship-picker-" + label);
      await page
        .getByRole("dialog", { name: "Select ship", exact: true })
        .getByRole("button", { name: "Close panel", exact: true })
        .click();
      await nav("Settings");
      await shot("settings-" + label);
      await page
        .locator(".settings-section")
        .filter({
          has: page.locator("summary").filter({ hasText: /^Automation$/ }),
        })
        .locator("> summary")
        .click();
      assert.equal(
        await page
          .getByLabel("Automatic contract completion (Beta)", { exact: true })
          .isChecked(),
        false,
      );
      await page.locator(".top-add").click();
      await page
        .getByRole("dialog", { name: "Add Contract", exact: true })
        .waitFor();
      await shot("editor-" + label);
      await page.mouse.click(1, 150);
      assert(
        await page
          .getByRole("dialog", { name: "Add Contract", exact: true })
          .isVisible(),
      );
      await editorFocusCheck();
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].maximize(),
    );
    await nav("Contracts");
    await shot("contracts-maximized");
    await nav("Cargo");
    await shot("cargo-maximized");
    await size(1440, 900);
    await nav("Contracts");
    await page.getByLabel("Expand Orbital supplies", { exact: true }).click();
    await page
      .locator(".contract-expansion")
      .getByRole("button", { name: "Complete contract", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Complete contract?",
      exact: true,
    });
    await confirm
      .getByRole("button", { name: "Confirm completion", exact: true })
      .click();
    assert.equal(
      (await state()).contracts.find((c) => c.name === "Orbital supplies")
        .status,
      "Completed",
    );
    await page
      .getByLabel("Expand Manual foundation contract", { exact: true })
      .click();
    await page
      .locator(".contract-expansion")
      .getByRole("button", { name: "Abandon contract", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Abandon contract?", exact: true })
      .getByRole("button", { name: "Confirm abandonment", exact: true })
      .click();
    assert.equal(
      (await state()).contracts.find(
        (c) => c.name === "Manual foundation contract",
      ).status,
      "Abandoned",
    );
    await nav("History");
    assert.equal(
      await page.locator(".contracts-ledger > tbody > tr").count(),
      2,
    );
    assert.match(await page.locator(".history-summary").innerText(), /0 aUEC/);
    await shot("history-landscape");
    await page.getByLabel("Search history", { exact: true }).fill("Orbital");
    assert.equal(
      await page.locator(".contracts-ledger > tbody > tr").count(),
      1,
    );
    await page
      .getByRole("button", { name: "Clear history", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "History cleanup", exact: true })
      .getByRole("button", {
        name: "Clear closed contract history",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", {
          name: "Reset all local tracking data",
          exact: true,
        })
        .count(),
      0,
    );
    await page
      .getByRole("dialog", { name: "History cleanup", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    // Existing physical data is preserved and reachable only through the recovery surface.
    await page.evaluate(async () => {
      const s = await window.cargoRun.getState(),
        c = s.contracts.find((c) => c.status === "Active"),
        o = c.cargoObjectives[0];
      await window.cargoRun.cargoProgress({
        requestId: crypto.randomUUID(),
        shipId: s.selectedShipId,
        changes: [
          {
            objectiveId: o.id,
            action: "Load",
            quantity: 1,
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
      await window.cargoRun.completeContract(c.id);
    });
    await nav("Settings");
    await page
      .locator(".settings-section > summary")
      .filter({ hasText: /^Data Management$/ })
      .click();
    await page
      .getByRole("button", { name: "Open retained inventory", exact: true })
      .first()
      .click();
    const retained = page.getByRole("dialog", {
      name: "Retained onboard inventory",
      exact: true,
    });
    assert.match(await retained.innerText(), /1 SCU/);
    assert(
      await retained
        .getByRole("button", { name: "Unload cargo", exact: true })
        .isEnabled(),
    );
    await shot("retained-recovery");
    await retained.getByRole("button", { name: "Close", exact: true }).click();
    // The existing cleanup service blocks closed onboard cargo and exposes recovery.
    const blocker = await page.evaluate(async () => {
      try {
        await window.cargoRun.previewCleanup("closed");
        return "";
      } catch (e) {
        return String(e);
      }
    });
    assert.match(blocker, /cargo|onboard|unload/i);
    await page
      .getByRole("button", { name: "Open retained inventory", exact: true })
      .first()
      .click();
    await retained
      .getByRole("button", { name: "Unload cargo", exact: true })
      .click();
    await until(async () =>
      (await state()).contracts.every((c) =>
        c.cargoObjectives.every((o) => (o.loadedSCU ?? 0) === 0),
      ),
    );
    await retained.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(async () => {
      await window.cargoRun.saveContract({
        draft: {
          name: "Preserved active after cleanup",
          payout: 8000,
          objectives: [
            {
              commodity: "Quartz",
              quantitySCU: 2,
              pickupLocation: "Everus Harbor",
              destination: "Area18",
            },
          ],
        },
      });
    });
    await nav("History");
    await page
      .getByRole("button", { name: "Clear history", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "History cleanup", exact: true })
      .getByRole("button", {
        name: "Clear closed contract history",
        exact: true,
      })
      .click();
    const cleanupDialog = page.getByRole("dialog", {
      name: "Confirm local history cleanup",
      exact: true,
    });
    await cleanupDialog
      .getByRole("button", { name: "Confirm cleanup", exact: true })
      .click();
    await until(async () => (await state()).contracts.length === 1);
    assert.equal(
      (await state()).contracts[0].name,
      "Preserved active after cleanup",
    );
    const stats = await page.evaluate(() => window.cargoRun.localDataStats());
    assert(stats.lastBackup);
    assert(fs.existsSync(stats.lastBackup));
    await page
      .getByRole("dialog", { name: "History cleanup", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    const before = JSON.parse(JSON.stringify((await state()).contracts));
    await app.close();
    app = null;
    await launch();
    assert.deepEqual(
      JSON.parse(JSON.stringify((await state()).contracts)),
      before,
    );
    assert.equal((await state()).workflow.automaticCompletion, false);
    // Reset remains separately guarded, backed up, and leaves monitoring stopped.
    const resetBefore = await state();
    await nav("Settings");
    await page
      .locator(".settings-section > summary")
      .filter({ hasText: /^Data Management$/ })
      .click();
    await page
      .getByRole("button", {
        name: "Reset all local tracking data",
        exact: true,
      })
      .click();
    const reset = page.getByRole("dialog", {
      name: "Reset all local tracking data?",
      exact: true,
    });
    assert(
      !(await reset
        .getByRole("button", { name: "Confirm reset", exact: true })
        .isEnabled()),
    );
    await reset
      .getByLabel("Type RESET to confirm", { exact: true })
      .fill("RESET");
    await reset
      .getByRole("button", { name: "Confirm reset", exact: true })
      .click();
    await until(async () => (await state()).contracts.length === 0);
    assert.deepEqual((await state()).preferences, resetBefore.preferences);
    assert.equal((await state()).selectedShipId, resetBefore.selectedShipId);
    assert.equal((await state()).tracking.enabled, false);
    assert.equal((await ocr()).captures.length, 0);
    assert(
      fs.existsSync(
        (await page.evaluate(() => window.cargoRun.localDataStats()))
          .lastBackup,
      ),
    );
    await app.close();
    app = null;
    await launch();
    assert.equal((await state()).contracts.length, 0);
    assert.equal((await state()).tracking.enabled, false);
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 9);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
    assert.deepEqual(errors, []);
    assert(capturesBeforeSave.length >= 1);
    await page.evaluate(async () => {
      for (let i = 0; i < 31; i++) {
        const s = await window.cargoRun.saveContract({
          draft: {
            name: "History page " + i,
            payout: 0,
            objectives: [
              {
                commodity: "Quartz",
                pickupLocation: "Everus Harbor",
                destination: "Orison",
                quantitySCU: 1,
              },
            ],
          },
        });
        await window.cargoRun.completeContract(s.contracts.at(-1).id);
      }
    });
    await nav("History");
    assert.equal(
      await page.locator(".contracts-ledger > tbody > tr").count(),
      25,
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    assert.equal(
      await page.locator(".contracts-ledger > tbody > tr").count(),
      6,
    );
    await page
      .getByLabel("Search history", { exact: true })
      .fill("History page 30");
    assert.equal(
      await page.locator(".contracts-ledger > tbody > tr").count(),
      1,
    );
    assert.match(await page.locator(".pagination").innerText(), /Page 1 of 1/);
    const parentPid = app.process().pid;
    const rows = JSON.parse(
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", windowsHide: true },
      ),
    );
    const pids = rows
      .filter(
        (p) => p.ParentProcessId === parentPid && /CaptureHost/.test(p.Name),
      )
      .map((p) => p.ProcessId);
    await app.close();
    app = null;
    for (const pid of pids) {
      let alive = true;
      for (let i = 0; i < 30 && alive; i++) {
        try {
          process.kill(pid, 0);
          await new Promise((r) => setTimeout(r, 100));
        } catch {
          alive = false;
        }
      }
      assert.equal(alive, false, "Native helper must exit with Electron");
    }
    fs.writeFileSync(
      path.join(output, "viewports.json"),
      JSON.stringify(viewports, null, 2),
    );
    console.log(
      "PASS v0.8.0 four-section Windows foundation: manual editor/failure fallback, expandable ledger, multi-objective edit, route aggregation/reminder independence, capacity warning, landscape/portrait/minimum overflow, dialogs, completion/abandonment, History/cleanup safeguards, retained inventory, restart/schema9/FK. Synthetic profile: " +
        folder,
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
