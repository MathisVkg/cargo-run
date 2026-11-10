import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { TrackingService } from "../electron/main/trackingService";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { LocalDataManager } from "../electron/main/storage/maintenance";
import {
  checklist,
  checklistStamp,
  checklistProgress,
} from "../src/types/workflow";
import { progressStamp } from "../src/types/progress";
import { groupByLocation } from "../src/stores/selectors";
import { workflow } from "../electron/main/workflow";
import type { CaptureRecord } from "../src/types/ocr";
const services: TrackingService[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const s of services.splice(0)) await s.close();
});
function service(file = ":memory:") {
  const s = new TrackingService(file);
  services.push(s);
  return s;
}
function add(s: TrackingService, count = 1) {
  for (let i = 0; i < count; i++)
    s.saveContract({
      draft: {
        name: "Haul " + i,
        payout: 1000,
        objectives: [
          {
            commodity: "Quartz",
            pickupLocation: "Port Tressler",
            destination: "NB Int. Spaceport",
            quantitySCU: 9,
          },
        ],
      },
    });
  return s;
}
const row = (s: TrackingService, c = 0) =>
  s.domain().contracts[c].cargoObjectives[0];
function mark(
  s: TrackingService,
  kind: "pickup" | "delivery",
  done = true,
  c = 0,
) {
  const o = row(s, c);
  return s.checklist({
    requestId: randomUUID(),
    changes: [{ objectiveId: o.id, kind, done, expected: checklistStamp(o) }],
  });
}
function physical(
  s: TrackingService,
  action: "Load" | "Deliver" | "SetLoaded" | "Unload" | "Undo",
  quantity: number,
  undoId?: string,
) {
  const o = row(s);
  return s.cargoProgress({
    requestId: randomUUID(),
    shipId: s.domain().selectedShipId,
    changes: [
      {
        objectiveId: o.id,
        action,
        quantity,
        expected: progressStamp(o),
        ...(undoId ? { undoId } : {}),
      },
    ],
  });
}
const real = readFileSync(
  join(__dirname, "fixtures/log/nov05-sanitized.log"),
  "utf8",
)
  .trim()
  .split(/\r?\n/);
