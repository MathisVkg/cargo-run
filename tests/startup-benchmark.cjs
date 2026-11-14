// Isolated npm dev/start benchmark. Uses only generated work profiles; never the real user profile.
const { chromium } = require("playwright");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const label = process.argv[2] || "current";
const cacheCold = process.argv.includes("--cold-cache");
const noShortcuts = process.argv.includes("--no-shortcuts");
if (cacheCold) {
  const cache = path.resolve("node_modules/.vite");
  assert(cache.startsWith(path.resolve("node_modules") + path.sep));
  if (fs.existsSync(cache)) {
    assert(!fs.lstatSync(cache).isSymbolicLink());
    fs.rmSync(cache, { recursive: true });
  }
}
assert(/^[a-z0-9-]+$/i.test(label));
const root = path.resolve("work/performance");
fs.mkdirSync(root, { recursive: true });
const folder = fs.mkdtempSync(path.join(root, label + "-"));
const results = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(mode, name, profile, seed = false) {
  const port = 9400 + Math.floor(Math.random() * 500),
    start = performance.now();
  const env = {
    ...process.env,
    NODE_ENV: "test",
    CARGO_RUN_TEST_USER_DATA: profile,
    CARGO_RUN_STARTUP_METRICS: "1",
    ELECTRON_CLI_ARGS: JSON.stringify(["--remote-debugging-port=" + port]),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(profile, { recursive: true });
  delete env.ELECTRON_ENTRY;
  if (noShortcuts) {
    const entry = path.join(profile, "benchmark-entry.cjs");
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(
      entry,
      'const e=require("electron");e.globalShortcut.register=()=>true;e.globalShortcut.unregister=()=>{};e.globalShortcut.isRegistered=()=>true;require(' +
        JSON.stringify(path.resolve("out/main/index.js")) +
        ");\n",
    );
    env.ELECTRON_ENTRY = entry;
  }
  const child = spawn(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "npm run " + mode + " -- -- --remote-debugging-port=" + port,
    ],
    { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "",
    browser,
    page;
  const stages = [];
  const add = (chunk) => {
    log += chunk.toString();
  };
  child.stdout.on("data", add);
  child.stderr.on("data", add);
  try {
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw Error("npm exited " + child.exitCode + "\n" + log);
      try {
        const r = await fetch("http://127.0.0.1:" + port + "/json/version", {
          signal: AbortSignal.timeout(500),
        });
        if (r.ok) break;
      } catch {
        /* Endpoint is not ready yet, or this is not a metrics line. */
      }
      await delay(100);
    }
    browser = await chromium.connectOverCDP("http://127.0.0.1:" + port, {
      timeout: 10000,
    });
    const context = browser.contexts()[0];
    page = context.pages()[0] || (await context.waitForEvent("page"));
    await page
      .getByRole("heading", { name: "Contracts", exact: true })
      .waitFor({ timeout: 60000 });
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading saved operations"),
    );
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("button", { name: "Cargo", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Cargo Plan", exact: true })
      .waitFor();
    const interactiveMs = Math.round(performance.now() - start);
    const data = await page.evaluate(async () => ({
      state: await window.cargoRun.getState(),
      ocr: await window.cargoRun.ocrState(),
      navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
    }));
    assert.equal(
      path.resolve(data.state.databasePath),
      path.join(profile, "cargo-run.sqlite"),
      "Isolated profile must be honored",
    );
    if (seed)
      await page.evaluate(async () => {
        for (let i = 0; i < 50; i++)
          await window.cargoRun.saveContract({
            draft: {
              name: "Benchmark " + i,
              company: "Fixture",
              payout: 10000,
              objectives: [
                {
                  commodity: "Titanium",
                  pickupLocation: "Port Tressler",
                  destination: "NB Int. Spaceport",
                  quantitySCU: 8,
                },
              ],
            },
          });
      });
    await delay(100);
    for (const line of log.split(/\r?\n/)) {
      const i = line.indexOf("[startup] ");
      if (i >= 0)
        try {
          stages.push(JSON.parse(line.slice(i + 10)));
        } catch {
          /* Endpoint is not ready yet, or this is not a metrics line. */
        }
    }
    const result = {
      name,
      mode,
      interactiveMs,
      contracts: data.state.contracts.length,
      monitoring: data.state.tracking.status,
      ships: data.state.ships.length,
      displays: data.ocr.displays.length,
      stages,
      navigation: data.navigation,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } finally {
    if (page && !page.isClosed())
      await page.evaluate(() => window.cargoRun.close()).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      delay(5000),
    ]);
    if (child.exitCode === null)
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    fs.writeFileSync(path.join(folder, name + ".log"), log);
  }
}
(async () => {
  const existing = path.join(folder, "existing");
  await run("dev", "dev-first-fresh", existing, true);
  const db = new DatabaseSync(path.join(existing, "cargo-run.sqlite"));
  const logPath = path.join(folder, "Game.log");
  fs.writeFileSync(logPath, "");
  db.prepare(
    "INSERT INTO settings(key,payload) VALUES('monitor',?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
  ).run(JSON.stringify({ path: logPath, enabled: true }));
  db.close();
  await run("dev", "dev-warm-existing", existing);
  const buildStarted = performance.now();
  execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build"], {
    stdio: "inherit",
    windowsHide: true,
  });
  const buildMs = Math.round(performance.now() - buildStarted);
  await run("start", "production-fresh", path.join(folder, "fresh"));
  await run("start", "production-existing", existing);
  fs.writeFileSync(
    path.join(root, label + ".json"),
    JSON.stringify(
      {
        label,
        cacheCold,
        noShortcuts,
        buildMs,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        results,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
