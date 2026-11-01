const { _electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { DatabaseSync } = require("node:sqlite");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/alignment-desktop-")),
  env = { ...process.env, NODE_ENV: "test", CARGO_RUN_TEST_USER_DATA: folder },
  metrics = [];
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
  await main.getByRole("button", { name, exact: true }).click();
}
async function sidebar(mode) {
  const data = await page.locator(".sidebar." + mode).evaluate((el) => {
    const rect = (n) => {
      const r = n.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
        cy: r.y + r.height / 2,
        cx: r.x + r.width / 2,
      };
    };
    const nav = el.querySelector("nav"),
      first = nav.querySelector("button"),
      control = el.querySelector(".sidebar-controls button");
    return {
      gap: rect(control).y - rect(nav).bottom,
      rowGap: parseFloat(getComputedStyle(nav).rowGap),
      control: rect(control),
      item: rect(first),
      controlIcon: rect(control.querySelector("svg")),
      itemIcon: rect(first.querySelector("svg")),
      footerVisible:
        getComputedStyle(el.querySelector(".sidebar-foot")).display !== "none",
      footerGap:
        rect(el).bottom - rect(el.querySelector(".sidebar-foot")).bottom,
    };
  });
  assert.equal(data.gap, data.rowGap);
  assert.equal(data.control.height, 40);
  assert.equal(data.item.height, 40);
  assert.equal(data.controlIcon.width, 19);
  assert.equal(data.controlIcon.height, 19);
  assert(Math.abs(data.controlIcon.cx - data.itemIcon.cx) < 1);
  if (mode === "expanded") {
    assert(data.footerVisible);
    assert(data.footerGap <= 24);
  }
  metrics.push({ navigation: mode, ...data });
}
async function footers(context, wrapped = false) {
  const data = await page.locator(".contract-card").evaluateAll((cards) =>
    cards.map((card) => {
      const box = (n) => {
        const r = n.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
          cy: r.y + r.height / 2,
        };
      };
      const text = (n) => {
        const t = [...n.childNodes].find(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
        );
        if (!t) return null;
        const range = document.createRange();
        range.selectNodeContents(t);
        const r = range.getBoundingClientRect();
        return r.y + r.height / 2;
      };
      const footer = card.querySelector(".contract-card-footer"),
        meta = footer.querySelector(".contract-card-footer__metadata"),
        actions = footer.querySelector(".contract-card-footer__actions"),
        badge = meta.querySelector(".badge"),
        evidence = meta.querySelector(".contract-card-evidence"),
        buttons = [...actions.querySelectorAll("button")];
      return {
        title: card.querySelector("h3").textContent,
        card: box(card),
        footer: box(footer),
        meta: box(meta),
        actions: box(actions),
        source: badge.textContent,
        sourceCenter: text(badge),
        evidenceCenter: evidence ? text(evidence.querySelector("span")) : null,
        evidenceIcon: evidence ? box(evidence.querySelector("svg")) : null,
        buttons: buttons.map((b) => ({
          label: b.getAttribute("aria-label"),
          ...box(b),
          textCenter: text(b),
          icon: b.querySelector("svg") ? box(b.querySelector("svg")) : null,
          transform: getComputedStyle(b).transform,
          top: getComputedStyle(b).top,
        })),
      };
    }),
  );
  assert.equal(data.length, 5);
  for (const c of data) {
    const centers = c.buttons.map((b) => b.cy);
    assert(
      Math.max(...centers) - Math.min(...centers) <= 1,
      context + " action centerline: " + c.title,
    );
    for (const b of c.buttons) {
      assert.equal(b.height, 32);
      assert(b.width >= 32);
      assert(b.x >= c.card.x && b.right <= c.card.right);
      assert.equal(b.transform, "none");
      assert.equal(b.top, "auto");
      if (b.icon) {
        assert.equal(b.icon.width, 16);
        assert.equal(b.icon.height, 16);
        assert(Math.abs(b.icon.cy - b.cy) <= 1);
      }
      if (b.textCenter !== null) assert(Math.abs(b.textCenter - b.cy) <= 1);
    }
    assert(
      Math.abs(c.sourceCenter - c.meta.cy) <= 1,
      context + " source centerline",
    );
    if (c.evidenceIcon) {
      assert(Math.abs(c.evidenceIcon.cy - c.meta.cy) <= 1);
      assert(Math.abs(c.evidenceCenter - c.meta.cy) <= 1);
    }
    if (wrapped && c.actions.y >= c.meta.bottom) {
      assert(Math.abs(c.actions.right - c.footer.right) <= 1);
    } else {
      assert(
        Math.abs(c.meta.cy - c.actions.cy) <= 1,
        context + " metadata/action centerline",
      );
      assert(c.meta.right <= c.actions.x);
    }
  }
  if (wrapped)
    assert(
      data.some((c) => c.actions.y >= c.meta.bottom),
      context + " wraps when needed",
    );
  if (!wrapped)
    for (let i = 0; i < data.length - 1; i += 2)
      assert(
        Math.abs(data[i].footer.bottom - data[i + 1].footer.bottom) <= 1,
        context + " bottom-aligned card footers",
      );
  metrics.push({ context, wrapped, cards: data });
}
(async () => {
  try {
    await launch();
    await page.evaluate(async () => {
      const names = [
        "Manual alignment cargo",
        "Rookie Rank - Extra Small Cargo Haul · Long title for wrapping and shared footer alignment verification",
        "Log alignment cargo",
        "Combined source alignment cargo",
        "Rookie Rank - Extra smal® GET]",
      ];
      for (const name of names)
        await window.cargoRun.saveContract({
          draft: {
            name,
            payout: 5000,
            objectives: [
              {
                commodity: "Food",
                pickupLocation: "Port Tressler",
                destination: "Area18",
                quantitySCU: 5,
              },
            ],
          },
        });
    });
    await app.close();
    app = null;
    const db = new DatabaseSync(path.join(folder, "cargo-run.sqlite"));
    const rows = db
        .prepare("SELECT id,payload FROM contracts ORDER BY rowid")
        .all(),
      kinds = [
        ["Manual", ["Manual"]],
        ["OCR", ["OCR"]],
        ["Log", ["Log"]],
        ["OCR", ["Log", "OCR", "Manual"]],
        ["OCR", ["OCR"]],
      ];
    rows.forEach((row, i) => {
      const c = JSON.parse(row.payload);
      c.source = kinds[i][0];
      c.sources = kinds[i][1];
      c.dataOrigin = c.source;
      if (c.source === "Log") c.missionId = randomUUID();
      db.prepare("UPDATE contracts SET mission_id=?,payload=? WHERE id=?").run(
        c.missionId ?? null,
        JSON.stringify(c),
        row.id,
      );
    });
    const before = db
      .prepare("SELECT id,payload FROM contracts ORDER BY rowid")
      .all();
    db.close();
    await launch();
    await resize(1440, 900);
    await page
      .getByRole("button", { name: "By Contract", exact: true })
      .click();
    await sidebar("expanded");
    await footers("1440 expanded Dashboard");
    await page.screenshot({
      path: "work/alignment-1440-expanded-dashboard.png",
      animations: "disabled",
    });
    await nav("Contracts");
    await footers("1440 expanded Contracts");
    await page.screenshot({
      path: "work/alignment-1440-expanded-contracts.png",
      animations: "disabled",
    });
    await page
      .locator(".sidebar-controls")
      .getByLabel("Collapse navigation", { exact: true })
      .click();
    await page.locator(".sidebar.compact").waitFor();
    await sidebar("compact");
    await footers("1440 compact Contracts");
    await page.screenshot({
      path: "work/alignment-1440-compact-contracts.png",
      animations: "disabled",
    });
    await nav("Dashboard");
    await footers("1440 compact Dashboard");
    await resize(1100, 700);
    await sidebar("compact");
    await footers("1100 compact Dashboard");
    await page.screenshot({
      path: "work/alignment-1100-dashboard.png",
      animations: "disabled",
    });
    await nav("Contracts");
    await footers("1100 compact Contracts");
    await page.screenshot({
      path: "work/alignment-1100-contracts.png",
      animations: "disabled",
    });
    // Verify actual text/icon geometry under a narrower card constraint without lowering the application minimum.
    await page
      .locator(".contract-card")
      .evaluateAll((cards) => cards.forEach((c) => (c.style.width = "300px")));
    await footers("300px constrained cards", true);
    await page.locator(".contract-card").nth(3).screenshot({
      path: "work/alignment-footer-wrap.png",
      animations: "disabled",
    });
    await page
      .locator(".contract-card")
      .evaluateAll((cards) => cards.forEach((c) => (c.style.width = "")));
    const footer = page.locator(".contract-card-footer").first(),
      details = footer.getByRole("button", {
        name: "Details for Manual alignment cargo",
        exact: true,
      });
    await details.hover();
    await footer.screenshot({
      path: "work/alignment-footer-hover.png",
      animations: "disabled",
    });
    await details.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    assert(await details.evaluate((el) => el === document.activeElement));
    assert.notEqual(
      await details.evaluate((el) => getComputedStyle(el).outlineStyle),
      "none",
    );
    await footer.screenshot({
      path: "work/alignment-footer-focus.png",
      animations: "disabled",
    });
    await footers("hover/focus Contracts");
    await details.click();
    await page
      .getByRole("dialog", { name: "Manual alignment cargo", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await footer
      .getByLabel("Edit Manual alignment cargo", { exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Edit Contract", exact: true })
      .waitFor();
    await page
      .getByRole("dialog", { name: "Edit Contract", exact: true })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await footer
      .getByLabel("Abandon Manual alignment cargo", { exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Abandon contract?", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    const logCard = page.locator(".contract-card").filter({
      has: page.getByRole("heading", {
        name: "Log alignment cargo",
        exact: true,
      }),
    });
    assert.equal(
      await logCard
        .getByLabel("Edit Log alignment cargo", { exact: true })
        .isEnabled(),
      false,
    );
    await app.close();
    app = null;
    const read = new DatabaseSync(path.join(folder, "cargo-run.sqlite"), {
      readOnly: true,
    });
    assert.deepEqual(
      read.prepare("SELECT id,payload FROM contracts ORDER BY rowid").all(),
      before,
    );
    read.close();
    await launch();
    await resize(1440, 900);
    await page.locator(".sidebar.compact").waitFor();
    assert.equal((await state()).preferences.navigationMode, "compact");
    await nav("Contracts");
    assert(
      (await state()).contracts.some(
        (c) => c.name === "Rookie Rank - Extra smal® GET]",
      ),
    );
    await footers("restart compact Contracts");
    await sidebar("compact");
    await page.getByLabel("Expand navigation", { exact: true }).click();
    await page.locator(".sidebar.expanded").waitFor();
    await sidebar("expanded");
    await footers("restored expanded Contracts");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "work/alignment-metrics-v052.json",
      JSON.stringify(metrics, null, 2),
    );
    console.log(
      "PASS v0.5.2 Windows: 1440 expanded/compact and 1100 compact; sidebar controls directly below navigation with matched 40px buttons/19px icons; shared Dashboard/Contracts footers; actual OCR/Evidence/Details text and Edit/Abandon SVG centerlines within 1 CSS px; 32px actions; source variants, long titles, bottom alignment, constrained wrapping, hover/focus; Details/Edit/Abandon cancellation, Log permissions; preferences restart and historical titles/SQL payloads unchanged.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "work/alignment-failure.png",
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