function feed(s: TrackingService, lines = real) {
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    {
      path: "owned-test-log",
      generation: "fixture",
      offset: 0,
      mode: "Import",
    },
  );
}
function ocr(s: TrackingService) {
  const f = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
      ),
      "utf8",
    ),
  );
  const id = randomUUID(),
    capturedAt = "2026-11-05T18:24:30Z",
    c: CaptureRecord = {
      id,
      capturedAt,
      source: "Manual",
      status: "Processed",
      displayId: "test",
      displayLabel: "fixture",
      screenshot: null,
      width: f.result.width,
      height: f.result.height,
      bytes: 0,
      attempts: 1,
      error: null,
      result: f.result,
      observation: extractContract(f.result, id, capturedAt),
    };
  new CaptureRepository(s.database).put(c);
  expect(s.processScan(id)?.status).toBe("Imported");
  return c;
}
function finish(s: TrackingService, ids: string[] = []) {
  return s.finishRun({
    confirmed: true,
    runId: s.domain().currentRun.id,
    expectedRevision: s.snapshot().revision,
    completeIds: ids,
  });
}
describe("Manual-first cargo workflow", () => {
  it("starts Off and imports OCR with independent checklist reminders, then manually completes without movement or payout", () => {
    const s = service();
    expect(s.snapshot().workflow.automaticCompletion).toBe(false);
    ocr(s);
    mark(s, "pickup");
    mark(s, "delivery");
    expect(row(s)).toMatchObject({ loadedSCU: 0, deliveredSCU: 0 });
    expect(checklist(row(s))).toMatchObject({
      pickedUp: true,
      delivered: true,
    });
    expect(s.domain().contracts[0].status).toBe("Active");
    s.completeContract(s.domain().contracts[0].id);
    expect(s.domain().contracts[0]).toMatchObject({
      status: "Completed",
      confirmedEarnings: 0,
      manualClosure: { kind: "Completed" },
    });
    expect(s.lifecycleHistory(s.domain().contracts[0].id)[0].source).toBe(
      "Manual",
    );
  });
  it("targets identical objectives independently and atomically marks all picked up without recording quantities", () => {
    const s = add(service(), 3),
      g = groupByLocation(s.domain().contracts, "pickup");
    expect(g).toHaveLength(1);
    expect(g[0].rows).toHaveLength(3);
    mark(s, "pickup");
    expect(
      s.domain().contracts.map((c) => checklist(c.cargoObjectives[0]).pickedUp),
    ).toEqual([true, false, false]);
    s.checklist({
      requestId: randomUUID(),
      changes: s
        .domain()
        .contracts.slice(1)
        .map((c) => ({
          objectiveId: c.cargoObjectives[0].id,
          kind: "pickup",
          done: true,
          expected: checklistStamp(c.cargoObjectives[0]),
        })),
    });
    expect(
      s
        .domain()
        .contracts.every((c) => checklist(c.cargoObjectives[0]).pickedUp),
    ).toBe(true);
    mark(s, "pickup", false);
    expect(checklist(row(s)).pickedUp).toBe(false);
    expect(
      s.domain().contracts.every((c) => c.cargoObjectives[0].loadedSCU === 0),
    ).toBe(true);
  });
  it("keeps pickup and delivery independent and does not close a fully marked multi-objective contract", () => {
    const s = add(service()),
      c = s.domain().contracts[0];
    s.saveContract({
      id: c.id,
      draft: {
        name: c.name,
        payout: c.payout,
        objectives: [
          ...c.cargoObjectives,
          {
            commodity: "Hydrogen",
            pickupLocation: "Port Tressler",
            destination: "Other port",
            quantitySCU: 3,
          },
        ],
      },
    });
    mark(s, "delivery");
    expect(checklistProgress(s.domain().contracts[0])).toEqual({
      done: 1,
      total: 2,
    });
    expect(checklist(row(s)).pickedUp).toBe(false);
    const o = s.domain().contracts[0].cargoObjectives[1];
    s.checklist({
      requestId: randomUUID(),
      changes: [
        {
          objectiveId: o.id,
          kind: "delivery",
          done: true,
          expected: checklistStamp(o),
        },
      ],
    });
    expect(checklistProgress(s.domain().contracts[0])).toEqual({
      done: 2,
      total: 2,
    });
    expect(s.domain().contracts[0].status).toBe("Active");
  });
  it("deduplicates requests and rolls back mixed stale/invalid batches without changing valid entries", () => {
    const s = add(service(), 2),
      o = row(s),
      request = {
        requestId: randomUUID(),
        changes: [
          {
            objectiveId: o.id,
            kind: "pickup",
            done: true,
            expected: checklistStamp(o),
          },
        ],
      };
    s.checklist(request);
    s.checklist(request);
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM objective_checklist_activity")
        .get()!.n,
    ).toBe(1);
    expect(() => s.checklist({ ...request, requestId: randomUUID() })).toThrow(
      /changed/,
    );
    const before = structuredClone(s.domain().contracts);
    expect(() =>
      s.checklist({
        requestId: randomUUID(),
        changes: [
          {
            objectiveId: row(s, 1).id,
            kind: "pickup",
            done: true,
            expected: checklistStamp(row(s, 1)),
          },
          { objectiveId: "missing", kind: "pickup", done: true, expected: "" },
        ],
      }),
    ).toThrow();
    expect(s.domain().contracts).toEqual(before);
  });
  it("leaves partial physical progress pending and marks only a fully recorded delivery done; undo restores it safely", () => {
    const s = add(service());
    mark(s, "pickup");
    physical(s, "Load", 9);
    physical(s, "Deliver", 4);
    expect(checklist(row(s)).delivered).toBe(false);
    physical(s, "Deliver", 5);
    expect(checklist(row(s))).toMatchObject({
      pickedUp: true,
      delivered: true,
      deliverySource: "Recorded",
    });
    const activity = s.cargoActivity(s.domain().contracts[0].id)[0];
    physical(s, "Undo", 0, activity.id);
    expect(row(s)).toMatchObject({ loadedSCU: 5, deliveredSCU: 4 });
    expect(checklist(row(s))).toMatchObject({
      pickedUp: true,
      delivered: false,
    });
  });
  it("does not undo a player's later independent checklist choice when undoing full physical delivery", () => {
    const s = add(service());
    physical(s, "Load", 9);
    physical(s, "Deliver", 9);
    const a = s.cargoActivity(s.domain().contracts[0].id)[0];
    mark(s, "delivery", false);
    mark(s, "delivery", true);
    physical(s, "Undo", 0, a.id);
    expect(checklist(row(s))).toMatchObject({
      delivered: true,
      deliverySource: "Player",
    });
    expect(row(s).deliveredSCU).toBe(0);
  });
  it("preserves checklist identity through saved OCR re-extraction and starts newly discovered rows pending", () => {
    const s = service(),
      cap = ocr(s);
    mark(s, "pickup");
    mark(s, "delivery");
    const id = row(s).id,
      before = structuredClone(checklist(row(s)));
    const r = structuredClone(cap.result!);
    r.lines = r.lines.map((l) => ({
      ...l,
      text: l.text.replace("Deliver", "Deliver  "),
    }));
    r.text = r.lines.map((l) => l.text).join("\n");
    new CaptureRepository(s.database).put({
      ...cap,
      result: r,
      observation: extractContract(r, cap.id, cap.capturedAt),
    });
    expect(s.processScan(cap.id)?.status).toBe("Updated");
    expect(row(s).id).toBe(id);
    expect(checklist(row(s))).toEqual(before);
    const c = s.domain().contracts[0];
    s.saveContract({
      id: c.id,
      draft: {
        name: c.name,
        payout: c.payout,
        objectives: [
          ...c.cargoObjectives,
          {
            commodity: "Tin",
            pickupLocation: "Port Tressler",
            destination: "Other",
            quantitySCU: 2,
          },
        ],
      },
    });
    expect(checklist(s.domain().contracts[0].cargoObjectives[1])).toMatchObject(
      { pickedUp: false, delivered: false },
    );
  });
  it("permits manual completion with outstanding entries and retained cargo, including verified MissionId contracts", () => {
    const s = add(service());
    physical(s, "Load", 5);
    const c = s.domain().contracts[0],
      mid = randomUUID();
    s.store.setState({ contracts: [{ ...c, missionId: mid, source: "Log" }] });
    s.database.saveDomain(s.domain());
    s.completeContract(c.id);
    expect(row(s)).toMatchObject({ loadedSCU: 5, deliveredSCU: 0 });
    expect(checklist(row(s))).toMatchObject({
      pickedUp: false,
      delivered: false,
    });
    expect(s.domain().contracts[0]).toMatchObject({
      status: "Completed",
      confirmedEarnings: 0,
      missionId: mid,
    });
    expect(() => mark(s, "pickup")).toThrow(/Active objective/);
  });
  it("finishes only the run and carries active contracts/checklists/cargo forward, then completes only selected contracts atomically", () => {
    const s = add(service(), 3);
    mark(s, "delivery");
    physical(s, "Load", 3);
    finish(s);
    expect(s.domain().contracts.every((c) => c.status === "Active")).toBe(true);
    expect(
      s.domain().runs[0].contractSnapshots[0].cargoObjectives[0].loadedSCU,
    ).toBe(3);
    const ids = s.domain().contracts.map((c) => c.id);
    finish(s, [ids[1]]);
    expect(s.domain().contracts.map((c) => c.status)).toEqual([
      "Active",
      "Completed",
      "Active",
    ]);
    expect(s.domain().currentRun.contractIds).toEqual([ids[0], ids[2]]);
    expect(row(s).loadedSCU).toBe(3);
    expect(s.domain().contracts.every((c) => c.confirmedEarnings === 0)).toBe(
      true,
    );
  });
  it("rejects stale or invalid selected-contract run finalization before any contract is changed", () => {
    const s = add(service(), 2),
      state = s.snapshot(),
      request = {
        confirmed: true,
        runId: state.currentRun.id,
        expectedRevision: state.revision,
        completeIds: [state.contracts[0].id],
      };
    mark(s, "pickup");
    expect(() => s.finishRun(request)).toThrow(/changed/);
    expect(s.domain().contracts.every((c) => c.status === "Active")).toBe(true);
    expect(() =>
      s.finishRun({
        ...request,
        expectedRevision: s.snapshot().revision,
        completeIds: [state.contracts[0].id, "missing"],
      }),
    ).toThrow();
    expect(s.domain().runs).toEqual([]);
  });
  it("retains raw lifecycle/identity evidence with Beta Off and does not replay it on enable or restart", async () => {
    const file = join(
        mkdtempSync(join(tmpdir(), "cargo-manual-")),
        "cargo.sqlite",
      ),
      s = service(file);
    feed(s);
    const c = ocr(s);
    expect(s.domain().contracts[0].status).toBe("Active");
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    expect(s.database.counts().completed).toBe(1);
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM mission_identity_evidence")
        .get()!.n,
    ).toBeGreaterThan(0);
    s.setWorkflow({ automaticCompletion: true });
    feed(s);
    expect(s.domain().contracts[0].status).toBe("Active");
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    await s.close();
    services.splice(services.indexOf(s), 1);
    const reopened = service(file);
    expect(reopened.domain().contracts[0].status).toBe("Active");
    expect(new CaptureRepository(reopened.database).get(c.id)).toBeTruthy();
  });
  it("applies new verified lifecycle evidence only after explicit Beta activation, independently of checklist state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T18:00:00Z"));
    const s = service();
    s.setWorkflow({ automaticCompletion: true });
    vi.setSystemTime(new Date("2026-11-05T19:00:00Z"));
    feed(s);
    const f = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
        ),
        "utf8",
      ),
    );
    f.result.lines = f.result.lines.map((l: { text: string }) => ({
      ...l,
      text: l.text
        .replaceAll("Agricultural Supplies", "Corundum")
        .replace("Direct Small Cargo", "Direct Extra Small Cargo"),
    }));
    f.result.text = f.result.lines
      .map((l: { text: string }) => l.text)
      .join("\n");
    const id = randomUUID(),
      c: CaptureRecord = {
        id,
        capturedAt: "2026-11-05T18:24:30Z",
        source: "Manual",
        status: "Processed",
        displayId: "test",
        displayLabel: "synthetic",
        screenshot: null,
        width: f.result.width,
        height: f.result.height,
        bytes: 0,
        attempts: 1,
        error: null,
        result: f.result,
        observation: extractContract(f.result, id, "2026-11-05T18:24:30Z"),
      };
    new CaptureRepository(s.database).put(c);
    s.processScan(id);
    expect(s.domain().contracts[0].status).toBe("Completed");
    expect(checklist(row(s)).delivered).toBe(false);
    expect(s.domain().contracts[0].confirmedEarnings).toBe(0);
  });
  it("hides existing eligible prompts while Off without deleting them, restores manual confirmation on re-enable and does not auto replay", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T18:00:00Z"));
    const s = add(service());
    s.setWorkflow({ automaticCompletion: true });
    vi.setSystemTime(new Date("2026-11-05T19:00:00Z"));
    const mid = randomUUID(),
      at = "2026-11-05T18:30:00Z";
    feed(s, [
      "<" +
        at +
        '> Added notification "Contract Accepted: Haul 0" MissionId: [' +
        mid +
        "]",
      "<" +
        at +
        '> Added notification "Contract Complete: Haul 0" MissionId: [' +
        mid +
        "]",
    ]);
    expect(s.snapshot().lifecycleIssues).toHaveLength(1);
    const eligible = workflow(s.database).eligibleIds;
    s.setWorkflow({ automaticCompletion: false });
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    expect(workflow(s.database).eligibleIds).toEqual(eligible);
    s.setWorkflow({ automaticCompletion: true });
    const issue = s.snapshot().lifecycleIssues![0];
    expect(issue).toBeTruthy();
    expect(s.domain().contracts[0].status).toBe("Active");
    s.resolveLifecycle({
      missionId: mid,
      contractId: s.domain().contracts[0].id,
      version: issue.version,
      confirmed: true,
    });
    expect(s.domain().contracts[0].status).toBe("Completed");
  });
  it("migrates schema 8 additively, preserves physical records/settings/captures and persists checklist actions", async () => {
    const folder = mkdtempSync(join(tmpdir(), "cargo-schema9-")),
      file = join(folder, "cargo.sqlite"),
      s = add(service(file));
    physical(s, "Load", 4);
    s.setPreferences({ favoriteShipIds: ["c2"] });
    const before = structuredClone(s.domain());
    await s.close();
    services.splice(services.indexOf(s), 1);
    const raw = new DatabaseSync(file);
    raw.exec(
      "DROP TABLE objective_checklist_activity; DROP TABLE checklist_requests; DELETE FROM settings WHERE key='workflow.automation'; PRAGMA user_version=8",
    );
    raw.close();
    const upgraded = service(file);
    expect(upgraded.domain()).toEqual(before);
    expect(upgraded.snapshot().workflow.automaticCompletion).toBe(false);
    expect(upgraded.snapshot().preferences.favoriteShipIds).toEqual(["c2"]);
    mark(upgraded, "pickup");
    const id = row(upgraded).id;
    await upgraded.close();
    services.splice(services.indexOf(upgraded), 1);
    const again = service(file);
    expect(row(again).id).toBe(id);
    expect(checklist(row(again)).pickedUp).toBe(true);
    expect(row(again).loadedSCU).toBe(4);
    expect(again.database.db.prepare("PRAGMA foreign_key_check").all()).toEqual(
      [],
    );
  });
  it("backs up and resets checklist data while retaining workflow/favorites and keeping monitoring stopped", async () => {
    const folder = mkdtempSync(join(tmpdir(), "cargo-reset9-")),
      s = add(service(join(folder, "cargo.sqlite")));
    mkdirSync(join(folder, "captures"));
    mark(s, "pickup");
    physical(s, "Load", 4);
    s.completeContract(s.domain().contracts[0].id);
    s.setPreferences({ favoriteShipIds: ["c2"] });
    const manager = new LocalDataManager(s, join(folder, "captures"), {
      pause: async () => {},
      resume: async () => {},
    });
    expect(() => manager.preview("closed")).toThrow(/onboard/);
    const result = await manager.execute({
      token: manager.preview("reset").token,
      confirmed: true,
      resetText: "RESET",
    });
    expect(s.domain().contracts).toEqual([]);
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM objective_checklist_activity")
        .get()!.n,
    ).toBe(0);
    expect(s.snapshot().preferences.favoriteShipIds).toEqual(["c2"]);
    expect(s.snapshot().tracking.enabled).toBe(false);
    expect(s.snapshot().workflow.automaticCompletion).toBe(false);
    const backup = new DatabaseSync(
      join(result.backupPath, "cargo-run.sqlite"),
      { readOnly: true },
    );
    expect(
      backup
        .prepare("SELECT COUNT(*) AS n FROM objective_checklist_activity")
        .get()!.n,
    ).toBe(1);
    expect(backup.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    backup.close();
  });
  it("keeps a pre-upgrade unresolved prompt hidden by default and available only for explicit confirmation after opt-in", async () => {
    const folder = mkdtempSync(join(tmpdir(), "cargo-legacy-prompt-")),
      file = join(folder, "cargo.sqlite"),
      s = add(service(file)),
      mid = randomUUID();
    feed(s, [
      '<2026-11-05T18:00:00Z> Added notification "Contract Accepted: Haul 0" MissionId: [' +
        mid +
        "]",
      '<2026-11-05T18:30:00Z> Added notification "Contract Complete: Haul 0" MissionId: [' +
        mid +
        "]",
    ]);
    await s.close();
    services.splice(services.indexOf(s), 1);
    const raw = new DatabaseSync(file);
    raw.exec(
      "DELETE FROM settings WHERE key='workflow.automation'; PRAGMA user_version=8",
    );
    raw.close();
    const migrated = service(file);
    expect(migrated.snapshot().lifecycleIssues).toEqual([]);
    expect(workflow(migrated.database).eligibleIds).toHaveLength(1);
    migrated.setWorkflow({ automaticCompletion: true });
    expect(migrated.snapshot().lifecycleIssues).toHaveLength(1);
    expect(migrated.domain().contracts[0].status).toBe("Active");
  });
  it("keeps a verified ledger contract Active on both completion and abandonment while Beta is Off", () => {
    const s = add(service()),
      c = s.domain().contracts[0],
      mid = randomUUID();
    s.store.setState({ contracts: [{ ...c, missionId: mid }] });
    s.database.saveDomain(s.domain());
    feed(s, [
      '<2026-11-10T18:00:00Z> Added notification "Contract Accepted: Haul 0" MissionId: [' +
        mid +
        "]",
      '<2026-11-10T18:01:00Z> Added notification "Contract Complete: Haul 0" MissionId: [' +
        mid +
        "]",
      '<2026-11-10T18:02:00Z> Added notification "Contract Abandoned: Haul 0" MissionId: [' +
        mid +
        "]",
    ]);
    expect(s.domain().contracts[0].status).toBe("Active");
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    expect(workflow(s.database).eligibleIds).toEqual([]);
  });
});
