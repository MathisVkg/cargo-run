import { afterEach, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  renameSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join, resolve, sep, basename } from "node:path";
import { TrackingService } from "../electron/main/trackingService";
import { CargoDatabase } from "../electron/main/storage/database";
import {
  readLogChunk,
  CHUNK_BYTES,
  MAX_LINE_BYTES,
} from "../electron/main/log/reader";
import { operationStats, groupByDestination } from "../src/stores/selectors";
import {
  accepted,
  objective,
  completed,
  missionA,
  missionB,
  notification,
} from "./fixtures/log";
const folders: string[] = [];
const services: TrackingService[] = [];
function directory() {
  mkdirSync("work", { recursive: true });
  const p = mkdtempSync(join(resolve("work"), "cargo-unit-"));
  folders.push(p);
  return p;
}
function service(file = ":memory:") {
  const s = new TrackingService(file);
  services.push(s);
  return s;
}
function feed(s: TrackingService, ...lines: string[]) {
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    {
      path: "synthetic/Game.log",
      generation: "fixture",
      offset: 0,
      mode: "Import",
    },
  );
}
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
  for (const p of folders.splice(0)) {
    const target = resolve(p);
    if (
      !target.startsWith(resolve("work") + sep) ||
      !basename(target).startsWith("cargo-unit-")
    )
      throw Error("Unsafe test cleanup path");
    rmSync(target, { recursive: true, force: true });
  }
});
describe("SQLite event association and replay", () => {
  it("starts with an empty persistent ledger instead of silently seeding demo missions", () => {
    expect(service().snapshot().contracts).toEqual([]);
  });
  it("deduplicates the same MissionId and event across imports, with unknown payout excluded", () => {
    const s = service();
    feed(s, accepted(), accepted(), objective(), objective());
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
    expect(s.snapshot().tracking).toMatchObject({ accepted: 1, objectives: 1 });
    expect(s.snapshot().contracts[0]).toMatchObject({
      payout: null,
      source: "Log",
      dataOrigin: "Log",
    });
    expect(operationStats(s.snapshot().contracts).potential).toBe(0);
  });
  it("deduplicates objective notifications with and without optional ObjectiveId", () => {
    const s = service();
    feed(
      s,
      accepted(),
      notification(
        "New Objective: Deliver 0/11 SCU of Quartz to NB Int Spaceport",
      ),
      objective(),
      objective(),
    );
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
    expect(s.snapshot().tracking.objectives).toBe(1);
  });
  it("keeps two explicit ObjectiveIds distinct even with identical cargo details", () => {
    const s = service();
    feed(
      s,
      accepted(),
      objective(),
      objective(0, 11, "NB Int Spaceport", "other-id"),
    );
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(2);
    expect(s.snapshot().tracking.objectives).toBe(2);
  });
  it("places acceptance-only contracts under Unresolved Destination without inventing SCU", () => {
    const s = service();
    feed(s, accepted());
    expect(groupByDestination(s.snapshot().contracts)[0]).toMatchObject({
      destination: "Unresolved Destination",
      unknownCargo: true,
      unknownPayouts: true,
    });
  });
  it("reconciles an objective and completion arriving before acceptance", () => {
    const s = service();
    feed(s, objective(), completed());
    expect(s.snapshot().contracts).toEqual([]);
    expect(s.snapshot().tracking.unresolved).toBe(2);
    feed(s, accepted());
    expect(s.snapshot().contracts[0]).toMatchObject({
      missionId: missionA,
      status: "Completed",
      completedAt: "2026-10-19T16:00:00.000Z",
      confirmedEarnings: 0,
    });
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
    expect(s.snapshot().tracking.unresolved).toBe(0);
  });
  it("never completes a similar title for a different MissionId", () => {
    const s = service();
    feed(
      s,
      accepted(),
      notification(
        "Contract Complete: Rookie Rank - Direct Extra Small Cargo Haul",
        missionB,
      ),
    );
    expect(s.snapshot().contracts[0].status).toBe("Active");
    expect(s.snapshot().tracking.unresolved).toBe(1);
  });
  it("supports distinct ObjectiveIds, updates existing progress and preserves run membership", () => {
    const s = service();
    feed(
      s,
      accepted(),
      objective(),
      objective(0, 20, "Area18", "dropoff-second"),
      objective(5),
    );
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(2);
    expect(s.snapshot().contracts[0].cargoObjectives[0].deliveredSCU).toBe(5);
    expect(operationStats(s.snapshot().contracts).scu).toBe(26);
    const runId = s.snapshot().currentRun.id;
    feed(s, completed());
    expect(s.snapshot().currentRun.id).toBe(runId);
    expect(s.snapshot().currentRun.contractIds).toContain(
      s.snapshot().contracts[0].id,
    );
    expect(s.snapshot().runs).toEqual([]);
  });
  it("does not regress objective progress when historical values are replayed", () => {
    const s = service();
    feed(s, accepted(), objective(7), objective(2));
    expect(s.snapshot().contracts[0].cargoObjectives[0].deliveredSCU).toBe(7);
  });
  it("recovers contracts, selected ship, runs, source events and unresolved associations from SQLite", async () => {
    const file = join(directory(), "cargo.sqlite");
    let s = service(file);
    feed(
      s,
      accepted(),
      objective(),
      notification("Contract Complete: Pending B", missionB),
    );
    s.selectShip("hull-c");
    s.finishRun();
    const run = s.snapshot().runs[0];
    await s.close();
    services.splice(services.indexOf(s), 1);
    s = service(file);
    expect(s.snapshot().selectedShipId).toBe("hull-c");
    expect(s.snapshot().contracts[0].missionId).toBe(missionA);
    expect(s.snapshot().runs[0]).toEqual(run);
    expect(s.snapshot().tracking.unresolved).toBe(1);
    feed(
      s,
      accepted(),
      objective(),
      notification("Contract Accepted: Pending B", missionB),
    );
    expect(s.snapshot().contracts).toHaveLength(2);
    expect(
      s.snapshot().contracts.find((c) => c.missionId === missionB)?.status,
    ).toBe("Completed");
    expect(s.snapshot().tracking.accepted).toBe(2);
  });
  it("retains immutable closed-run snapshots after later mission completion", () => {
    const s = service();
    feed(s, accepted(), objective());
    s.finishRun();
    feed(s, completed());
    expect(s.snapshot().runs[0].contractSnapshots[0].status).toBe("Active");
    expect(s.snapshot().contracts[0].status).toBe("Completed");
  });
  it("rolls back event identifiers and state together if a checkpoint commit fails", () => {
    const s = service();
    const original = s.database.saveCheckpoint.bind(s.database);
    s.database.saveCheckpoint = () => {
      throw Error("simulated disk error");
    };
    expect(() =>
      s.processLines(
        [{ text: accepted(), offset: 0 }],
        { path: "fixture", generation: "x", offset: 0, mode: "Live" },
        {
          fileKey: "x",
          generation: "x",
          offset: 10,
          pending: "",
          dropping: false,
          anchor: "",
        },
      ),
    ).toThrow("simulated disk error");
    expect(s.snapshot().contracts).toEqual([]);
    expect(s.snapshot().tracking.accepted).toBe(0);
    s.database.saveCheckpoint = original;
    feed(s, accepted());
    expect(s.snapshot().contracts).toHaveLength(1);
  });
  it("bounds diagnostics, exposes parse failures, and ignores unrelated log lines", () => {
    const s = service();
    feed(s, "unrelated");
    expect(s.snapshot().tracking.events).toEqual([]);
    for (let i = 0; i < 205; i++)
      feed(
        s,
        'Added notification "Contract Accepted: malformed:" MissionId: [invalid]',
      );
    expect(s.snapshot().tracking.parsingErrors).toBe(205);
    expect(s.snapshot().tracking.events).toHaveLength(200);
    expect(s.snapshot().tracking.events[0].raw).toContain("malformed");
  });
  it("validates renderer requests in main and refuses sample/live mixing", async () => {
    const s = service();
    expect(() => s.saveContract({ draft: { name: 123 } })).toThrow();
    expect(() => s.selectShip("../invalid")).toThrow();
    s.loadSamples();
    const file = join(directory(), "Game.log");
    writeFileSync(file, "");
    await s.setLogPath(file);
    await expect(s.start()).rejects.toThrow("Remove sample");
    s.removeSamples();
    await s.start();
    expect(s.snapshot().tracking.status).toBe("ONLINE");
  });
  it("uses a versioned schema and refuses newer databases without clearing them", () => {
    const file = join(directory(), "newer.sqlite");
    const db = new CargoDatabase(file);
    db.db.exec("PRAGMA user_version=99");
    db.close();
    expect(() => new CargoDatabase(file)).toThrow("newer Cargo Run");
    const check = new DatabaseSync(file);
    expect(check.prepare("PRAGMA user_version").get()!.user_version).toBe(99);
    check.close();
  });
});
describe("incremental reader and monitoring recovery", () => {
  it("buffers incomplete UTF-8 bytes across chunk boundaries and restarts", async () => {
    const file = join(directory(), "Game.log");
    const prefix = "x".repeat(CHUNK_BYTES - 1);
    writeFileSync(file, prefix + "é\n" + accepted().slice(0, 60));
    let r = await readLogChunk(file, null);
    expect(r.lines).toEqual([]);
    const checkpoint = JSON.parse(JSON.stringify(r.checkpoint));
    r = await readLogChunk(file, checkpoint);
    expect(r.lines[0].text).toBe(prefix + "é");
    appendFileSync(file, accepted().slice(60) + "\n");
    r = await readLogChunk(file, r.checkpoint);
    expect(r.lines[0].text).toBe(accepted());
  });
  it("handles CRLF, oversized incomplete lines and recovers at the next newline", async () => {
    const file = join(directory(), "Game.log");
    writeFileSync(file, "x".repeat(MAX_LINE_BYTES + 10));
    let point = null;
    let errors = 0;
    for (let i = 0; i < 5; i++) {
      const r = await readLogChunk(file, point);
      point = r.checkpoint;
      errors += r.lines.filter((l) => l.error).length;
    }
    expect(errors).toBe(1);
    expect(point?.dropping).toBe(true);
    appendFileSync(file, "\r\n" + accepted() + "\r\n");
    const r = await readLogChunk(file, point);
    expect(r.lines.at(-1)?.text).toBe(accepted());
  });
  it("detects truncation, replacement and same-inode rewrites", async () => {
    const dir = directory(),
      file = join(dir, "Game.log");
    writeFileSync(file, "old line\n");
    const initial = await readLogChunk(file, null);
    writeFileSync(file, "new\n");
    const truncated = await readLogChunk(file, initial.checkpoint);
    expect(truncated.lines[0].text).toBe("new");
    expect(truncated.checkpoint.generation).not.toBe(
      initial.checkpoint.generation,
    );
    renameSync(file, join(dir, "old.log"));
    writeFileSync(file, "replacement\n");
    const rotated = await readLogChunk(file, truncated.checkpoint);
    expect(rotated.lines[0].text).toBe("replacement");
    writeFileSync(file, "rewritten!!\n");
    const rewritten = await readLogChunk(file, rotated.checkpoint);
    expect(rewritten.lines[0].text).toBe("rewritten!!");
  });
  it("skips existing contents on first start and imports the same history twice idempotently", async () => {
    const dir = directory(),
      file = join(dir, "Game.log"),
      s = service(join(dir, "db.sqlite"));
    writeFileSync(file, accepted() + "\n" + objective() + "\n");
    const original = readFileSync(file);
    await s.setLogPath(file);
    await s.start();
    expect(s.snapshot().contracts).toEqual([]);
    await s.stop();
    await s.importHistory();
    await s.importHistory();
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.snapshot().tracking).toMatchObject({ accepted: 1, objectives: 1 });
    expect(readFileSync(file)).toEqual(original);
  });
  it("persists live checkpoints and partial lines, resumes after restart without duplicates", async () => {
    const dir = directory(),
      file = join(dir, "Game.log"),
      db = join(dir, "db.sqlite");
    writeFileSync(file, "");
    let s = service(db);
    await s.setLogPath(file);
    await s.start();
    appendFileSync(file, accepted() + "\n" + objective().slice(0, 90));
    await new Promise((r) => setTimeout(r, 650));
    expect(s.snapshot().contracts).toHaveLength(1);
    await s.close();
    services.splice(services.indexOf(s), 1);
    appendFileSync(file, objective().slice(90) + "\n" + accepted() + "\n");
    s = service(db);
    await s.resume();
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
    expect(s.snapshot().tracking).toMatchObject({
      accepted: 1,
      objectives: 1,
      status: "ONLINE",
    });
  });
  it("recovers from a temporarily missing log and transitions ERROR to ONLINE", async () => {
    const file = join(directory(), "Game.log"),
      s = service();
    await s.setLogPath(file);
    await s.start();
    expect(s.snapshot().tracking.status).toBe("ERROR");
    writeFileSync(file, "");
    await new Promise((r) => setTimeout(r, 650));
    expect(s.snapshot().tracking.status).toBe("ONLINE");
    await s.stop();
    expect(s.snapshot().tracking.status).toBe("OFFLINE");
  });
});

