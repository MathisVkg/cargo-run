import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { TrackingService } from "../electron/main/trackingService";
import { LocalDataManager } from "../electron/main/storage/maintenance";
import { recordedOnboard } from "../electron/main/cargoProgress";
import {
  progressStamp,
  awaitingPickup,
  type ProgressRequest,
  type ProgressChange,
} from "../src/types/progress";
import { operationStats } from "../src/stores/selectors";
import { notification } from "./fixtures/log";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import type { OcrResult, CaptureRecord } from "../src/types/ocr";
const services: TrackingService[] = [];
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
});
function setup(path = ":memory:", count = 1, quantity = 9) {
  const s = new TrackingService(path);
  services.push(s);
  for (let i = 0; i < count; i++)
    s.saveContract({
      draft: {
        name: "Haul " + i,
        payout: 1000,
        objectives: [
          {
            commodity: "Quartz",
            pickupLocation: "Everus",
            destination: "Area18",
            quantitySCU: quantity,
          },
        ],
      },
    });
  return s;
}
const row = (s: TrackingService, c = 0, o = 0) =>
  s.domain().contracts[c].cargoObjectives[o];
function request(
  s: TrackingService,
  action: ProgressChange["action"],
  quantity: number,
  c = 0,
): ProgressRequest {
  const o = row(s, c);
  return {
    requestId: randomUUID(),
    shipId: s.domain().selectedShipId,
    changes: [
      { objectiveId: o.id, action, quantity, expected: progressStamp(o) },
    ],
  };
}
const apply = (
  s: TrackingService,
  action: ProgressChange["action"],
  quantity: number,
  c = 0,
) => s.cargoProgress(request(s, action, quantity, c));
function feed(s: TrackingService, ...lines: string[]) {
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    { path: "synthetic", generation: "generation", offset: 0, mode: "Import" },
  );
}
describe("Physical cargo operations", () => {
  it("partially loads, finishes pickup, partially delivers and fully delivers without completing or earning", () => {
    const s = setup();
    expect(row(s).loadEvidence).toBe("Unknown");
    apply(s, "Load", 3);
    expect(awaitingPickup(row(s))).toBe(6);
    apply(s, "Load", 6);
    apply(s, "Deliver", 4);
    expect(row(s)).toMatchObject({
      quantitySCU: 9,
      loadedSCU: 5,
      deliveredSCU: 4,
    });
    expect(
      recordedOnboard(s.domain().contracts, s.domain().selectedShipId),
    ).toBe(5);
    apply(s, "Deliver", 5);
    expect(row(s)).toMatchObject({ loadedSCU: 0, deliveredSCU: 9 });
    expect(s.domain().contracts[0]).toMatchObject({
      status: "Active",
      confirmedEarnings: 0,
    });
    expect(s.cargoActivity(s.domain().contracts[0].id)).toHaveLength(4);
  });
  it("prevents overloading requirements, over-delivery, negative/nonfinite quantities and invalid IPC", () => {
    const s = setup();
    for (const n of [-1, NaN, Infinity, 10])
      expect(() => apply(s, "Load", n)).toThrow();
    apply(s, "Load", 3);
    expect(() => apply(s, "Deliver", 4)).toThrow(/onboard/);
    expect(() =>
      s.cargoProgress({ ...request(s, "Load", 1), arbitrary: true }),
    ).toThrow();
    expect(row(s).loadedSCU).toBe(3);
  });
  it("enforces selected capacity including abandoned cargo and never clamps", () => {
    const s = setup(":memory:", 2, 500);
    const ship = s
      .domain()
      .ships.find((x) => x.cargoCapacitySCU >= 9 && x.cargoCapacitySCU <= 12)!;
    s.selectShip(ship.id);
    apply(s, "Load", ship.cargoCapacitySCU);
    s.abandonContract(s.domain().contracts[0].id);
    expect(() => apply(s, "Load", 1, 1)).toThrow(/capacity/);
    expect(row(s, 1).loadedSCU).toBe(0);
    apply(s, "Unload", 1);
    apply(s, "Load", 1, 1);
    expect(recordedOnboard(s.domain().contracts, ship.id)).toBe(
      ship.cargoCapacitySCU,
    );
  });
  it("preserves distinct allocations for identical cargo at one pickup; atomic multi-objective failure", () => {
    const s = setup(":memory:", 2);
    apply(s, "Load", 3);
    expect(row(s, 1).loadedSCU).toBe(0);
    const a = request(s, "Load", 2),
      b = request(s, "Load", 10, 1);
    expect(() =>
      s.cargoProgress({ ...a, changes: [...a.changes, ...b.changes] }),
    ).toThrow();
    expect(row(s).loadedSCU).toBe(3);
    expect(s.cargoActivity(s.domain().contracts[0].id)).toHaveLength(1);
    s.cargoProgress({
      ...request(s, "Load", 2),
      changes: [
        ...request(s, "Load", 2).changes,
        ...request(s, "Load", 4, 1).changes,
      ],
    });
    expect([row(s).loadedSCU, row(s, 1).loadedSCU]).toEqual([5, 4]);
  });
  it("makes retries idempotent and rejects ID reuse or stale quantities", () => {
    const s = setup(),
      r = request(s, "Load", 3);
    s.cargoProgress(r);
    s.cargoProgress(r);
    expect(row(s).loadedSCU).toBe(3);
    expect(s.cargoActivity(s.domain().contracts[0].id)).toHaveLength(1);
    expect(() =>
      s.cargoProgress({ ...r, changes: [{ ...r.changes[0], quantity: 2 }] }),
    ).toThrow(/reused/);
    expect(() => s.cargoProgress({ ...r, requestId: randomUUID() })).toThrow(
      /changed/,
    );
  });
  it("corrects onboard quantities and undoes the latest unchanged operation safely", () => {
    const s = setup();
    apply(s, "Load", 8);
    apply(s, "SetLoaded", 6);
    const id = s.cargoActivity(s.domain().contracts[0].id)[0].id;
    const r = request(s, "Undo", 0);
    r.changes[0].undoId = id;
    s.cargoProgress(r);
    expect(row(s).loadedSCU).toBe(8);
    expect(() =>
      s.cargoProgress({
        ...request(s, "Undo", 0),
        changes: [{ ...request(s, "Undo", 0).changes[0], undoId: id }],
      }),
    ).toThrow(/latest/);
    apply(s, "Deliver", 3);
    const delivery = s.cargoActivity(s.domain().contracts[0].id)[0];
    s.cargoProgress({
      ...request(s, "Undo", 0),
      changes: [{ ...request(s, "Undo", 0).changes[0], undoId: delivery.id }],
    });
    expect(row(s)).toMatchObject({ loadedSCU: 8, deliveredSCU: 0 });
  });
  it("switches selection without transferring inventory; undo requires the original ship", () => {
    const s = setup();
    const original = s.domain().selectedShipId;
    apply(s, "Load", 5);
    apply(s, "Unload", 5);
    const op = s.cargoActivity(s.domain().contracts[0].id)[0];
    s.selectShip("hull-c");
    expect(() =>
      s.cargoProgress({
        ...request(s, "Undo", 0),
        changes: [{ ...request(s, "Undo", 0).changes[0], undoId: op.id }],
      }),
    ).toThrow(/original ship/);
    s.selectShip(original);
    apply(s, "Load", 5);
    s.selectShip("hull-c");
    expect(row(s).loadedShipId).toBe(original);
    expect(recordedOnboard(s.domain().contracts, "hull-c")).toBe(0);
    expect(() => apply(s, "Deliver", 1)).toThrow(/holding/);
  });
  it("retains physical inventory after abandon, completion and finish run", () => {
    const s = setup(":memory:", 2);
    apply(s, "Load", 5);
    apply(s, "Load", 2, 1);
    s.abandonContract(s.domain().contracts[0].id);
    s.completeContract(s.domain().contracts[1].id);
    s.finishRun();
    expect(
      recordedOnboard(s.domain().contracts, s.domain().selectedShipId),
    ).toBe(7);
    expect(operationStats(s.domain().contracts).scu).toBe(0);
    expect(
      s.domain().runs[0].contractSnapshots[0].cargoObjectives[0].loadedSCU,
    ).toBe(5);
    expect(() => apply(s, "Load", 1)).toThrow(/Closed/);
    apply(s, "Unload", 5);
    expect(row(s).loadedSCU).toBe(0);
  });
  it("persists cargo, audit and deduplication across restart", async () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "cargo-progress-")),
      "cargo.sqlite",
    );
    const first = setup(file);
    const r = request(first, "Load", 7);
    first.cargoProgress(r);
    await first.close();
    services.splice(services.indexOf(first), 1);
    const s = new TrackingService(file);
    services.push(s);
    s.cargoProgress(r);
    expect(row(s).loadedSCU).toBe(7);
    expect(s.cargoActivity(s.domain().contracts[0].id)).toHaveLength(1);
    expect(s.database.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it("adds schema 6 to genuine schema-5 data while preserving historical quantities and unrelated settings", async () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "cargo-migrate-")),
      "cargo.sqlite",
    );
    const first = setup(file);
    first.database.setSetting("custom", { keep: true });
    first.database.db
      .prepare(
        "UPDATE cargo_objectives SET payload=json_remove(json_set(payload,'$.deliveredSCU',4),'$.loadedSCU','$.loadedShipId','$.loadEvidence')",
      )
      .run();
    first.database.db.exec(
      "DROP TABLE cargo_progress_activity; DROP TABLE cargo_progress_requests; PRAGMA user_version=5",
    );
    await first.close();
    services.splice(services.indexOf(first), 1);
    const s = new TrackingService(file);
    services.push(s);
    expect(row(s)).toMatchObject({
      quantitySCU: 9,
      deliveredSCU: 4,
      loadedSCU: 0,
      loadEvidence: "Unknown",
    });
    expect(s.database.getSetting("custom")).toEqual({ keep: true });
    expect(
      s.database.db.prepare("PRAGMA user_version").get()!.user_version,
    ).toBe(6);
  });
  it("reconciles supported cumulative log delivery without fabricating loading and ignores old events", () => {
    const s = setup();
    const mission = randomUUID(),
      objective = randomUUID();
    s.store.setState({
      contracts: s.domain().contracts.map((c) => ({
        ...c,
        missionId: mission,
        cargoObjectives: c.cargoObjectives.map((o) => ({
          ...o,
          externalObjectiveId: objective,
        })),
      })),
    });
    const line = (n: number, t: string) =>
      notification(
        "New Objective: Deliver " + n + "/9 SCU of Quartz to Area18",
        mission,
        objective,
        t,
      );
    apply(s, "Load", 5);
    feed(s, line(3, "2026-11-02T12:00:00Z"));
    expect(row(s)).toMatchObject({ loadedSCU: 2, deliveredSCU: 3 });
    feed(s, line(1, "2026-11-02T11:00:00Z"));
    expect(row(s)).toMatchObject({ loadedSCU: 2, deliveredSCU: 3 });
    feed(s, line(7, "2026-11-02T13:00:00Z"));
    expect(row(s)).toMatchObject({
      loadedSCU: 0,
      deliveredSCU: 7,
      loadEvidence: "Unknown",
    });
    const history = s.cargoActivity(s.domain().contracts[0].id);
    expect(history.filter((x) => x.source === "Log")).toHaveLength(2);
    expect(history.filter((x) => x.action === "Load")).toHaveLength(1);
  });
  it("preserves manual progress during OCR rescan without claiming OCR loading", () => {
    const s = new TrackingService(":memory:");
    services.push(s);
    const result: OcrResult = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
        ),
        "utf8",
      ),
    ).result;
    const id = randomUUID(),
      at = new Date().toISOString();
    const c: CaptureRecord = {
      id,
      capturedAt: at,
      source: "Manual",
      status: "Processed",
      displayId: "test",
      displayLabel: "Fixture",
      screenshot: null,
      width: result.width,
      height: result.height,
      bytes: 0,
      attempts: 1,
      error: null,
      result,
      observation: extractContract(result, id, at),
    };
    new CaptureRepository(s.database).put(c);
    s.processScan(id);
    expect(row(s).loadEvidence).toBe("Unknown");
    apply(s, "Load", 7);
    apply(s, "Deliver", 2);
    new CaptureRepository(s.database).put({
      ...c,
      observation: {
        ...c.observation!,
        reward: { ...c.observation!.reward, value: 34501 },
      },
    });
    s.processScan(id);
    expect(row(s)).toMatchObject({ loadedSCU: 5, deliveredSCU: 2 });
    expect(s.domain().contracts).toHaveLength(1);
    const progressResult = structuredClone(result);
    progressResult.lines = progressResult.lines.map((l) => ({
      ...l,
      text: l.text.replace("Deliver 0/8", "Deliver 4/8"),
    }));
    progressResult.text = progressResult.lines.map((l) => l.text).join("\n");
    new CaptureRepository(s.database).put({
      ...c,
      result: progressResult,
      observation: extractContract(progressResult, id, at),
    });
    const outcome = s.processScan(id);
    expect(outcome?.status).toBe("Pending corrections");
    expect(row(s)).toMatchObject({ loadedSCU: 5, deliveredSCU: 2 });
    expect(
      new CaptureRepository(s.database).get(id)?.observation?.objectives[0]
        .deliveredSCU.value,
    ).toBe(4);
  });
  it("protects loaded identities against edit/removal and bypassed delivery", () => {
    const s = setup();
    apply(s, "Load", 4);
    const c = s.domain().contracts[0];
    expect(() =>
      s.saveContract({
        id: c.id,
        draft: {
          name: c.name,
          payout: 1000,
          objectives: c.cargoObjectives.map((o) => ({ ...o, quantitySCU: 3 })),
        },
      }),
    ).toThrow();
    expect(() =>
      s.saveContract({
        id: c.id,
        draft: {
          name: c.name,
          payout: 1000,
          objectives: c.cargoObjectives.map((o) => ({ ...o, deliveredSCU: 2 })),
        },
      }),
    ).toThrow();
    expect(row(s)).toMatchObject({ loadedSCU: 4, deliveredSCU: 0 });
  });
  it("backs up progress consistently, blocks closed-loaded cleanup, and resets all new records", async () => {
    const folder = mkdtempSync(join(tmpdir(), "cargo-progress-reset-")),
      captures = join(folder, "captures");
    mkdirSync(captures);
    const s = setup(join(folder, "cargo.sqlite"));
    apply(s, "Load", 5);
    s.abandonContract(s.domain().contracts[0].id);
    const manager = new LocalDataManager(s, captures, {
      pause: async () => {},
      resume: async () => {},
    });
    expect(() => manager.preview("closed")).toThrow(/onboard/);
    const r = await manager.execute({
      token: manager.preview("reset").token,
      confirmed: true,
      resetText: "RESET",
    });
    const backup = new DatabaseSync(join(r.backupPath, "cargo-run.sqlite"));
    expect(
      backup.prepare("SELECT COUNT(*) AS n FROM cargo_progress_activity").get()!
        .n,
    ).toBe(1);
    expect(backup.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    backup.close();
    for (const t of [
      "contracts",
      "cargo_progress_activity",
      "cargo_progress_requests",
    ])
      expect(
        s.database.db.prepare("SELECT COUNT(*) AS n FROM " + t).get()!.n,
      ).toBe(0);
    expect(s.database.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

describe("Cargo reconciliation and history integrity", () => {
  it("retains loaded cargo and raw evidence when a supported notification changes its identity", () => {
    const s = setup(),
      mission = randomUUID(),
      objective = randomUUID();
    s.store.setState({
      contracts: s
        .domain()
        .contracts.map((c) => ({
          ...c,
          missionId: mission,
          cargoObjectives: c.cargoObjectives.map((o) => ({
            ...o,
            externalObjectiveId: objective,
          })),
        })),
    });
    apply(s, "Load", 5);
    feed(
      s,
      notification(
        "New Objective: Deliver 1/9 SCU of Titanium to Area18",
        mission,
        objective,
        "2026-11-02T15:00:00Z",
      ),
    );
    expect(row(s)).toMatchObject({
      commodity: "Quartz",
      loadedSCU: 5,
      deliveredSCU: 0,
    });
    expect(
      s.database.db.prepare("SELECT COUNT(*) AS n FROM mission_events").get()!
        .n,
    ).toBe(1);
    expect(
      s.database.diagnostics().some((d) => d.kind === "Cargo conflict"),
    ).toBe(true);
  });
  it("refuses undo after verified external delivery and permits unloading an already over-capacity record", () => {
    const s = setup(),
      mission = randomUUID(),
      objective = randomUUID();
    s.store.setState({
      contracts: s
        .domain()
        .contracts.map((c) => ({
          ...c,
          missionId: mission,
          cargoObjectives: c.cargoObjectives.map((o) => ({
            ...o,
            externalObjectiveId: objective,
          })),
        })),
    });
    apply(s, "Load", 5);
    const manual = s.cargoActivity(s.domain().contracts[0].id)[0];
    feed(
      s,
      notification(
        "New Objective: Deliver 2/9 SCU of Quartz to Area18",
        mission,
        objective,
        "2026-11-02T16:00:00Z",
      ),
    );
    const r = request(s, "Undo", 0);
    r.changes[0].undoId = manual.id;
    expect(() => s.cargoProgress(r)).toThrow(/latest/);
    const ship = s.domain().selectedShipId;
    s.store.setState({
      contracts: s
        .domain()
        .contracts.map((c) => ({
          ...c,
          cargoObjectives: c.cargoObjectives.map((o) => ({
            ...o,
            loadedSCU: 1000,
            quantitySCU: 1100,
            loadedShipId: ship,
          })),
        })),
    });
    apply(s, "Unload", 1);
    expect(row(s).loadedSCU).toBe(999);
  });
  it("cleans closed cargo audits after unloading while preserving active activity and backup foreign keys", async () => {
    const folder = mkdtempSync(join(tmpdir(), "cargo-history-")),
      directory = join(folder, "captures");
    mkdirSync(directory);
    const s = setup(join(folder, "cargo.sqlite"), 2);
    apply(s, "Load", 5);
    apply(s, "Unload", 5);
    s.abandonContract(s.domain().contracts[0].id);
    apply(s, "Load", 3, 1);
    const closed = s.domain().contracts[0].id,
      active = s.domain().contracts[1].id,
      m = new LocalDataManager(s, directory, {
        pause: async () => {},
        resume: async () => {},
      });
    const result = await m.execute({
      token: m.preview("closed").token,
      confirmed: true,
    });
    expect(s.domain().contracts).toHaveLength(1);
    expect(s.cargoActivity(active)).toHaveLength(1);
    expect(
      s.database.db
        .prepare(
          "SELECT COUNT(*) AS n FROM cargo_progress_activity WHERE contract_id=?",
        )
        .get(closed)!.n,
    ).toBe(0);
    expect(s.database.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const b = new DatabaseSync(join(result.backupPath, "cargo-run.sqlite"));
    expect(
      b.prepare("SELECT COUNT(*) AS n FROM cargo_progress_activity").get()!.n,
    ).toBe(3);
    expect(b.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    b.close();
  });
});

describe("Cargo precision and same-contract allocations", () => {
  it("keeps same-commodity rows distinct within one contract across load and delivery", () => {
    const s = new TrackingService(":memory:");
    services.push(s);
    s.saveContract({
      draft: {
        name: "Two same commodities",
        payout: 2000,
        objectives: [
          {
            commodity: "Quartz",
            pickupLocation: "Everus",
            destination: "Area18",
            quantitySCU: 9,
          },
          {
            commodity: "Quartz",
            pickupLocation: "Everus",
            destination: "Area18",
            quantitySCU: 9,
          },
        ],
      },
    });
    const first = row(s),
      second = row(s, 0, 1);
    expect(first.id).not.toBe(second.id);
    apply(s, "Load", 7);
    apply(s, "Deliver", 2);
    expect(row(s)).toMatchObject({ loadedSCU: 5, deliveredSCU: 2 });
    expect(row(s, 0, 1)).toMatchObject({ loadedSCU: 0, deliveredSCU: 0 });
    expect(awaitingPickup(row(s, 0, 1))).toBe(9);
  });
  it("supports fractional SCU without floating drift and rejects unsupported precision", () => {
    const s = setup();
    apply(s, "Load", 0.3);
    apply(s, "Deliver", 0.1);
    expect(row(s)).toMatchObject({ loadedSCU: 0.2, deliveredSCU: 0.1 });
    apply(s, "Unload", 0.2);
    expect(row(s).loadedSCU).toBe(0);
    expect(() => apply(s, "Load", 0.1234567)).toThrow(/decimal/);
    expect(() => apply(s, "Load", 0.000000001)).toThrow(/decimal/);
  });
});
