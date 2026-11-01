// Explicit development tool. Never imported by application startup.
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const origin = "https://starcitizen.tools";
async function json(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "CargoRunCatalogUpdate/0.5 (offline catalog maintenance)",
    },
  });
  if (!response.ok) throw Error(response.status + " " + url);
  return response.json();
}
function option(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
}
(async () => {
  const from = option("--from"),
    date = option("--date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Use --date YYYY-MM-DD");
  let page,
    grid,
    metadata = [];
  if (from) {
    page = JSON.parse(
      fs.readFileSync(path.join(from, "ships-rendered.json"), "utf8"),
    );
    grid = JSON.parse(
      fs.readFileSync(path.join(from, "wiki-grid.json"), "utf8"),
    );
    metadata = JSON.parse(
      fs.readFileSync(path.join(from, "wiki-rows.json"), "utf8"),
    );
  } else {
    page = await json(
      origin +
        "/api.php?action=parse&page=Category:Ships&prop=text%7Crevid&format=json",
    );
    let more = {};
    do {
      const result = await json(
        origin +
          "/api.php?" +
          new URLSearchParams({
            action: "query",
            format: "json",
            generator: "categorymembers",
            gcmtitle: "Category:Ships",
            gcmtype: "page",
            gcmnamespace: "0",
            gcmlimit: "50",
            prop: "revisions",
            rvprop: "ids|timestamp",
            ...more,
          }),
      );
      for (const p of Object.values(result.query?.pages ?? {}))
        metadata.push({
          title: p.title,
          pageid: p.pageid,
          revision: p.revisions?.[0]?.revid,
          updated: p.revisions?.[0]?.timestamp,
        });
      more = result.continue;
    } while (more);
  }
  const html =
    typeof page.parse.text === "string"
      ? page.parse.text
      : page.parse.text["*"];
  const attr = (name) => {
    const result = html.match(new RegExp(name + '="([^"]+)"'));
    if (!result) throw Error("Missing source attribute " + name);
    return result[1]
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&")
      .replaceAll("&#039;", "'");
  };
  const defs = JSON.parse(attr("data-mw-aggrid-options")).columnDefs;
  const field = (name) => {
    const col = defs.find((c) => c.headerName === name);
    if (!col) throw Error("Source column changed: " + name);
    return col.field;
  };
  const cargo = field("Cargo (SCU)"),
    manufacturer = field("Manufacturer"),
    availability = field("Production state");
  if (!grid)
    grid = await json(
      origin +
        "/rest.php/aggrid/v0/grid/" +
        attr("data-mw-aggrid-pageid") +
        "/" +
        attr("data-mw-aggrid-token") +
        "/" +
        attr("data-mw-aggrid-index") +
        "/rows",
    );
  if (!Array.isArray(grid.rows) || grid.rows.length < 100)
    throw Error("Incomplete source export");
  const legacy = {
      "C2 Hercules Starlifter": "c2",
      Caterpillar: "caterpillar",
      "Hull C": "hull-c",
    },
    seen = new Set();
  const ships = grid.rows
    .filter(
      (r) =>
        Number.isFinite(r[cargo]) &&
        r[cargo] > 0 &&
        r.lead?.title &&
        r.lead?.titleHref &&
        r[manufacturer]?.text,
    )
    .filter((r) => {
      if (seen.has(r.lead.titleHref)) return false;
      seen.add(r.lead.titleHref);
      return true;
    })
    .map((r) => {
      const m = metadata.find((p) => p.title === r.lead.title);
      return {
        id:
          legacy[r.lead.title] ??
          "wiki-" + (m?.pageid ?? encodeURIComponent(r.lead.title)),
        name: r.lead.title,
        manufacturer: r[manufacturer].text,
        cargoCapacitySCU: r[cargo],
        availability: r[availability],
        source: origin + r.lead.titleHref,
        sourceRevision: m?.revision,
        updatedAt: m?.updated,
        catalogVersion: "wiki-ships-" + date,
      };
    })
    .sort((a, b) =>
      a.id === "c2" ? -1 : b.id === "c2" ? 1 : a.name.localeCompare(b.name),
    );
  if (
    ships.length < 100 ||
    new Set(ships.map((s) => s.id)).size !== ships.length
  )
    throw Error("Catalog coverage or identity validation failed");
  const output = {
    version: "wiki-ships-" + date,
    retrievedAt: date,
    source: origin + "/Category:Ships",
    sourceRevision: page.parse.revid,
    license: "CC-BY-SA-4.0",
    capacityDefinition:
      "Cargo capacity in SCU, not personal storage in micro-SCU. Wiki snapshot; no uniform game-patch guarantee.",
    coverage: {
      sourceRows: grid.rows.length,
      eligible: ships.length,
      flightReady: ships.filter(
        (s) =>
          s.availability?.toLowerCase().replace(/-/g, " ") === "flight ready",
      ).length,
      excluded: grid.rows.length - ships.length,
    },
    sourceExportSha256: createHash("sha256")
      .update(JSON.stringify(grid.rows))
      .digest("hex"),
    ships,
  };
  fs.writeFileSync(
    "src/data/ship-catalog.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(JSON.stringify(output.coverage));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
