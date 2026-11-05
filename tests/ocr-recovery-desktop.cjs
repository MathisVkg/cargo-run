const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID, createHash } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite"),
  { execFileSync } = require("node:child_process");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/recovery-desktop-")),
  exe = path.join(folder, "OcrRecoveryFixture.exe"),
  png = path.join(folder, "fixture.png"),
  log = path.join(folder, "Game.log");
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
    "/out:" + exe,
    path.resolve("tests/native/OcrRecoveryFixture.cs"),
  ],
  { windowsHide: true, stdio: "inherit" },
);
execFileSync(exe, [png], { windowsHide: true });
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: folder,
};
delete env.ELECTRON_RUN_AS_NODE;
const id = randomUUID(),
  mission = "11111111-1111-4111-8111-111111111111",
  fixtureLog = fs
    .readFileSync("tests/fixtures/log/nov05-sanitized.log", "utf8")
    .trim()
    .split(/\r?\n/);
fs.writeFileSync(log, "");
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({
    args: [path.resolve("out/main/index.js")],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 900),
  );
  await page
    .getByRole("heading", { name: "Cargo Operations", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Loading saved operations"),
  );
}
const state = () => page.evaluate(() => window.cargoRun.getState()),
  ocr = () => page.evaluate(() => window.cargoRun.ocrState());
