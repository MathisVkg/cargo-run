const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/lifecycle-desktop-")),
  log = path.join(folder, "Game.log"),
  env = { ...process.env, NODE_ENV: "test", CARGO_RUN_TEST_USER_DATA: folder };
delete env.ELECTRON_RUN_AS_NODE;
fs.writeFileSync(log, "");
let app, page;
const errors = [],
  ids = [randomUUID(), randomUUID(), randomUUID()],
  missions = [randomUUID(), randomUUID(), randomUUID()];
const time = new Date(Date.now() - 5000).toISOString();
async function launch() {
  app = await _electron.launch({
    args: [path.resolve("out/main/index.js")],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await resize(1440, 900);
  await page
    .getByRole("heading", { name: "Cargo Operations", exact: true })
    .waitFor();
  await require("./helpers/beta-desktop.cjs")(page);
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
}
async function resize(w, h) {
  await app.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win.isMaximized()) win.unmaximize();
      win.setSize(w, h);
    },
    [w, h],
  );
  await page.waitForFunction((w) => innerWidth === w, w);
}
const state = () => page.evaluate(() => window.cargoRun.getState());
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Lifecycle test condition timed out");
}
async function nav(name) {
  if (
    !(await page
      .getByRole("navigation", { name: "Main navigation" })
      .isVisible())
  )
    await page.getByLabel("Open navigation", { exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
function note(text, m, o) {
  return (
    "<" +
    time +
    '> Added notification "' +
    text +
    '" MissionId: [' +
    m +
    "]" +
    (o ? ", ObjectiveId: [" + o + "]" : "") +
    "\n"
  );
}
function append(s) {
  fs.appendFileSync(log, s);
}
async function geometry(mode) {
  const g = await page.locator(".sidebar." + mode).evaluate((e) => {
    const b = e.getBoundingClientRect(),
      p = e.querySelector(".sidebar-primary").getBoundingClientRect(),
      s = e.querySelector(".sidebar-secondary").getBoundingClientRect(),
      toggle = e.querySelector(".sidebar-mode-toggle");
    return {
      primary: e.querySelectorAll(".sidebar-primary button").length,
      bottom: b.bottom - s.bottom,
      separate: s.top - p.bottom,
      text: toggle.textContent.trim(),
      buttons: e.querySelectorAll(".sidebar-mode-toggle").length,
      settings: e
        .querySelector(".sidebar-secondary >button")
        .getAttribute("aria-label"),
    };
  });
  assert.equal(g.primary, 5);
  assert.equal(g.settings, "Settings");
  assert(g.bottom <= 24 && g.bottom >= 0);
  assert(g.separate > 100);
  assert.equal(g.text, "");
  assert.equal(g.buttons, 1);
}
async function cargo(c, action, q) {
  await page.evaluate(
    async ({ id, action, q }) => {
      const s = await window.cargoRun.getState(),
        c = s.contracts.find((c) => c.id === id),
        o = c.cargoObjectives[0];
      await window.cargoRun.cargoProgress({
        requestId: crypto.randomUUID(),
        shipId: s.selectedShipId,
        changes: [
          {
            objectiveId: o.id,
            action,
            quantity: q,
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
    { id: c.id, action, q },
  );
}
(async () => {
  try {
    await launch();
    await app.close();
    app = null;
    const fixture = JSON.parse(
        fs.readFileSync(
          "tests/fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
          "utf8",
        ),
      ).result,
      db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    for (let i = 0; i < 3; i++) {
      const r = structuredClone(fixture),
        title = [
          "First synthetic cargo haul",
          "Second synthetic cargo haul",
          "Third synthetic cargo haul",
        ][i],
        commodity = ["Agricultural Supplies", "Titanium", "Aluminum"][i];
      r.lines = r.lines.map((l) => ({
        ...l,
        text: l.text
          .replace("Rookie Rank - Direct Small Cargo Haul", title)
          .replaceAll("Agricultural Supplies", commodity),
      }));
      r.text = r.lines.map((l) => l.text).join("\n");
      db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
        ids[i],
        JSON.stringify({
          id: ids[i],
          capturedAt: new Date(Date.now() - 1800000).toISOString(),
          source: "Manual",
          status: "Processed",
          displayId: "fixture",
          displayLabel: "Repository OCR coordinates",
          screenshot: null,
          width: r.width,
          height: r.height,
          bytes: 0,
          attempts: 1,
          error: null,
          result: r,
        }),
      );
    }
    db.close();
    await launch();
    await geometry("expanded");
    assert.equal(
      await page
        .getByRole("button", { name: "Collapse navigation", exact: true })
        .innerText(),
      "",
    );
    await page.screenshot({
      path: "work/navigation-expanded-v061.png",
      animations: "disabled",
    });
    await page.getByLabel("Collapse navigation", { exact: true }).click();
    await page.locator(".sidebar.compact").waitFor();
    await geometry("compact");
    await page.getByLabel("Hide navigation", { exact: true }).click();
    await page.locator(".sidebar").waitFor({ state: "hidden" });
    const hiddenX = await page
      .locator("main")
      .evaluate((e) => e.getBoundingClientRect().x);
    assert.equal(hiddenX, 0);
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.locator(".sidebar.compact").waitFor();
    await page.screenshot({
      path: "work/navigation-compact-v061.png",
      animations: "disabled",
    });
    await page.getByLabel("Expand navigation", { exact: true }).click();
    await resize(1100, 700);
    await page.locator(".sidebar").waitFor({ state: "hidden" });
    assert.equal((await state()).preferences.navigationMode, "expanded");
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.locator(".sidebar.compact").waitFor();
    await geometry("compact");
    assert(
      await page.getByLabel("Expand navigation", { exact: true }).isDisabled(),
    );
    await page.screenshot({
      path: "work/navigation-narrow-v061.png",
      animations: "disabled",
    });
    await page.getByLabel("Hide navigation", { exact: true }).click();
    await resize(1440, 900);
    await page.locator(".sidebar.expanded").waitFor();
    await page.getByRole("button", { name: "Maximize", exact: true }).click();
    await page
      .getByRole("button", { name: "Restore window", exact: true })
      .waitFor();
    await geometry("expanded");
    await page
      .getByRole("button", { name: "Restore window", exact: true })
      .click();
    await resize(1440, 900);
    await page.evaluate((id) => window.cargoRun.ocrReparse(id), ids[0]);
    let s = await state(),
      first = s.contracts.find((c) => c.name === "First synthetic cargo haul");
    assert(first);
    await cargo(first, "Load", 8);
    await cargo(first, "Deliver", 5);
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, log);
    await page.evaluate(async () => {
      await window.cargoRun.chooseLog();
      await window.cargoRun.startMonitoring();
    });
    append(
      "<" +
        time +
        "> MissionEnded MissionId: [" +
        missions[0] +
        "] mission_state MISSION_STATE_COMPLETED\n",
    );
    await until(async () => (await state()).tracking.completed === 1);
    assert.equal((await state()).contracts[0].status, "Active");
    append(note("Contract Complete: " + first.name, missions[0]));
    await until(async () => (await state()).lifecycleIssues.length === 1);
    await nav("Dashboard");
    const panel = page.getByRole("region", {
      name: "Mission lifecycle reconciliation",
    });
    await panel
      .getByRole("button", { name: "Choose another contract", exact: true })
      .click();
    await panel
      .getByLabel("Tracked contract for " + missions[0], { exact: true })
      .selectOption(first.id);
    const apply = panel.getByRole("button", {
      name: "Confirm match",
      exact: true,
    });
    assert(await apply.isDisabled());
    await panel.getByLabel("These refer to the same in-game mission").check();
    await page.screenshot({
      path: "work/lifecycle-association-v061.png",
      animations: "disabled",
    });
    await apply.click();
    await until(
      async () =>
        (await state()).contracts.find((c) => c.id === first.id).status ===
        "Completed",
    );
    s = await state();
    assert.equal(s.lifecycleIssues.length, 0);
    assert.equal(s.contracts[0].cargoObjectives[0].loadedSCU, 3);
    assert.equal(s.contracts[0].cargoObjectives[0].deliveredSCU, 5);
    assert.equal(s.contracts[0].completedAt, time);
    append(
      "<" +
        time +
        "> EndMission MissionId: [" +
        missions[0] +
        "] CompletionType[Complete] Reason[Mission Ended]\n" +
        note("Contract Complete: " + first.name, missions[0]) +
        note("Awarded 61500 aUEC", ""),
    );
    await until(async () =>
      (await state()).tracking.events.some(
        (e) => e.kind === "Unattributed reward",
      ),
    );
    assert.equal(
      (
        await page.evaluate(
          (id) => window.cargoRun.lifecycleHistory(id),
          first.id,
        )
      ).length,
      1,
    );
    assert.equal((await state()).contracts[0].confirmedEarnings, 0);
    await nav("Manifest");
    await page
      .locator(".retained-cargo")
      .filter({ hasText: first.name })
      .waitFor();
    await page.screenshot({
      path: "work/lifecycle-retained-v061.png",
      animations: "disabled",
    });
    for (let i = 1; i < 3; i++) {
      const title = [
          "",
          "Second synthetic cargo haul",
          "Third synthetic cargo haul",
        ][i],
        commodity = i === 1 ? "Titanium" : "Aluminum";
      append(
        note("Contract Accepted: " + title, missions[i]) +
          note(
            "New Objective: Deliver 0/8 SCU of " +
              commodity +
              " to Port Tressler above microTech",
            missions[i],
            randomUUID(),
          ),
      );
      await until(async () => (await state()).tracking.accepted >= i);
      await page.evaluate((id) => window.cargoRun.ocrReparse(id), ids[i]);
      await until(async () =>
        (await state()).contracts.some((c) => c.missionId === missions[i]),
      );
      const c = (await state()).contracts.find(
        (c) => c.missionId === missions[i],
      );
      if (i === 2) await cargo(c, "Load", 2);
      append(
        "<" +
          time +
          "> MissionEnded MissionId: [" +
          missions[i] +
          "] mission_state MISSION_STATE_" +
          (i === 1 ? "COMPLETED" : "ABANDONED") +
          "\n",
      );
      await until(
        async () =>
          (await state()).contracts.find(
            (x) => x.id === c.id && x.missionId === missions[i],
          ).status !== "Active",
      );
    }
    s = await state();
    assert.equal(s.contracts.filter((c) => c.status === "Active").length, 0);
    assert.equal(
      s.contracts.find((c) => c.missionId === missions[1]).cargoObjectives[0]
        .loadEvidence,
      "Unknown",
    );
    assert.equal(
      s.contracts.find((c) => c.missionId === missions[2]).cargoObjectives[0]
        .loadedSCU,
      2,
    );
    await nav("History");
    await page
      .getByRole("button", { name: "Details for " + first.name, exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Mission Lifecycle", exact: true })
      .waitFor();
    await page.screenshot({
      path: "work/lifecycle-history-v061.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    const before = JSON.parse(JSON.stringify((await state()).contracts)),
      raw = fs.readFileSync(log, "utf8");
    await page.evaluate(() => window.cargoRun.stopMonitoring());
    await app.close();
    app = null;
    await launch();
    assert.deepEqual((await state()).contracts, before);
    assert.equal((await state()).preferences.navigationMode, "expanded");
    assert.equal(fs.readFileSync(log, "utf8"), raw);
    assert.equal(
      (
        await page.evaluate(
          (id) => window.cargoRun.lifecycleHistory(id),
          first.id,
        )
      ).length,
      1,
    );
    const final = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.deepEqual(final.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(final.prepare("PRAGMA user_version").get().user_version, 9);
    final.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.6.1 isolated Windows: native owned-log monitoring; OCR-first unbound completion issue/explicit association without rescan; verified automatic completion and abandonment; terminal duplicates/reward isolation; cargo/ship discrepancy retained; immediate Dashboard/Manifest/History refresh; lifecycle audit and restart; expanded/compact/hidden/narrow/maximized navigation, anchored Settings/icon toggle and preferences; FK integrity.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/lifecycle-failure-v061.png",
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
