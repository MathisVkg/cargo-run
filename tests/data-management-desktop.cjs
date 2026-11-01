const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/data-management-desktop-"));
assert(folder.startsWith(path.resolve("work") + path.sep));
const log = path.join(folder, "Game.log"),
  env = { ...process.env, NODE_ENV: "test", CARGO_RUN_TEST_USER_DATA: folder };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [],
  backups = [];
function note(title, id, time = new Date().toISOString()) {
  return (
    "<" +
    time +
    '> [Notice] Added notification "Contract Accepted: ' +
    title +
    '" MissionId: [' +
    id +
    "]\n"
  );
}
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
  if (await main.isVisible())
    await main.getByRole("button", { name, exact: true }).click();
  else {
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Temporary navigation" })
      .getByRole("button", { name, exact: true })
      .click();
  }
}
async function until(check) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Maintenance condition timed out");
}
async function cleanup(label, reset = false) {
  const section = page.locator(".local-data-management");
  await section.getByRole("button", { name: label, exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: reset
      ? "Reset all local tracking data?"
      : "Confirm local history cleanup",
    exact: true,
  });
  await dialog.waitFor();
  await page.mouse.click(2, 350);
  assert(await dialog.isVisible());
  if (reset) {
    assert.equal(
      await dialog
        .getByRole("button", { name: "Confirm reset", exact: true })
        .isEnabled(),
      false,
    );
    await dialog
      .getByLabel("Type RESET to confirm", { exact: true })
      .fill("RESET");
  }
  await page.screenshot({
    path:
      "work/data-preview-" +
      (reset ? "reset" : backups.length === 0 ? "closed" : "history") +
      ".png",
    animations: "disabled",
  });
  await dialog
    .getByRole("button", {
      name: reset ? "Confirm reset" : "Confirm cleanup",
      exact: true,
    })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await until(
    async () =>
      !!(await page.evaluate(() => window.cargoRun.localDataStats()))
        .lastBackup,
  );
  const stats = await page.evaluate(() => window.cargoRun.localDataStats());
  assert(stats.lastBackup.startsWith(path.join(folder, "backups") + path.sep));
  backups.push(stats.lastBackup);
  assert(exists(stats.lastBackup, "cargo-run.sqlite"));
  assert(exists(stats.lastBackup, "manifest.json"));
  assert.equal((await state()).tracking.importing, false);
  assert.equal(
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .isVisible(),
    true,
  );
  return stats;
}
function exists(dir, file) {
  return fs.existsSync(path.join(dir, file));
}
(async () => {
  try {
    fs.writeFileSync(
      log,
      note(
        "Junior Rank - Small Cargo Haul",
        randomUUID(),
        "2026-11-01T11:13:05Z",
      ) +
        note(
          "Junior Rank - Small Cargo Haul",
          randomUUID(),
          "2026-11-01T19:55:29Z",
        ),
    );
    await launch();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, log);
    await page.evaluate(() => window.cargoRun.chooseLog());
    await page.evaluate(() => window.cargoRun.importHistory());
    assert.equal((await state()).contracts.length, 0);
    assert.equal((await state()).tracking.pendingMissions, 2);
    await app.close();
    app = null;
    const ids = [randomUUID(), randomUUID()],
      png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuUAAAAASUVORK5CYII=",
        "base64",
      ),
      db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    fs.mkdirSync(path.join(folder, "captures"), { recursive: true });
    for (let i = 0; i < 2; i++) {
      const f = JSON.parse(
        fs.readFileSync(
          "tests/fixtures/mobiglas/" +
            (i === 0
              ? "9ccc7ea4-c6f6-49bc-8bfc-701980e610da"
              : "88825398-27e5-4561-9516-c717ae7e750b") +
            ".json",
          "utf8",
        ),
      );
      if (i === 0) {
        let n = 0;
        f.result.lines = f.result.lines.map((l) => ({
          ...l,
          text: /Deliver 0\/\d+ SCU/.test(l.text)
            ? l.text.replace(/0\/\d+/, "0/" + [4, 5, 5, 4][n++])
            : l.text,
        }));
        f.result.text = f.result.lines.map((l) => l.text).join("\n");
      }
      for (const suffix of [".png", ".thumb.png"])
        fs.writeFileSync(path.join(folder, "captures", ids[i] + suffix), png);
      db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
        ids[i],
        JSON.stringify({
          id: ids[i],
          capturedAt: new Date().toISOString(),
          source: "Manual",
          status: "Processed",
          displayId: "fixture",
          displayLabel: "Repository OCR and generated preview",
          screenshot: ids[i] + ".png",
          width: f.result.width,
          height: f.result.height,
          bytes: png.length,
          attempts: 1,
          error: null,
          result: f.result,
          observation: null,
        }),
      );
    }
    db.close();
    await launch();
    await page.evaluate((id) => window.cargoRun.ocrReparse(id), ids[0]);
    const imported = (await state()).contracts[0];
    assert.equal(imported.payout, 65250);
    assert.equal(
      imported.cargoObjectives.reduce((n, o) => n + o.quantitySCU, 0),
      18,
    );
    assert.equal(imported.missionId, undefined);
    const outcome = (
      await page.evaluate(() => window.cargoRun.ocrState())
    ).captures.find((c) => c.id === ids[0]).importResult;
    assert.equal(outcome.status, "Imported");
    assert.equal(
      outcome.matchingDiagnostics.filter((d) => d.decision === "Excluded")
        .length,
      2,
    );
    await nav("Scan History");
    const entry = page.locator('[data-capture-id="' + ids[0] + '"]');
    assert.match(await entry.innerText(), /Imported/);
    assert.equal(
      await entry
        .getByRole("button", { name: "Resolve issue", exact: true })
        .count(),
      0,
    );
    await entry
      .getByRole("button", { name: "Edit details / Advanced", exact: true })
      .click();
    await entry
      .getByText("OCR evidence and diagnostics", { exact: true })
      .click();
    assert.match(
      await entry.locator(".ocr-raw").last().innerText(),
      /title-only mission/,
    );
    await page.screenshot({
      path: "work/matching-diagnostics-v053.png",
      animations: "disabled",
    });
    await page.evaluate(
      (id) => window.cargoRun.completeContract(id),
      imported.id,
    );
    await page.evaluate((id) => window.cargoRun.ocrReparse(id), ids[1]);
    const activeOcr = (await state()).contracts.find(
      (c) => c.status === "Active",
    );
    await page.evaluate(async () => {
      for (const name of [
        "Retained active",
        "Closed manual",
        "Abandoned manual",
      ])
        await window.cargoRun.saveContract({
          draft: {
            name,
            payout: 1000,
            objectives: [
              {
                commodity: name,
                pickupLocation: "Everus Harbor",
                destination: "Area18",
                quantitySCU: 3,
              },
            ],
          },
        });
      const s = await window.cargoRun.getState();
      await window.cargoRun.completeContract(
        s.contracts.find((c) => c.name === "Closed manual").id,
      );
      await window.cargoRun.abandonContract(
        s.contracts.find((c) => c.name === "Abandoned manual").id,
      );
      await window.cargoRun.finishRun();
      await window.cargoRun.selectShip("hull-c");
      await window.cargoRun.setPreferences({
        favoriteShipIds: ["hull-c"],
        navigationMode: "compact",
      });
      const o = await window.cargoRun.ocrState();
      await window.cargoRun.ocrConfigure({
        ...o.settings,
        accelerator: "F8",
        sounds: false,
      });
    });
    await nav("Settings");
    const before = await state(),
      rawLog = fs.readFileSync(log, "utf8");
    await page.locator(".local-data-management").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "work/local-data-v053.png",
      animations: "disabled",
    });
    const first = await cleanup("Clear closed contract history");
    assert.equal(first.total, 2);
    assert.equal(first.active, 2);
    assert.equal(first.finishedRuns, 1);
    assert.equal(first.captures, 2);
    assert(exists(folder, "captures/" + ids[1] + ".png"));
    assert.equal(
      (
        await page.evaluate(
          (id) => window.cargoRun.contractEvidence(id),
          activeOcr.id,
        )
      ).length,
      1,
    );
    assert.equal((await state()).currentRun.id, before.currentRun.id);
    await page.evaluate(async () => {
      await window.cargoRun.saveContract({
        draft: {
          name: "Another closed record",
          payout: null,
          objectives: [
            {
              commodity: "Separate cargo",
              pickupLocation: "Orison",
              destination: "Lorville",
              quantitySCU: 1,
            },
          ],
        },
      });
      const s = await window.cargoRun.getState();
      await window.cargoRun.completeContract(
        s.contracts.find((c) => c.name === "Another closed record").id,
      );
      await window.cargoRun.finishRun();
    });
    const second = await cleanup("Clear contract and run history");
    assert.equal(second.total, 2);
    assert.equal(second.finishedRuns, 0);
    assert.equal(second.captures, 2);
    await page.evaluate(async () => {
      const o = await window.cargoRun.ocrState();
      await window.cargoRun.ocrConfigurePolicy({
        ...o.policy,
        autoEnabled: true,
        delaySeconds: 10,
        maxAttempts: 1,
      });
      await window.cargoRun.startMonitoring();
    });
    fs.appendFileSync(log, note("Reset Pending Cargo", randomUUID()));
    await until(async () =>
      (
        await page.evaluate(() => window.cargoRun.ocrState())
      ).automaticRequests.some((r) => r.status === "Pending"),
    );
    const lastRevision = (await page.evaluate(() => window.cargoRun.ocrState()))
        .revision,
      source = fs.readFileSync(log, "utf8");
    await cleanup("Reset all local tracking data", true);
    assert.equal((await state()).contracts.length, 0);
    assert.equal((await state()).runs.length, 0);
    assert.equal((await state()).tracking.enabled, false);
    assert.equal((await state()).tracking.status, "OFFLINE");
    assert.equal((await state()).selectedShipId, "hull-c");
    assert.deepEqual((await state()).preferences.favoriteShipIds, ["hull-c"]);
    assert.equal(fs.readFileSync(log, "utf8"), source);
    assert(source.startsWith(rawLog));
    let o = await page.evaluate(() => window.cargoRun.ocrState());
    assert.equal(o.captures.length, 0);
    assert.equal(o.automaticRequests.length, 0);
    assert(o.revision > lastRevision);
    assert.equal(o.settings.accelerator, "F8");
    assert.equal(o.policy.autoEnabled, true);
    assert.equal(
      fs.existsSync(path.join(folder, "captures", ids[0] + ".png")),
      false,
    );
    assert(exists(backups[2], "captures/" + ids[1] + ".png"));
    await nav("Scan History");
    await page.getByText("No captures yet", { exact: true }).waitFor();
    await nav("Dashboard");
    assert.equal((await state()).contracts.length, 0);
    await nav("Settings");
    await page.screenshot({
      path: "work/local-data-reset-v053.png",
      animations: "disabled",
    });
    for (const folder of backups) {
      const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
        readOnly: true,
      });
      assert.equal(
        db.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      db.close();
    }
    assert.equal(new Set(backups).size, 3);
    await app.close();
    app = null;
    await launch();
    assert.equal((await state()).tracking.enabled, false);
    assert.equal((await state()).contracts.length, 0);
    assert.equal((await state()).selectedShipId, "hull-c");
    assert.deepEqual((await state()).preferences.favoriteShipIds, ["hull-c"]);
    assert.equal((await state()).tracking.path, log);
    await page.evaluate(async () => {
      const o = await window.cargoRun.ocrState();
      await window.cargoRun.ocrConfigurePolicy({
        ...o.policy,
        autoEnabled: false,
      });
      await window.cargoRun.startMonitoring();
    });
    assert.equal((await state()).tracking.accepted, 0);
    fs.appendFileSync(log, note("First New Cargo After Reset", randomUUID()));
    await until(async () => (await state()).tracking.accepted === 1);
    await page.evaluate(() => window.cargoRun.stopMonitoring());
    await page.evaluate(() => window.cargoRun.importHistory());
    assert.equal((await state()).tracking.accepted, 4);
    const final = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.deepEqual(final.prepare("PRAGMA foreign_key_check").all(), []);
    final.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.5.3 actual Windows isolated profile: empty Dashboard + two unknown-cargo pending Junior missions auto-imports 65250/18 OCR unbound with Advanced exclusion diagnostics; all three cleanup previews and guarded RESET; unique consistent DB/evidence backups; active evidence/current-run/preferences preserved; immediate Settings/Dashboard/Scan History refresh; pending automatic cancellation; OCR revision continuity; reset/restart stays stopped; fresh tail monitoring/no replay and explicit history import; Game.log unchanged; foreign keys valid.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/data-management-failure.png",
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