async function until(fn) {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  console.log(JSON.stringify(await ocr()));
  throw Error("Recovery Windows condition timed out");
}
async function nav(name) {
  const n = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  if (!(await n.isVisible()))
    await page.getByLabel("Open navigation", { exact: true }).click();
  await n.getByRole("button", { name, exact: true }).click();
}
async function cargo(action, q) {
  await page.evaluate(
    async ({ action, q }) => {
      const s = await window.cargoRun.getState(),
        o = s.contracts[0].cargoObjectives[0];
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
    { action, q },
  );
}
(async () => {
  try {
    await launch();
    await app.close();
    app = null;
    fs.mkdirSync(path.join(folder, "captures"), { recursive: true });
    for (const suffix of [".png", ".thumb.png"])
      fs.copyFileSync(png, path.join(folder, "captures", id + suffix));
    const r = JSON.parse(
      fs.readFileSync(
        "tests/fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
        "utf8",
      ),
    ).result;
    r.lines = r.lines
      .filter((l) => !/Collect|NB Int|Spaceport/.test(l.text))
      .map((l) => ({
        ...l,
        text: l.text
          .replace(
            "Rookie Rank - Direct Small Cargo Haul",
            "Rookie Rank - Direct Extra Small Cargo Haul",
          )
          .replaceAll("Agricultural Supplies", "Corundum"),
      }));
    r.text = r.lines.map((l) => l.text).join("\n");
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
      id,
      JSON.stringify({
        id,
        capturedAt: "2026-11-05T18:24:30.000Z",
        source: "Manual",
        status: "Processed",
        displayId: "fixture",
        displayLabel: "Generated native OCR fixture",
        screenshot: id + ".png",
        width: 3200,
        height: 1800,
        bytes: fs.statSync(png).size,
        attempts: 1,
        error: null,
        result: r,
        observation: null,
      }),
    );
    db.close();
    await launch();
    await page.evaluate((id) => window.cargoRun.ocrReparse(id), id);
    assert.equal((await state()).contracts.length, 0);
    assert.equal(
      (await ocr()).captures[0].observation.objectives[0].pickup.value,
      null,
    );
    await nav("Scan History");
    const entry = page.locator('[data-capture-id="' + id + '"]');
    await entry
      .getByRole("button", { name: "Resolve issue", exact: true })
      .waitFor();
    await entry
      .getByRole("button", { name: "Reprocess saved OCR", exact: true })
      .click();
    await entry
      .getByText(/Offline OCR is recognizing|queued for offline OCR/)
      .waitFor();
    await page.screenshot({
      path: "work/ocr-recovery-processing-v062.png",
      animations: "disabled",
    });
    await until(
      async () =>
        !["Processing", "Queued"].includes(
          (await ocr()).captures[0].recovery?.status,
        ),
    );
    let c = (await ocr()).captures[0];
    console.log(
      "Offline recovery result:",
      c.recovery.status,
      c.result.provider,
    );
    assert.equal(c.recovery.status, "Improved");
    assert(c.observation.objectives[0].pickup.value);
    assert.match(c.result.provider, /Tesseract/);
    assert.equal((await state()).contracts.length, 1);
    assert.equal(c.attempts, 2);
    assert.deepEqual(c.originalRecognition.result, r);
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(path.join(folder, "captures", id + ".png")))
        .digest("hex"),
      createHash("sha256").update(fs.readFileSync(png)).digest("hex"),
    );
    await page.screenshot({
      path: "work/ocr-recovery-improved-v062.png",
      animations: "disabled",
    });
    await cargo("Load", 8);
    await cargo("Deliver", 5);
    const before = JSON.parse(
      JSON.stringify((await state()).contracts[0].cargoObjectives),
    );
    await entry
      .getByRole("button", { name: "Reprocess saved OCR", exact: true })
      .click();
    await until(
      async () =>
        !["Processing", "Queued"].includes(
          (await ocr()).captures[0].recovery?.status,
        ),
    );
    c = (await ocr()).captures[0];
    assert.equal(c.recovery.status, "Unchanged");
    await entry.getByText(/same information was extracted/).waitFor();
    assert.deepEqual(
      JSON.parse(JSON.stringify((await state()).contracts[0].cargoObjectives)),
      before,
    );
    assert.equal((await state()).contracts.length, 1);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, log);
    await page.evaluate(async () => {
      await window.cargoRun.chooseLog();
      await window.cargoRun.startMonitoring();
    });
    fs.appendFileSync(
      log,
      fixtureLog
        .filter((l) => /CreateMarker|Contract Accepted:/.test(l))
        .join("\n") + "\n",
    );
    await until(async () => (await state()).contracts[0].missionId === mission);
    assert.equal(
      (await state()).contracts[0].missionAssociation.source,
      "Acceptance context",
    );
    fs.appendFileSync(log, fixtureLog.join("\n") + "\n");
    await until(
      async () => (await state()).contracts[0].status === "Completed",
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify((await state()).contracts[0].cargoObjectives)),
      before,
    );
    assert.equal((await state()).contracts[0].confirmedEarnings, 0);
    assert.equal((await state()).lifecycleIssues.length, 0);
    assert.equal(
      (
        await page.evaluate(
          (id) => window.cargoRun.cargoActivity(id),
          (await state()).contracts[0].id,
        )
      ).length,
      2,
    );
    fs.unlinkSync(path.join(folder, "captures", id + ".png"));
    await entry
      .getByRole("button", { name: "Reprocess saved OCR", exact: true })
      .click();
    await entry
      .getByRole("alert")
      .filter({ hasText: /missing, unavailable or expired/ })
      .waitFor();
    assert.equal((await ocr()).captures[0].recovery.status, "Failed");
    assert.equal((await state()).contracts.length, 1);
    await page.screenshot({
      path: "work/ocr-recovery-missing-v062.png",
      animations: "disabled",
    });
    await page.evaluate(() => window.cargoRun.stopMonitoring());
    const saved = JSON.parse(JSON.stringify((await state()).contracts));
    await app.close();
    app = null;
    await launch();
    assert.deepEqual((await state()).contracts, saved);
    assert.equal((await ocr()).captures[0].recovery.status, "Failed");
    const final = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.deepEqual(final.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(final.prepare("PRAGMA user_version").get().user_version, 8);
    final.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.6.2 Windows isolated profile: actual saved-image offline OCR worker, queued/processing/improved/unchanged/missing-file feedback; original data/image retention; no duplicate contracts or cargo operations; genuine-format log acceptance association and completion; retained ship cargo/reward isolation; restart and foreign-key integrity.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/ocr-recovery-failure-v062.png",
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
