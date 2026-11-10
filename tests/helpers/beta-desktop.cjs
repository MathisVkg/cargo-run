const path = require("node:path"),
  { DatabaseSync } = require("node:sqlite");
module.exports = async function enableFixtureBeta(page) {
  await page.evaluate(() =>
    window.cargoRun.setWorkflow({ automaticCompletion: true }),
  );
  const file = (await page.evaluate(() => window.cargoRun.getState()))
    .databasePath;
  const resolved = path.resolve(file),
    root = path.resolve("work") + path.sep;
  if (!resolved.startsWith(root))
    throw Error("Beta fixture setup requires an owned work profile.");
  const db = new DatabaseSync(resolved);
  try {
    const row = db
        .prepare("SELECT payload FROM settings WHERE key='workflow.automation'")
        .get(),
      state = JSON.parse(row.payload);
    db.prepare(
      "UPDATE settings SET payload=? WHERE key='workflow.automation'",
    ).run(
      JSON.stringify({ ...state, since: "2000-01-01T00:00:00Z", afterRow: 0 }),
    );
  } finally {
    db.close();
  }
};