describe("monitoring edge cases", () => {
  it("clears a stopped import error after a successful retry", async () => {
    const file = join(directory(), "Game.log"),
      s = service();
    await s.setLogPath(file);
    await expect(s.importHistory()).rejects.toThrow();
    expect(s.snapshot().tracking.status).toBe("ERROR");
    writeFileSync(file, accepted() + "\n");
    await s.importHistory();
    expect(s.snapshot().tracking.status).toBe("OFFLINE");
    expect(s.snapshot().tracking.error).toBeNull();
    expect(s.snapshot().contracts).toHaveLength(1);
  });
  it("does not replay an existing partial notification on first forward-only start", async () => {
    const file = join(directory(), "Game.log"),
      s = service();
    const line = accepted();
    writeFileSync(file, line.slice(0, 80));
    await s.setLogPath(file);
    await s.start();
    appendFileSync(file, line.slice(80) + "\n");
    await new Promise((r) => setTimeout(r, 650));
    expect(s.snapshot().contracts).toEqual([]);
    appendFileSync(
      file,
      notification("Contract Accepted: New after start", missionB) + "\n",
    );
    await new Promise((r) => setTimeout(r, 650));
    expect(s.snapshot().contracts.map((c) => c.missionId)).toEqual([missionB]);
  });
});

