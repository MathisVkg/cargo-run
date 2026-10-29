// Isolated real Electron workflow with genuine offline OCR exports and original screenshot previews.
const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/automatic-import-desktop-")),
  env = { ...process.env, NODE_ENV: "test", CARGO_RUN_TEST_USER_DATA: folder };
delete env.ELECTRON_RUN_AS_NODE;
delete env.CARGO_RUN_INPUT_PROTOTYPE;
delete env.CARGO_RUN_SHORTCUT_BACKEND;
delete env.CARGO_RUN_SHORTCUT_COMPARE;
let app, page;
const errors = [],
  ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const agricultural = JSON.parse(
    fs.readFileSync(
      "tests/fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
      "utf8",
    ),
  ),
  multi = JSON.parse(
    fs.readFileSync(
      "tests/fixtures/mobiglas/9ccc7ea4-c6f6-49bc-8bfc-701980e610da.json",
      "utf8",
    ),
  );
async function launch() {
  app = await _electron.launch({
    args: [path.resolve("out/main/index.js")],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
}
async function nav(name) {
  await page.getByLabel("Open navigation", { exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
}
const state = () => page.evaluate(() => window.cargoRun.getState());
const reparse = (id) =>
  page.evaluate((id) => window.cargoRun.ocrReparse(id), id);
function note(text, mission, obj) {
  return (
    '<2026-10-29T08:00:00.000Z> <SHUDEvent_OnNotification> Added notification "' +
    text +
    ':" ... MissionId: [' +
    mission +
    "]" +
    (obj ? ", ObjectiveId: [" + obj + "]" : "")
  );
}
(async () => {
  try {
    await launch();
    const saved = await page.evaluate(async () => {
      await window.cargoRun.saveContract({
        draft: {
          name: "Preserved manual contract",
          payout: null,
          objectives: [
            {
              commodity: "Titanium",
              pickupLocation: "Everus Harbor",
              destination: "Lorville",
              quantitySCU: 3,
            },
          ],
        },
      });
      await window.cargoRun.finishRun();
      return window.cargoRun.getState();
    });
    await app.close();
    app = null;
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    db.exec("DROP TABLE pending_log_missions; PRAGMA user_version=4;");
    const missing = structuredClone(agricultural);
    missing.result.lines = missing.result.lines.filter(
      (l) => !/Collect Agricultural|^Spaceport\./i.test(l.text),
    );
    missing.result.text = missing.result.lines.map((l) => l.text).join("\n");
    const fixtures = [agricultural, agricultural, multi, missing];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i],
        f = fixtures[i],
        source = path.join(
          process.env.APPDATA,
          "Cargo Run",
          "captures",
          f.source.filename,
        );
      const hasImage = fs.existsSync(source);
      if (hasImage)
        for (const suffix of [".png", ".thumb.png"])
          fs.copyFileSync(source, path.join(folder, "captures", id + suffix));
      db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
        id,
        JSON.stringify({
          id,
          capturedAt: new Date().toISOString(),
          source: "Manual",
          status: "Processed",
          displayId: "fixture",
          displayLabel: hasImage
            ? "Genuine saved game image"
            : "Original image unavailable; genuine OCR export",
          screenshot: hasImage ? id + ".png" : null,
          width: f.result.width,
          height: f.result.height,
          bytes: 0,
          attempts: 1,
          error: null,
          result: f.result,
          observation: null,
        }),
      );
    }
    db.close();
    await launch();
    assert.equal((await state()).contracts[0].id, saved.contracts[0].id);
    assert.deepEqual(
      (await state()).runs,
      JSON.parse(JSON.stringify(saved.runs)),
    );
    await reparse(ids[0]);
    let s = await state();
    assert.equal(s.contracts.length, 2);
    const imported = s.contracts.find((c) => c.source === "OCR");
    assert.equal(imported.payout, 34500);
    assert.equal(imported.acceptedAt, null);
    assert.equal(imported.cargoObjectives[0].quantitySCU, 8);
    assert.equal(s.tracking.enabled, false);
    await nav("Scan History");
    await page
      .getByRole("heading", { name: "Scan History & Issues", exact: true })
      .waitFor();
    const first = page.locator('[data-capture-id="' + ids[0] + '"]');
    assert.match(await first.innerText(), /Imported/);
    assert.match(await first.innerText(), /Dashboard and Manifest updated/);
    assert.equal(
      await page
        .getByRole("button", { name: "Check changes", exact: true })
        .count(),
      0,
    );
    await first.getByRole("button", { name: /Preview/ }).click();
    await page.locator(".full-screenshot img").evaluate((img) => img.decode());
    await page.keyboard.press("Escape");
    await reparse(ids[0]);
    assert.equal((await state()).contracts.length, 2);
    await reparse(ids[1]);
    const duplicate = page.locator('[data-capture-id="' + ids[1] + '"]');
    assert.match(await duplicate.innerText(), /Ambiguous match/);
    await duplicate
      .getByRole("button", { name: "Resolve issue", exact: true })
      .click();
    await duplicate
      .getByRole("button", { name: /Rookie Rank.*8 SCU.*OCR/ })
      .click();
    await duplicate
      .getByRole("button", { name: "Save corrected scan", exact: true })
      .click();
    await duplicate.getByText("Updated", { exact: true }).waitFor();
    assert.equal((await state()).contracts.length, 2);
    assert.equal(
      (
        await page.evaluate(
          (id) => window.cargoRun.contractEvidence(id),
          imported.id,
        )
      ).length,
      2,
    );
    const mission = "7a9edaaa-aa44-4c3c-9be5-ccff802e525b",
      file = path.join(folder, "Game.log");
    const objectiveText = multi.result.text;
    assert.match(objectiveText, /7 SCU/);
    const objectives = [
      ["Pressurized Ice", 7, "Rayari Cantwell Research Outpost on Clio"],
      ["Pressurized Ice", 6, "Rayari McGrath Research Outpost on Clio"],
      ["Processed Food", 7, "Rayari Cantwell Research Outpost on Clio"],
      ["Processed Food", 5, "Rayari McGrath Research Outpost on Clio"],
    ];
    fs.writeFileSync(
      file,
      [
        note("Contract Accepted: Junior Rank - Small Cargo Haul", mission),
        ...objectives.map(([commodity, qty, dest], i) =>
          note(
            "New Objective: Deliver 0/" +
              qty +
              " SCU of " +
              commodity +
              " to " +
              dest,
            mission,
            "objective-" + i,
          ),
        ),
      ].join("\n") + "\n",
    );
    await nav("Settings");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
    await page
      .getByRole("button", { name: "Select Game.log", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import existing history", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm import", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.cargoRun.getState().then((s) => s.tracking.accepted === 1),
    );
    assert.equal((await state()).contracts.length, 2);
    await reparse(ids[2]);
    s = await state();
    assert.equal(s.contracts.length, 3);
    const verified = s.contracts.find((c) => c.missionId === mission);
    assert.equal(verified.payout, 65250);
    assert.equal(verified.cargoObjectives.length, 4);
    await nav("Scan History");
    const multiCard = page.locator('[data-capture-id="' + ids[2] + '"]');
    assert.match(await multiCard.innerText(), /Updated|Imported/);
    assert.equal(
      await multiCard
        .getByRole("button", { name: "Resolve issue", exact: true })
        .count(),
      0,
    );
    await reparse(ids[3]);
    const correction = page.locator('[data-capture-id="' + ids[3] + '"]');
    await correction
      .getByRole("button", { name: "Resolve issue", exact: true })
      .click();
    await correction
      .getByRole("button", { name: /Rookie Rank.*8 SCU.*OCR/ })
      .click();
    await correction
      .getByLabel("Correct pickupLocation 1", { exact: true })
      .fill("NB Int. Spaceport");
    assert.equal(
      await correction
        .locator(
          ".compact-scan-issue input:not([type=checkbox]):not([type=radio])",
        )
        .count(),
      1,
    );
    await correction.getByLabel(/I checked the full objective list/).check();
    await correction
      .getByRole("button", { name: "Save corrected scan", exact: true })
      .click();
    await correction.getByText("Updated", { exact: true }).waitFor();
    assert.equal(await correction.locator(".compact-scan-issue").count(), 0);
    await page.screenshot({
      path: "work/scan-history-v041.png",
      animations: "disabled",
      fullPage: true,
    });
    await nav("Dashboard");
    assert.match(await page.locator(".stats-grid").innerText(), /99,750/);
    await nav("Manifest");
    await page
      .getByRole("heading", { name: "Cargo Manifest", exact: true })
      .waitFor();
    await nav("History");
    assert.equal(await page.locator(".history-table tbody tr").count(), 3);
    const row = page
      .locator(".history-table tbody tr")
      .filter({ hasText: "Rookie Rank - Direct Small Cargo Haul" });
    await row.getByRole("button", { name: /Details for/ }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Unlink evidence", exact: true })
        .count(),
      3,
    );
    await page.keyboard.press("Escape");
    const before = JSON.parse(JSON.stringify((await state()).contracts));
    await app.close();
    app = null;
    await launch();
    assert.deepEqual((await state()).contracts, before);
    assert.deepEqual(
      (await state()).runs,
      JSON.parse(JSON.stringify(saved.runs)),
    );
    await page.evaluate(() => window.cargoRun.startMonitoring());
    fs.appendFileSync(
      file,
      note("Contract Complete: Junior Rank - Small Cargo Haul", mission) + "\n",
    );
    await page.waitForFunction(
      (m) =>
        window.cargoRun
          .getState()
          .then(
            (s) =>
              s.contracts.find((c) => c.missionId === m)?.status ===
              "Completed",
          ),
      mission,
    );
    assert.equal(
      (await state()).contracts.find((c) => c.missionId === mission)
        .confirmedEarnings,
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.4.1 Windows: additive v4 migration preserving ledger/runs; genuine 34500/8 SCU automatic OCR-only import with monitoring off; visible import success without Check Changes; screenshot preview; repeated-id idempotence; compact duplicate choice; log acceptance pending-only; unique multi-objective promotion; single-field pickup correction; Dashboard/Manifest/History/evidence; restart; later live completion with zero invented earnings.",
    );
  } catch (e) {
    console.error(e);
    if (page)
      await page
        .screenshot({ path: "work/automatic-import-failure.png" })
        .catch(() => {});
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
})();
