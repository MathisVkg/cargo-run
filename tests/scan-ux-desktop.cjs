const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/scan-ux-desktop-")),
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
const state = () => page.evaluate(() => window.cargoRun.getState());
async function nav(name) {
  const n = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  if (await n.isVisible())
    await n.getByRole("button", { name, exact: true }).click();
  else {
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
  }
}
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Cargo state timeout");
}

const { randomUUID, createHash } = require("node:crypto"),
  { execFileSync } = require("node:child_process");
const ids = [randomUUID(), randomUUID()],
  png = path.join(folder, "fixture.png"),
  tsv = path.join(folder, "fixture.tsv"),
  exe = path.join(folder, "ScanReviewFixture.exe");
const fixture = JSON.parse(
  fs.readFileSync("tests/fixtures/mobiglas/nov10-tin.json", "utf8"),
);
fs.writeFileSync(
  tsv,
  fixture.result.lines
    .map((l) =>
      [l.text.replaceAll("\t", " "), l.box.x, l.box.y, l.box.height].join("\t"),
    )
    .join("\n"),
);
execFileSync(
  path.join(
    process.env.SystemRoot,
    "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
  ),
  [
    "/nologo",
    "/target:exe",
    "/platform:x64",
    "/reference:System.Drawing.dll",
    "/out:" + exe,
    path.resolve("tests/native/ScanReviewFixture.cs"),
  ],
  { windowsHide: true, stdio: "inherit" },
);
execFileSync(exe, [png, tsv], { windowsHide: true });
const hash = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const ocr = () => page.evaluate(() => window.cargoRun.ocrState());
(async () => {
  try {
    await launch();
    await app.close();
    app = null;
    fs.mkdirSync(path.join(folder, "captures"), { recursive: true });
    fs.copyFileSync(png, path.join(folder, "captures", ids[0] + ".png"));
    fs.copyFileSync(png, path.join(folder, "captures", ids[0] + ".thumb.png"));
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    for (let i = 0; i < 2; i++) {
      const f = i
        ? JSON.parse(
            fs.readFileSync(
              "tests/fixtures/mobiglas/nov10-aluminum.json",
              "utf8",
            ),
          )
        : fixture;
      db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
        ids[i],
        JSON.stringify({
          id: ids[i],
          capturedAt: new Date().toISOString(),
          source: "Manual",
          status: "Processed",
          displayId: "fixture",
          displayLabel: "Sanitized November 10 OCR",
          screenshot: i ? null : ids[i] + ".png",
          width: 3200,
          height: 1800,
          bytes: i ? 0 : fs.statSync(png).size,
          attempts: 1,
          error: null,
          result: f.result,
          observation: null,
          recovery: i
            ? undefined
            : {
                id: randomUUID(),
                status: "Unchanged",
                startedAt: new Date().toISOString(),
                message:
                  "Confirm uncertain objective quantities; automatic import was withheld.",
              },
        }),
      );
    }
    db.close();
    await launch();
    for (const id of ids)
      await page.evaluate((id) => window.cargoRun.ocrReparse(id), id);
    await nav("Scan History");
    let tin = page.locator('[data-capture-id="' + ids[0] + '"]'),
      aluminum = page.locator('[data-capture-id="' + ids[1] + '"]');
    assert.match(await tin.innerText(), /Needs review/);
    assert.match(await tin.innerText(), /Tin.*12 SCU/);
    assert.equal(
      await tin
        .getByRole("button", { name: "Review issue", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await tin
        .getByRole("button", { name: "Reprocess saved OCR", exact: true })
        .isVisible(),
      false,
    );
    assert.equal(
      await aluminum
        .getByRole("button", { name: "Review issue", exact: true })
        .count(),
      0,
    );
    await tin
      .getByRole("button", { name: "Review issue", exact: true })
      .click();
    let dialog = page.getByRole("dialog", { name: "Review scan", exact: true });
    await dialog
      .getByRole("heading", { name: "Check cargo quantity", exact: true })
      .waitFor();
    assert.equal(
      await dialog
        .getByLabel("Correct quantitySCU 1", { exact: true })
        .inputValue(),
      "12",
    );
    assert.equal(
      await dialog.getByLabel(/I checked the full objective list/).count(),
      0,
    );
    assert.equal(
      await dialog.getByLabel("Correct commodity 1", { exact: true }).count(),
      0,
    );
    assert.equal(
      await dialog
        .getByLabel("Correct pickupLocation 1", { exact: true })
        .count(),
      0,
    );
    await dialog
      .getByRole("img", { name: "Objective 1 screenshot evidence" })
      .waitFor();
    for (const [w, h] of [
      [1100, 700],
      [1440, 900],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, [w, h]) =>
          BrowserWindow.getAllWindows()[0].setSize(w, h),
        [w, h],
      );
      const bounds = await dialog.boundingBox();
      assert(bounds.width <= w && bounds.height <= h);
      await page.screenshot({
        path: "work/scan-quantity-" + w + "-v064.png",
        animations: "disabled",
      });
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await state()).contracts.length, 1);
    await tin
      .getByRole("button", { name: "Review issue", exact: true })
      .click();
    await dialog
      .getByLabel("Correct quantitySCU 1", { exact: true })
      .fill("13");
    await dialog
      .getByRole("button", { name: "Confirm correction", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await until(async () => (await state()).contracts.length === 2);
    let c = (await state()).contracts.find(
      (c) => c.cargoObjectives[0].commodity === "Tin",
    );
    assert.equal(c.cargoObjectives[0].quantitySCU, 13);
    assert.equal(c.cargoObjectives[0].pickupLocation, "Port Tressler");
    assert.equal(
      c.cargoObjectives[0].destination,
      "Sakura Sun Goldenrod Workcenter on microTech",
    );
    assert.equal(c.payout, 37250);
    assert.match(
      await tin.locator(".scan-history-summary").innerText(),
      /Imported/,
    );
    assert.match(
      await tin.locator(".scan-history-summary").innerText(),
      /13 SCU/,
    );
    assert(
      !/withheld|uncertain/.test(
        await tin.locator(".scan-history-summary").innerText(),
      ),
    );
    await tin
      .getByRole("button", { name: "View contract", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await tin.locator(".scan-advanced > summary").click();
    await tin
      .getByRole("button", { name: "Re-extract saved text", exact: true })
      .click();
    assert.equal(
      (await state()).contracts.find((row) => row.id === c.id)
        .cargoObjectives[0].quantitySCU,
      13,
    );
    await tin.getByText("Inspect raw OCR evidence", { exact: true }).click();
    assert.match(await tin.locator(".ocr-raw").innerText(), /confidence/);
    await tin
      .getByRole("button", { name: "Detailed field editing", exact: true })
      .click();
    await tin.locator(".review-form").waitFor();
    await tin
      .getByRole("button", { name: "Detailed field editing", exact: true })
      .click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].maximize(),
    );
    await page.screenshot({
      path: "work/scan-history-maximized-v064.png",
      animations: "disabled",
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].unmaximize(),
    );
    await tin
      .getByRole("button", { name: "Delete capture", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Delete this capture?", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await ocr()).captures.length, 2);
    assert.equal(
      hash(path.join(folder, "captures", ids[0] + ".png")),
      hash(png),
    );
    await aluminum
      .getByRole("button", { name: "Delete capture", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm delete capture", exact: true })
      .click();
    await until(async () => (await ocr()).captures.length === 1);
    assert.equal((await state()).contracts.length, 2);
    const before = JSON.parse(JSON.stringify((await state()).contracts));
    await app.close();
    app = null;
    await launch();
    assert.deepEqual((await state()).contracts, before);
    const check = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    const audit = check
      .prepare(
        "SELECT payload FROM ocr_review_audit WHERE capture_id=? ORDER BY rowid",
      )
      .all(ids[0])
      .map((r) => JSON.parse(r.payload));
    assert(
      audit.some(
        (a) => a.previousScanOutcome?.status === "Pending corrections",
      ),
    );
    assert.deepEqual(check.prepare("PRAGMA foreign_key_check").all(), []);
    check.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS v0.6.4 isolated Windows Scan History: genuine Tin 69-confidence review, focused evidence/correction without re-entering valid fields, cancel, clear current status/reviewed quantity, contract navigation, Advanced extraction/raw/details, manual correction preservation, deletion confirmation, minimum/standard/maximized layouts, image integrity, audit/restart/FK.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/scan-ux-failure-v064.png",
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
