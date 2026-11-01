import { describe, it, expect, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { OcrQueue } from "../electron/main/ocr/queue";
import { TrackingService } from "../electron/main/trackingService";
import { LocalDataManager } from "../electron/main/storage/maintenance";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { notification } from "./fixtures/log";
import type { CaptureRecord, OcrResult } from "../src/types/ocr";
const all: TrackingService[] = [];
afterEach(async () => {
  for (const s of all.splice(0))
    try {
      await s.close();
    } catch {
      /* closed for restart */
    }
});
function setup() {
  const folder = mkdtempSync(join(tmpdir(), "cargo-data-")),
    directory = join(folder, "captures");
  mkdirSync(directory);
  const service = new TrackingService(join(folder, "cargo.sqlite"));
  all.push(service);
  return { service, folder, directory };
}
function add(s: TrackingService, directory: string, name: string) {
  const result: OcrResult = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
      ),
      "utf8",
    ),
  ).result;
  result.lines = result.lines.map((l) => ({
    ...l,
    text: l.text
      .replace("Rookie Rank - Direct Small Cargo Haul", name)
      .replaceAll("Agricultural Supplies", name + " Supplies"),
  }));
  result.text = result.lines.map((l) => l.text).join("\n");
  const id = randomUUID(),
    at = new Date().toISOString(),
    c: CaptureRecord = {
      id,
      capturedAt: at,
      source: "Manual",
      status: "Processed",
      displayId: "test",
      displayLabel: "Synthetic maintenance fixture",
      screenshot: id + ".png",
      width: result.width,
      height: result.height,
      bytes: 3,
      attempts: 1,
      error: null,
      result,
      observation: extractContract(result, id, at),
    };
  new CaptureRepository(s.database).put(c);
  writeFileSync(join(directory, id + ".png"), "png");
  writeFileSync(join(directory, id + ".thumb.png"), "thumb");
  expect(s.processScan(id)?.status).toBe("Imported");
  return { id, contract: s.domain().contracts.find((c) => c.name === name)! };
}
async function seed() {
  const x = setup(),
    a = add(x.service, x.directory, "Active maintenance cargo"),
    b = add(x.service, x.directory, "Completed maintenance cargo"),
    c = add(x.service, x.directory, "Abandoned maintenance cargo");
  x.service.completeContract(b.contract.id);
  x.service.abandonContract(c.contract.id);
  x.service.finishRun();
  x.service.selectShip("hull-c");
  x.service.setPreferences({
    favoriteShipIds: ["hull-c"],
    navigationMode: "compact",
    dashboardView: "contract",
  });
  return { ...x, a, b, c };
}
function manager(
  x: ReturnType<typeof setup>,
  backup?: ConstructorParameters<typeof LocalDataManager>[3],
) {
  const runtime = {
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
  };
  return {
    runtime,
    data: new LocalDataManager(x.service, x.directory, runtime, backup),
  };
}
function execute(data: LocalDataManager, mode: "closed" | "history" | "reset") {
  return data.execute({
    token: data.preview(mode).token,
    confirmed: true,
    resetText: mode === "reset" ? "RESET" : undefined,
  });
}
describe("Safe local data management", () => {
  it("drains an actual in-flight OCR worker and cancels pending automatic capture before resetting", async () => {
    const x = setup(),
      a = add(x.service, x.directory, "Worker cargo"),
      repo = new CaptureRepository(x.service.database);
    repo.put({
      ...repo.get(a.id)!,
      status: "Captured",
      result: null,
      observation: null,
    });
    let release!: (value: OcrResult) => void, started!: () => void;
    const entered = new Promise<void>((r) => {
      started = r;
    });
    const response = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
        ),
        "utf8",
      ),
    ).result as OcrResult;
    const provider = {
      name: "Deferred worker",
      available: () => ({ available: true, error: null }),
      recognize: () => {
        started();
        return new Promise<OcrResult>((r) => {
          release = r;
        });
      },
      close: async () => {
        release(response);
      },
    };
    const q = new OcrQueue(
      repo,
      {
        available: () => ({ available: true, error: null }),
        displays: async () => [],
        capture: async () => {
          throw Error("No real screen capture allowed");
        },
        feedback: async () => {},
        close: async () => {},
      },
      provider,
      { register: () => true, unregister: () => {}, isRegistered: () => true },
      x.directory,
      async () => ({
        image: Buffer.from("fixture"),
        width: 1920,
        height: 1080,
      }),
    );
    const recognized = vi.fn();
    q.onRecognized = recognized;
    await q.initialize();
    await entered;
    q.configurePolicy({
      ...q.snapshot().policy,
      autoEnabled: true,
      delaySeconds: 10,
    });
    q.automatic.setMonitoring(true);
    q.automatic.accept({
      id: randomUUID(),
      missionId: randomUUID(),
      kind: "Accepted",
      objectiveId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      title: "Pending Cargo",
    });
    expect(q.snapshot().automaticRequests[0].status).toBe("Pending");
    const data = new LocalDataManager(x.service, x.directory, {
      pause: () => q.close(),
      resume: async () => {},
    });
    await execute(data, "reset");
    await new Promise((r) => setTimeout(r, 20));
    expect(recognized).not.toHaveBeenCalled();
    expect(x.service.domain().contracts).toEqual([]);
    expect(repo.list()).toEqual([]);
    expect(
      x.service.database.db.prepare("SELECT * FROM automatic_captures").all(),
    ).toEqual([]);
  });
  it("reports committed reset plus file-removal warnings instead of claiming filesystem rollback", async () => {
    const x = setup(),
      a = add(x.service, x.directory, "Locked image cargo"),
      data = new LocalDataManager(
        x.service,
        x.directory,
        { pause: async () => {}, resume: async () => {} },
        undefined,
        () => {
          throw Error("File locked");
        },
      );
    const r = await execute(data, "reset");
    expect(r.warnings.join(" ")).toContain("File locked");
    expect(x.service.domain().contracts).toEqual([]);
    expect(existsSync(join(x.directory, a.id + ".png"))).toBe(true);
    expect(existsSync(join(r.backupPath, "captures", a.id + ".png"))).toBe(
      true,
    );
    expect(
      x.service.database.db.prepare("PRAGMA foreign_key_check").all(),
    ).toEqual([]);
  });

  it.each(["closed", "history"] as const)(
    "clears %s without losing active evidence, settings or current identity",
    async (mode) => {
      const x = await seed(),
        { data, runtime } = manager(x),
        before = x.service.snapshot(),
        preview = data.preview(mode);
      expect(preview).toMatchObject({
        contracts: 2,
        runs: 1,
        captures: 2,
        links: 2,
        audits: 2,
        preservesActive: true,
      });
      const result = await data.execute({
        token: preview.token,
        confirmed: true,
      });
      expect(x.service.domain().contracts.map((c) => c.id)).toEqual([
        x.a.contract.id,
      ]);
      expect(x.service.domain().currentRun.id).toBe(before.currentRun.id);
      expect(x.service.domain().runs).toHaveLength(mode === "closed" ? 1 : 0);
      if (mode === "closed") {
        expect(x.service.domain().runs[0].contractSnapshots).toHaveLength(1);
        expect(x.service.domain().runs[0].contractIds).toEqual([
          x.a.contract.id,
        ]);
      }
      expect(x.service.contractEvidence(x.a.contract.id)).toHaveLength(1);
      expect(
        x.service.database.db.prepare("SELECT * FROM ocr_review_audit").all(),
      ).toHaveLength(1);
      expect(existsSync(join(x.directory, x.a.id + ".png"))).toBe(true);
      expect(existsSync(join(x.directory, x.b.id + ".png"))).toBe(true);
      expect(
        new CaptureRepository(x.service.database).get(x.b.id)?.historyRemoved,
      ).toBe(true);
      expect(x.service.processScan(x.b.id)?.status).toBe("Pending corrections");
      expect(x.service.domain().contracts).toHaveLength(1);
      expect(x.service.snapshot().preferences).toEqual(before.preferences);
      expect(x.service.snapshot().selectedShipId).toBe("hull-c");
      expect(
        x.service.database.db.prepare("PRAGMA foreign_key_check").all(),
      ).toEqual([]);
      expect(runtime.pause).toHaveBeenCalledOnce();
      expect(runtime.resume).toHaveBeenCalledOnce();
      const backup = new DatabaseSync(
        join(result.backupPath, "cargo-run.sqlite"),
        { readOnly: true },
      );
      expect(
        backup.prepare("SELECT COUNT(*) AS n FROM contracts").get()!.n,
      ).toBe(3);
      expect(
        backup.prepare("PRAGMA integrity_check").get()!.integrity_check,
      ).toBe("ok");
      backup.close();
      expect(
        existsSync(join(result.backupPath, "captures", x.a.id + ".png")),
      ).toBe(true);
    },
  );
  it("full reset clears every tracking table, preserves configuration and never edits Game.log", async () => {
    const x = await seed(),
      file = join(x.folder, "Game.log");
    writeFileSync(
      file,
      notification("Contract Accepted: Existing Cargo", randomUUID()) + "\n",
    );
    await x.service.setLogPath(file);
    await x.service.start();
    x.service.database.setSetting("ocr.settings", {
      enabled: true,
      accelerator: "F8",
      displayId: "display-1",
      sounds: false,
    });
    x.service.database.setSetting("ocr.policy", {
      source: "Display",
      autoEnabled: false,
    });
    const config = x.service.database.getSetting("monitor"),
      prefs = x.service.snapshot().preferences,
      { data } = manager(x),
      raw = readFileSync(file, "utf8"),
      oldRun = x.service.domain().currentRun.id;
    const result = await execute(data, "reset");
    for (const table of [
      "contracts",
      "cargo_objectives",
      "ocr_captures",
      "capture_contract_links",
      "ocr_review_audit",
      "pending_log_missions",
      "mission_events",
      "diagnostics",
      "automatic_captures",
      "read_checkpoints",
    ])
      expect(
        x.service.database.db
          .prepare("SELECT COUNT(*) AS n FROM " + table)
          .get()!.n,
        table,
      ).toBe(0);
    expect(x.service.domain().runs).toEqual([]);
    expect(x.service.domain().currentRun.id).not.toBe(oldRun);
    expect(x.service.domain().currentRun.contractIds).toEqual([]);
    expect(x.service.snapshot().preferences).toEqual(prefs);
    expect(x.service.database.getSetting("monitor")).toEqual(config);
    expect(x.service.database.getSetting("ocr.settings")).toMatchObject({
      accelerator: "F8",
    });
    expect(x.service.database.getSetting("ocr.policy")).toMatchObject({
      source: "Display",
    });
    expect(x.service.snapshot().tracking.enabled).toBe(false);
    expect(existsSync(join(x.directory, x.a.id + ".png"))).toBe(false);
    expect(readFileSync(file, "utf8")).toBe(raw);
    expect(
      existsSync(join(result.backupPath, "captures", x.a.id + ".png")),
    ).toBe(true);
    const name = x.service.database.path;
    await x.service.close();
    const restarted = new TrackingService(name);
    all.push(restarted);
    await restarted.resume();
    expect(restarted.snapshot().tracking.enabled).toBe(false);
    expect(restarted.domain().contracts).toEqual([]);
    await restarted.start();
    expect(restarted.database.counts().accepted).toBe(0);
    const mission = randomUUID();
    appendFileSync(
      file,
      notification(
        "Contract Accepted: New Cargo",
        mission,
        undefined,
        new Date().toISOString(),
      ) + "\n",
    );
    const deadline = Date.now() + 3000;
    while (restarted.database.counts().accepted === 0 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    expect(restarted.database.counts().accepted).toBe(1);
    expect(restarted.database.pendingMissions()[0].missionId).toBe(mission);
    await restarted.stop();
    await restarted.importHistory();
    expect(restarted.database.counts().accepted).toBe(2);
    expect(restarted.domain().contracts).toHaveLength(0);
  });
  it("backup failure prevents deletion and preserves usable runtime state", async () => {
    const x = await seed(),
      { data, runtime } = manager(x, async () => {
        throw Error("Disk full");
      }),
      before = JSON.stringify(x.service.domain());
    await expect(execute(data, "reset")).rejects.toThrow("Backup failed");
    expect(JSON.stringify(x.service.domain())).toBe(before);
    expect(
      x.service.database.db
        .prepare("SELECT COUNT(*) AS n FROM ocr_review_audit")
        .get()!.n,
    ).toBe(3);
    expect(existsSync(join(x.directory, x.a.id + ".png"))).toBe(true);
    expect(runtime.resume).toHaveBeenCalledOnce();
  });
  it("transaction failure rolls back links, audits, captures and contracts after a verified backup", async () => {
    const x = await seed(),
      { data } = manager(x),
      before = JSON.stringify(x.service.domain()),
      captureBefore = JSON.stringify(
        new CaptureRepository(x.service.database).get(x.b.id),
      );
    vi.spyOn(x.service.database, "saveDomain").mockImplementationOnce(() => {
      throw Error("Test commit failure");
    });
    await expect(execute(data, "closed")).rejects.toThrow(
      "Test commit failure",
    );
    expect(JSON.stringify(x.service.domain())).toBe(before);
    expect(
      JSON.stringify(new CaptureRepository(x.service.database).get(x.b.id)),
    ).toBe(captureBefore);
    expect(
      x.service.database.db
        .prepare("SELECT COUNT(*) AS n FROM capture_contract_links")
        .get()!.n,
    ).toBe(3);
    expect(
      x.service.database.db.prepare("PRAGMA foreign_key_check").all(),
    ).toEqual([]);
  });
  it("requires one-use confirmed previews and RESET, rejects stale or broad payloads", async () => {
    const x = setup(),
      { data } = manager(x),
      p = data.preview("reset");
    await expect(
      data.execute({ token: p.token, confirmed: true, resetText: "reset" }),
    ).rejects.toThrow("RESET");
    await expect(
      data.execute({
        token: p.token,
        confirmed: true,
        resetText: "RESET",
        path: "C:/",
      }),
    ).rejects.toThrow();
    const result = await data.execute({
      token: p.token,
      confirmed: true,
      resetText: "RESET",
    });
    expect(result.backupPath).toBeTruthy();
    await expect(
      data.execute({ token: p.token, confirmed: true, resetText: "RESET" }),
    ).rejects.toThrow("expired");
    const stale = data.preview("closed");
    add(x.service, x.directory, "Changed Cargo");
    await expect(
      data.execute({ token: stale.token, confirmed: true }),
    ).rejects.toThrow("changed");
  });
  it("archives removed closed MissionIds without deleting event evidence or reintroducing them", async () => {
    const x = setup(),
      mission = randomUUID();
    x.service.processLines(
      [
        {
          text: notification("Contract Accepted: Old Cargo", mission),
          offset: 0,
        },
      ],
      { path: "fixture", generation: "a", offset: 0, mode: "Import" },
    );
    const c = x.service.database.pendingMissions()[0];
    x.service.store.setState({ contracts: [c] });
    x.service.database.saveDomain(x.service.domain());
    x.service.abandonContract(c.id);
    const { data } = manager(x);
    await execute(data, "closed");
    expect(x.service.database.pendingMissions()).toEqual([]);
    expect(x.service.database.pendingMissions(true)).toHaveLength(1);
    expect(x.service.database.counts().accepted).toBe(1);
    x.service.processLines(
      [
        {
          text: notification(
            "New Objective: Deliver 0/5 SCU of Food to Area18",
            mission,
            "old-objective",
          ),
          offset: 100,
        },
      ],
      { path: "fixture", generation: "b", offset: 100, mode: "Live" },
    );
    expect(x.service.database.pendingMissions()).toEqual([]);
    expect(x.service.domain().contracts).toEqual([]);
  });
  it("waits for runtime drain before backup and reset; preserves files not owned by capture storage", async () => {
    const x = setup();
    writeFileSync(join(x.directory, "personal.txt"), "keep");
    let release!: () => void;
    const runtime = {
        pause: () =>
          new Promise<void>((r) => {
            release = r;
          }),
        resume: vi.fn(async () => {}),
      },
      data = new LocalDataManager(x.service, x.directory, runtime);
    const running = execute(data, "reset");
    await new Promise((r) => setTimeout(r, 0));
    expect(data.busy).toBe(true);
    expect(x.service.database.getSetting("maintenance.lastBackup")).toBeNull();
    release();
    await running;
    expect(readFileSync(join(x.directory, "personal.txt"), "utf8")).toBe(
      "keep",
    );
    expect(runtime.resume).toHaveBeenCalledOnce();
  });
});
