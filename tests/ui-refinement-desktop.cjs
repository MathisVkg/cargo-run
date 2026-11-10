const { _electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite"),
  { randomUUID } = require("node:crypto"),
  { execFileSync } = require("node:child_process");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/ui-refinement-")),
  output = path.resolve("work/ui-v071");
fs.mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  NODE_ENV: "test",
  CARGO_RUN_TEST_USER_DATA: folder,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [],
  measurements = [];
const state = () => page.evaluate(() => window.cargoRun.getState());
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
  await page.waitForTimeout(200);
}
async function nav(name) {
  const n = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  if (!(await n.isVisible()))
    await page.getByLabel("Open navigation", { exact: true }).click();
  await n.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("heading", {
      name: {
        Dashboard: "Cargo Operations",
        Manifest: "Cargo Manifest",
        Contracts: "Contracts",
        History: "Contract History",
        "Scan History": "Scan History & Issues",
        Settings: "Settings",
      }[name],
      exact: true,
    })
    .waitFor();
  await page.locator(".page-content").evaluate((e) => (e.scrollTop = 0));
}
async function shot(name) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: path.join(output, name + ".png"),
    animations: "disabled",
  });
  assert(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    "Body overflow: " + name,
  );
  assert(
    await page
      .locator(".page-content")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    "Page overflow: " + name,
  );
  const d = page.getByRole("dialog").filter({ visible: true });
  if (await d.count())
    assert(
      await d.last().evaluate((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.x >= 0 &&
          r.right <= innerWidth &&
          r.y >= 0 &&
          r.bottom <= innerHeight
        );
      }),
      "Dialog clipped: " + name,
    );
  measurements.push({
    name,
    ...(await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      title: document.querySelector("h1")?.getBoundingClientRect().toJSON(),
      main: document.querySelector("main").getBoundingClientRect().toJSON(),
    }))),
  });
}
async function closeDialog() {
  await page
    .getByRole("dialog")
    .filter({ visible: true })
    .last()
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
}
(async () => {
  try {
    await launch();
    await size(1440, 900);
    await page.evaluate(async () => {
      await window.cargoRun.selectShip("c2");
      const objective = (
        commodity,
        quantitySCU,
        destination,
        pickupLocation = "Port Tressler",
      ) => ({ commodity, quantitySCU, destination, pickupLocation });
      for (const [i, objectives] of [
        [objective("Titanium", 25, "NB Int. Spaceport")],
        [
          objective("Aluminum", 30, "New Babbage"),
          objective("Hydrogen", 10, "Rayari Outpost"),
        ],
        [
          objective("Titanium", 25, "NB Int. Spaceport"),
          objective(
            "Medical Supplies",
            8,
            "HDMS-Anderson Logistics Distribution Centre",
            "Everus Harbor",
          ),
        ],
      ].entries())
        await window.cargoRun.saveContract({
          draft: {
            name: [
              "Orbital supply run",
              "MicroTech resupply circuit",
              "Priority supplies · distribution centre operations",
            ][i],
            company: "Independent Haulers Guild",
            payout: 18000 + i * 7500,
            objectives,
          },
        });
      const s = await window.cargoRun.getState(),
        o = s.contracts[0].cargoObjectives[0];
      await window.cargoRun.checklist({
        requestId: crypto.randomUUID(),
        changes: [
          {
            objectiveId: o.id,
            kind: "pickup",
            done: true,
            expected: JSON.stringify(
              o.checklist ?? {
                pickedUp: false,
                delivered: false,
                pickupRevision: "",
                deliveryRevision: "",
                deliverySource: "Player",
              },
            ),
          },
        ],
      });
    });
    await page.evaluate(async () => {
      await window.cargoRun.saveContract({
        draft: {
          name: "Completed station freight",
          company: "Independent Haulers Guild",
          payout: 11000,
          objectives: [
            {
              commodity: "Platinum",
              quantitySCU: 6,
              pickupLocation: "Everus Harbor",
              destination: "Area18",
            },
          ],
        },
      });
      const s = await window.cargoRun.getState(),
        c = s.contracts.find((c) => c.name === "Completed station freight"),
        o = c.cargoObjectives[0];
      await window.cargoRun.cargoProgress({
        requestId: crypto.randomUUID(),
        shipId: s.selectedShipId,
        changes: [
          {
            objectiveId: o.id,
            action: "Load",
            quantity: 3,
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
    const baseline = JSON.parse(JSON.stringify(await state())),
      ids = [randomUUID(), randomUUID()];
    await app.close();
    app = null;
    // Controlled synthetic evidence: neither live captures nor historical OCR exports.
    const png = path.join(folder, "fixture.png"),
      tsv = path.join(folder, "fixture.tsv"),
      exe = path.join(folder, "Fixture.exe");
    fs.writeFileSync(
      tsv,
      [
        "CARGO RUN SYNTHETIC CONTRACT	120	150	80",
        "Accepted · Orbital supply run	120	360	65",
        "Titanium · 25 SCU to NB Int. Spaceport	120	600	55",
      ].join("\n"),
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
    fs.mkdirSync(path.join(folder, "captures"), { recursive: true });
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite")),
      now = new Date().toISOString();
    const field = (value, ambiguous = false) => ({
      value,
      state: ambiguous ? "Ambiguous" : "Recognized",
      confidence: ambiguous ? 55 : 98,
      method: "Explicit",
      evidence: {
        region: "Synthetic",
        box: { x: 120, y: 600, width: 1500, height: 60 },
        lineIds: ["s1"],
        text: String(value),
      },
    });
    ids.forEach((id, i) => {
      fs.copyFileSync(png, path.join(folder, "captures", id + ".png"));
      fs.copyFileSync(png, path.join(folder, "captures", id + ".thumb.png"));
      const observation = {
        parserVersion: "0.4.3",
        captureId: id,
        capturedAt: now,
        acceptanceTimestamp: null,
        title: field(i ? "Station supply request" : "Orbital supply run"),
        company: field("Independent Haulers Guild"),
        reward: field(18000),
        view: field("Accepted"),
        objectives: [
          {
            commodity: field("Titanium"),
            pickup: field("Port Tressler"),
            destination: field("NB Int. Spaceport"),
            requiredSCU: field(25, !!i),
            deliveredSCU: field(0),
            quantityEvidence: i
              ? {
                  source: "Objective OCR",
                  code: "NumericConfidence",
                  reason: "Synthetic uncertain quantity",
                }
              : undefined,
          },
        ],
        objectiveCount: field(1),
        coverage: { state: "Established", reason: "Complete synthetic list" },
        warnings: [],
        potentiallyIncomplete: false,
      };
      db.prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)").run(
        id,
        JSON.stringify({
          id,
          capturedAt: now,
          source: "Manual",
          status: "Processed",
          displayId: "synthetic",
          displayLabel: "Synthetic UI fixture",
          screenshot: id + ".png",
          width: 3200,
          height: 1800,
          bytes: fs.statSync(png).size,
          attempts: 1,
          error: null,
          result: {
            provider: "Synthetic UI fixture",
            language: "en",
            text: "Synthetic UI evidence",
            lines: [],
            width: 3200,
            height: 1800,
            durationMs: 1,
          },
          observation,
          importResult: {
            status: i ? "Pending corrections" : "Imported",
            message: i ? "Check the uncertain quantity." : "Synthetic import",
            contractId: i ? undefined : baseline.contracts[0].id,
            candidateIds: [],
            processedHash: "synthetic-ui",
          },
        }),
      );
    });
    const evidenceContract = baseline.contracts.find(
        (c) => c.name === "Orbital supply run",
      ),
      draft = {
        name: evidenceContract.name,
        company: evidenceContract.company,
        payout: evidenceContract.payout,
        acceptedAt: evidenceContract.acceptedAt,
        objectives: evidenceContract.cargoObjectives.map((o) => ({
          ...o,
          quantitySCU: o.quantitySCU,
          deliveredSCU: o.deliveredSCU,
        })),
      },
      link = {
        captureId: ids[0],
        contractId: evidenceContract.id,
        attached: true,
        verified: true,
        associatedAt: now,
        capturedAt: now,
        source: "Synthetic UI fixture",
        title: evidenceContract.name,
        warnings: [],
        original: draft,
        reviewed: draft,
        corrections: [],
        conflicts: [],
        choices: {},
        missionId: null,
        rawText: "Synthetic contract evidence",
      };
    db.prepare(
      "INSERT INTO capture_contract_links(capture_id,contract_id,attached,associated_at,payload) VALUES(?,?,1,?,?)",
    ).run(ids[0], evidenceContract.id, now, JSON.stringify(link));
    db.close();
    await launch();
    await size(1440, 900);
    for (const [w, h] of [
      [1100, 700],
      [1280, 800],
      [1440, 900],
    ]) {
      await size(w, h);
      await nav("Dashboard");
      await page
        .getByRole("button", { name: "By Location", exact: true })
        .click();
      await shot("dashboard-" + w);
      await page.locator(".stop-section").last().scrollIntoViewIfNeeded();
      await shot("dashboard-delivery-" + w);
      await page.locator(".page-content").evaluate((e) => (e.scrollTop = 0));
      assert.equal(await page.locator(".stop-card table").count(), 0);
      assert.equal(await page.locator(".stop-cargo-row").count(), 10);
      await page
        .getByRole("button", { name: "By Contract", exact: true })
        .click();
      await shot("dashboard-contract-" + w);
      await nav("Contracts");
      await shot("contracts-" + w);
      await page
        .getByLabel("Details for Orbital supply run", { exact: true })
        .click();
      await shot("details-" + w);
      await page
        .getByRole("dialog", { name: "Orbital supply run", exact: true })
        .locator(".details-evidence")
        .scrollIntoViewIfNeeded();
      await page
        .getByRole("button", {
          name: "Inspect evidence screenshot",
          exact: true,
        })
        .waitFor();
      await shot("details-evidence-" + w);
      await page.mouse.click(2, 2);
      assert(
        await page
          .getByRole("dialog", { name: "Orbital supply run", exact: true })
          .isVisible(),
      );
      await closeDialog();
      await nav("Manifest");
      assert.equal(
        await page
          .locator(".manifest-disclosure .cargo-progress-control")
          .count(),
        0,
      );
      await shot("manifest-" + w);
      const expand = page
        .getByRole("button", { name: /^Cargo actions for / })
        .first();
      await expand.click();
      assert.equal(
        await page
          .locator(".manifest-disclosure .cargo-progress-control")
          .count(),
        1,
      );
      await page
        .locator(".manifest-disclosure .cargo-progress-control summary")
        .first()
        .click();
      await shot("manifest-expanded-" + w);
      await page.locator("#retained-inventory").scrollIntoViewIfNeeded();
      await shot("manifest-retained-" + w);
      await page.locator(".manifest-disclosure > summary").first().click();
      assert(!(await page.locator(".manifest-group").first().isVisible()));
      assert(
        await page
          .locator(".manifest-disclosure")
          .nth(1)
          .locator(".manifest-group")
          .first()
          .isVisible(),
      );
      await nav("History");
      await shot("history-" + w);
      await nav("Scan History");
      await page.locator(".scan-history-entry").first().waitFor();
      await shot("scans-" + w);
      assert.match(await page.locator(".scan-history").innerText(), /Imported/);
      assert.match(
        await page.locator(".scan-history").innerText(),
        /Needs review/,
      );
      await page
        .getByRole("button", { name: "Review issue", exact: true })
        .click();
      await shot("scan-review-" + w);
      await closeDialog();
      await nav("Settings");
      await shot("settings-" + w);
      assert.equal(
        await page
          .getByLabel("Automatic contract completion (Beta)", { exact: true })
          .isChecked(),
        false,
      );
      await page.locator(".cargo-workflow").scrollIntoViewIfNeeded();
      await shot("settings-workflow-" + w);
      await page.locator(".local-data-management").scrollIntoViewIfNeeded();
      await shot("settings-data-" + w);
    }
    await size(1440, 900);
    await nav("Dashboard");
    await page
      .getByRole("button", { name: "By Location", exact: true })
      .click();
    await page
      .locator(".stop-card")
      .filter({
        has: page.getByRole("heading", { name: "Port Tressler", exact: true }),
      })
      .first()
      .screenshot({ path: path.join(output, "pickup-card.png") });
    // Explicit navigation mode remains persistent; narrow reopening is compact.
    await page.evaluate(() =>
      window.cargoRun.setPreferences({ navigationMode: "compact" }),
    );
    await shot("navigation-compact");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].maximize(),
    );
    await page.waitForFunction(() => innerWidth > 1440);
    await shot("dashboard-maximized");
    for (const name of [
      "Manifest",
      "Contracts",
      "History",
      "Scan History",
      "Settings",
    ]) {
      await nav(name);
      await shot(name.toLowerCase().replaceAll(" ", "-") + "-maximized");
    }
    // Bounded ledger and filter reset; all state stays in the isolated profile.
    await page.evaluate(async () => {
      for (let i = 0; i < 27; i++)
        await window.cargoRun.saveContract({
          draft: {
            name: "Ledger fixture " + String(i).padStart(2, "0"),
            payout: 1000,
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
    assert.equal(await page.locator(".history-table tbody tr").count(), 25);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    assert.equal(await page.locator(".history-table tbody tr").count(), 6);
    await page
      .getByLabel("Search history", { exact: true })
      .fill("Orbital supply");
    assert.equal(await page.locator(".history-table tbody tr").count(), 1);
    assert.match(await page.locator(".pagination").innerText(), /Page 1 of 1/);
    const after = await state();
    for (const before of baseline.contracts)
      assert.deepEqual(
        after.contracts.find((c) => c.id === before.id),
        before,
      );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "viewports.json"),
      JSON.stringify(measurements, null, 2),
    );
    console.log(
      "PASS v0.7.1 synthetic visual workflow: all requested viewports/pages; compact rows/isolated expanders; independent sections; protected dialogs; manual default; bounded ledger/filter reset; original contract data unchanged. Screenshots: " +
        output,
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