describe("committed live acceptance observer", () => {
  it("publishes only first live acceptance after commit, never imports or duplicates", async () => {
    const folder = directory(),
      file = join(folder, "Game.log");
    writeFileSync(file, "");
    const s = service();
    await s.setLogPath(file);
    const seen: string[] = [],
      monitoring: boolean[] = [];
    s.onMonitoringChange = (active) => monitoring.push(active);
    s.onLiveAcceptance = (event) => {
      expect(
        s.database.db
          .prepare("SELECT id FROM mission_events WHERE id=?")
          .get(event.id),
      ).toBeDefined();
      seen.push(event.missionId);
    };
    await s.start();
    const source = {
      path: file,
      generation: "test",
      offset: 0,
      mode: "Live" as const,
    };
    s.processLines([{ text: accepted(), offset: 0 }], source);
    s.processLines(
      [
        {
          text: notification(
            "Contract Accepted: Rookie Cargo Haul",
            missionA,
            undefined,
            "2026-10-27T12:00:00Z",
          ),
          offset: 100,
        },
      ],
      source,
    );
    s.processLines(
      [
        {
          text: notification("Contract Accepted: Cargo Haul", missionB),
          offset: 200,
        },
      ],
      { ...source, mode: "Import" },
    );
    expect(seen).toEqual([missionA]);
    expect(s.snapshot().contracts).toHaveLength(2);
    await s.stop();
    expect(monitoring).toContain(true);
    expect(monitoring.at(-1)).toBe(false);
  });
  it("does not roll back log contracts when the capture observer fails", async () => {
    const folder = directory(),
      file = join(folder, "Game.log");
    writeFileSync(file, "");
    const s = service();
    await s.setLogPath(file);
    s.onMonitoringChange = () => {
      throw Error("Capture observer unavailable");
    };
    await s.start();
    s.onLiveAcceptance = () => {
      throw Error("Capture failed");
    };
    s.processLines([{ text: accepted(), offset: 0 }], {
      path: file,
      generation: "test",
      offset: 0,
      mode: "Live",
    });
    expect(s.snapshot().contracts[0].missionId).toBe(missionA);
    await s.stop();
  });
});
