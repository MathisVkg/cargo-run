import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TrackingService } from "../electron/main/trackingService";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { parseLogLine } from "../electron/main/log/parser";
import { notification } from "./fixtures/log";
import { progressStamp } from "../src/types/progress";
import { recordedOnboard } from "../src/stores/selectors";
import { LocalDataManager } from "../electron/main/storage/maintenance";
import type { CaptureRecord, OcrResult } from "../src/types/ocr";
const services: TrackingService[] = [];
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
});
const time = "2026-11-02T18:25:00.000Z";
const ended = (mission: string, state = "COMPLETED") =>
  "<" +
  time +
  "> [MissionEnded] MissionId: [" +
  mission +
  "] mission_state MISSION_STATE_" +
  state;
const end = (mission: string) =>
  "<" +
  time +
  "> [EndMission] MissionId: [" +
  mission +
  "] CompletionType[Complete] Reason[Mission Ended]";
function service(file = ":memory:") {
  const s = new TrackingService(file);
  services.push(s);
  return s;
}
function feed(s: TrackingService, ...lines: string[]) {
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    {
      path: "synthetic-Game.log",
      generation: "synthetic",
      offset: 0,
      mode: "Import",
    },
  );
}
function capture(s: TrackingService) {
  const result: OcrResult = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
        ),
        "utf8",
      ),
    ).result,
    id = randomUUID(),
    at = "2026-11-02T18:00:00.000Z";
  const c: CaptureRecord = {
    id,
    capturedAt: at,
    source: "Manual",
    status: "Processed",
    displayId: "fixture",
    displayLabel: "Existing OCR fixture",
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
  expect(s.processScan(id)?.status).toBe("Imported");
  return c;
}
function bind(s: TrackingService, mission = randomUUID()) {
  const c = s.domain().contracts[0];
  s.store.setState({
    contracts: s
      .domain()
      .contracts.map((x) => (x.id === c.id ? { ...x, missionId: mission } : x)),
  });
  s.database.transaction(() => s.database.saveDomain(s.domain()));
  return mission;
}
function cargo(
  s: TrackingService,
  action: "Load" | "Deliver",
  quantity: number,
) {
  const o = s.domain().contracts[0].cargoObjectives[0];
  s.cargoProgress({
    requestId: randomUUID(),
    shipId: s.domain().selectedShipId,
    changes: [
      { objectiveId: o.id, action, quantity, expected: progressStamp(o) },
    ],
  });
}
describe("Mission lifecycle normalization and inventory", () => {
  it("normalizes the three explicit completion formats to one semantic event ID", () => {
    const m = randomUUID(),
      events = [
        ended(m),
        end(m),
        notification("Contract Complete: Synthetic Cargo", m, undefined, time),
      ].map((l) => parseLogLine(l));
    expect(
      events.every(
        (e) =>
          e.type === "event" &&
          e.event.kind === "Completed" &&
          e.event.timestamp === time &&
          e.event.missionId === m,
      ),
    ).toBe(true);
    expect(
      new Set(events.map((e) => (e.type === "event" ? e.event.id : ""))),
    ).toHaveLength(1);
  });
  it("rejects missing identities and unsupported failure/cancellation states without guessing", () => {
    expect(
      parseLogLine(
        "<" + time + "> MissionEnded mission_state MISSION_STATE_COMPLETED",
      ).type,
    ).toBe("error");
    expect(parseLogLine(ended(randomUUID(), "FAILED")).type).toBe("ignore");
    expect(
      parseLogLine(
        end(randomUUID()).replace("Reason[Mission Ended]", "Reason[Cancelled]"),
      ).type,
    ).toBe("ignore");
  });
  it("closes verified scenario A without changing full delivery, quantities or earnings", () => {
    const s = service();
    capture(s);
    const m = bind(s);
    cargo(s, "Load", 8);
    cargo(s, "Deliver", 8);
    expect(s.domain().contracts[0].status).toBe("Active");
    feed(s, ended(m));
    const c = s.domain().contracts[0];
    expect(c).toMatchObject({
      status: "Completed",
      completedAt: time,
      confirmedEarnings: 0,
    });
    expect(c.cargoObjectives[0]).toMatchObject({
      loadedSCU: 0,
      deliveredSCU: 8,
      quantitySCU: 8,
    });
    expect(s.lifecycleHistory(c.id)).toHaveLength(1);
  });
  it("preserves scenario B's three SCU, original ship, objectives and OCR evidence", () => {
    const s = service(),
      cap = capture(s),
      m = bind(s),
      id = s.domain().contracts[0].cargoObjectives[0].id;
    cargo(s, "Load", 8);
    cargo(s, "Deliver", 5);
    const ship = s.domain().selectedShipId;
    feed(s, end(m));
    const c = s.domain().contracts[0];
    expect(c.status).toBe("Completed");
    expect(c.cargoObjectives[0]).toMatchObject({
      id,
      loadedSCU: 3,
      deliveredSCU: 5,
      loadedShipId: ship,
    });
    expect(recordedOnboard(s.domain().contracts, ship)).toBe(3);
    expect(s.contractEvidence(c.id)).toHaveLength(1);
    expect(new CaptureRepository(s.database).get(cap.id)?.result).toEqual(
      cap.result,
    );
    expect(s.cargoActivity(c.id)).toHaveLength(2);
  });
  it("closes scenario C while physical progress stays unknown with no invented cargo activity", () => {
    const s = service();
    capture(s);
    const m = bind(s);
    feed(s, ended(m));
    const c = s.domain().contracts[0];
    expect(c.status).toBe("Completed");
    expect(c.cargoObjectives[0]).toMatchObject({
      loadedSCU: 0,
      deliveredSCU: 0,
      loadEvidence: "Unknown",
    });
    expect(s.cargoActivity(c.id)).toEqual([]);
  });
  it("deduplicates scenario D across log formats, repeat imports and restart", async () => {
    const file = join(
        mkdtempSync(join(tmpdir(), "cargo-lifecycle-")),
        "cargo.sqlite",
      ),
      s = service(file);
    capture(s);
    const m = bind(s),
      id = s.domain().contracts[0].id;
    feed(
      s,
      ended(m),
      end(m),
      notification("Contract Complete: Synthetic Cargo", m, undefined, time),
      ended(m),
    );
    expect(s.lifecycleHistory(id)).toHaveLength(1);
    expect(s.database.counts().completed).toBe(1);
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM lifecycle_evidence")
        .get()!.n,
    ).toBe(3);
    await s.close();
    services.splice(services.indexOf(s), 1);
    const reopened = service(file);
    feed(reopened, ended(m));
    expect(reopened.lifecycleHistory(id)).toHaveLength(1);
    expect(reopened.domain().contracts[0].confirmedEarnings).toBe(0);
  });
  it("supports verified abandonment while retaining loaded cargo and zero earnings", () => {
    const s = service();
    capture(s);
    const m = bind(s);
    cargo(s, "Load", 4);
    feed(
      s,
      ended(m, "ABANDONED"),
      notification("Contract Abandoned: Synthetic Cargo", m, undefined, time),
    );
    const c = s.domain().contracts[0];
    expect(c.status).toBe("Abandoned");
    expect(c.cargoObjectives[0].loadedSCU).toBe(4);
    expect(c.confirmedEarnings).toBe(0);
    expect(s.lifecycleHistory(c.id)).toHaveLength(1);
  });
  it("keeps award evidence with an empty MissionId completely separate from earnings", () => {
    const s = service();
    capture(s);
    const m = bind(s),
      award =
        "<" + time + '> Added notification "Awarded 61500 aUEC" MissionId: []';
    feed(s, ended(m), award, award);
    expect(parseLogLine(award).type).toBe("reward");
    expect(s.domain().contracts[0].confirmedEarnings).toBe(0);
    expect(
      s.database.db
        .prepare(
          "SELECT COUNT(*) AS n FROM lifecycle_evidence WHERE kind='Reward'",
        )
        .get()!.n,
    ).toBe(1);
    expect(
      s.database.diagnostics().filter((d) => d.kind === "Unattributed reward"),
    ).toHaveLength(1);
    for (let i = 0; i < 205; i++) feed(s, ended(randomUUID()));
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM unattributed_rewards")
        .get()!.n,
    ).toBe(1);
  });
  it("does not fabricate event time when only receipt time exists", () => {
    const s = service();
    capture(s);
    const m = bind(s);
    feed(
      s,
      "[MissionEnded] MissionId: [" +
        m +
        "] mission_state MISSION_STATE_COMPLETED",
    );
    const c = s.domain().contracts[0];
    expect(c.completedAt).toBeUndefined();
    expect(c.lifecycle?.eventAt).toBeNull();
    feed(s, ended(m, "ABANDONED"));
    expect(s.domain().contracts[0].status).toBe("Completed");
    expect(s.lifecycleHistory(c.id)).toHaveLength(1);
    feed(s, ended(m));
    expect(s.domain().contracts[0].completedAt).toBe(time);
    expect(s.lifecycleHistory(c.id)).toHaveLength(1);
    expect(s.lifecycleHistory(c.id)[0].at).toBe(time);
    expect(s.lifecycleHistory(c.id)[0].previousStatus).toBe("Active");
  });
});
describe("Safe late OCR mission association", () => {
  it("preserves unmatched events without creating placeholder contracts", () => {
    const s = service();
    feed(s, ended(randomUUID()));
    expect(s.domain().contracts).toEqual([]);
    expect(s.database.counts().unresolved).toBe(1);
    expect(s.snapshot().lifecycleIssues).toEqual([]);
  });
  it("requires explicit association for title-only completion and preserves physical inventory", () => {
    const s = service();
    capture(s);
    cargo(s, "Load", 4);
    const before = structuredClone(s.domain().contracts[0]),
      m = randomUUID();
    feed(
      s,
      notification("Contract Complete: " + before.name, m, undefined, time),
    );
    feed(
      s,
      notification("Contract Complete: " + before.name, m, undefined, time),
    );
    const issues = s.snapshot().lifecycleIssues!;
    expect(issues).toHaveLength(1);
    expect(s.domain().contracts[0].status).toBe("Active");
    expect(() =>
      s.resolveLifecycle({
        missionId: m,
        contractId: before.id,
        version: issues[0].version,
      }),
    ).toThrow(/Confirm/);
    s.resolveLifecycle({
      missionId: m,
      contractId: before.id,
      version: issues[0].version,
      confirmed: true,
    });
    const c = s.domain().contracts[0];
    expect(c.id).toBe(before.id);
    expect(c.status).toBe("Completed");
    expect(c.cargoObjectives).toEqual(before.cargoObjectives);
    expect(c.missionAssociation?.source).toBe("User confirmed");
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    expect(s.lifecycleHistory(c.id)).toHaveLength(1);
  });
  it("does not guess between distinct identical OCR instances or use closed history", () => {
    const s = service();
    capture(s);
    const first = s.domain().contracts[0];
    const second = {
      ...structuredClone(first),
      id: randomUUID(),
      cargoObjectives: first.cargoObjectives.map((o) => ({
        ...o,
        id: randomUUID(),
      })),
    };
    second.cargoObjectives.forEach((o) => (o.contractId = second.id));
    s.store.setState({
      contracts: [
        first,
        second,
        {
          ...structuredClone(first),
          id: randomUUID(),
          status: "Abandoned",
          cargoObjectives: [],
        },
      ],
    });
    feed(
      s,
      notification(
        "Contract Complete: " + first.name,
        randomUUID(),
        undefined,
        time,
      ),
    );
    expect(s.snapshot().lifecycleIssues![0].candidates).toHaveLength(2);
    expect(
      s.domain().contracts.filter((c) => c.status === "Active"),
    ).toHaveLength(2);
  });
  it("automatically closes an unbound OCR contract only with unique matching objective IDs", () => {
    const s = service();
    capture(s);
    const c = s.domain().contracts[0],
      m = randomUUID(),
      oid = randomUUID();
    s.store.setState({
      contracts: [
        {
          ...c,
          cargoObjectives: c.cargoObjectives.map((o) => ({
            ...o,
            externalObjectiveId: oid,
          })),
        },
      ],
    });
    cargo(s, "Load", 3);
    feed(
      s,
      notification("Contract Accepted: " + c.name, m),
      notification(
        "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
        m,
        oid,
      ),
      ended(m),
    );
    expect(s.domain().contracts[0]).toMatchObject({
      id: c.id,
      status: "Completed",
      missionId: m,
      missionAssociation: { source: "ObjectiveIds" },
    });
    expect(s.domain().contracts[0].cargoObjectives[0].loadedSCU).toBe(3);
  });
  it("does not automatically bind matching title, cargo and reward without objective-ID association", () => {
    const s = service();
    capture(s);
    const c = s.domain().contracts[0],
      m = randomUUID();
    feed(
      s,
      notification("Contract Accepted: " + c.name, m),
      notification(
        "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
        m,
        randomUUID(),
      ),
      ended(m),
    );
    expect(s.domain().contracts[0].missionId).toBeUndefined();
    expect(s.snapshot().lifecycleIssues).toHaveLength(1);
  });
  it("rejects stale resolution and persists bounded dismissal", async () => {
    const file = join(
        mkdtempSync(join(tmpdir(), "cargo-issue-")),
        "cargo.sqlite",
      ),
      s = service(file);
    capture(s);
    const m = randomUUID();
    feed(
      s,
      notification(
        "Contract Complete: " + s.domain().contracts[0].name,
        m,
        undefined,
        time,
      ),
    );
    const i = s.snapshot().lifecycleIssues![0];
    cargo(s, "Load", 1);
    expect(() =>
      s.resolveLifecycle({
        missionId: m,
        contractId: i.candidates[0].id,
        version: i.version,
        confirmed: true,
      }),
    ).toThrow(/changed/);
    const current = s.snapshot().lifecycleIssues![0];
    s.resolveLifecycle({
      missionId: m,
      version: current.version,
      dismiss: true,
    });
    await s.close();
    services.splice(services.indexOf(s), 1);
    expect(service(file).snapshot().lifecycleIssues).toEqual([]);
  });
  it("enriches a title-less terminal record with later notification evidence without duplicate events", () => {
    const s = service();
    capture(s);
    const m = randomUUID();
    feed(s, ended(m));
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    feed(
      s,
      notification(
        "Contract Complete: " + s.domain().contracts[0].name,
        m,
        undefined,
        time,
      ),
    );
    expect(s.snapshot().lifecycleIssues).toHaveLength(1);
    expect(s.database.counts().completed).toBe(1);
  });
  it("backs up and resets lifecycle state and retains valid foreign keys", async () => {
    const folder = mkdtempSync(join(tmpdir(), "cargo-terminal-reset-")),
      file = join(folder, "cargo.sqlite"),
      images = join(folder, "captures");
    mkdirSync(images);
    const s = service(file);
    capture(s);
    const m = bind(s);
    feed(s, ended(m));
    const manager = new LocalDataManager(s, images, {
        pause: async () => {},
        resume: async () => {},
      }),
      r = await manager.execute({
        token: manager.preview("reset").token,
        confirmed: true,
        resetText: "RESET",
      });
    const b = new DatabaseSync(join(r.backupPath, "cargo-run.sqlite"));
    expect(
      b.prepare("SELECT COUNT(*) AS n FROM lifecycle_activity").get()!.n,
    ).toBe(1);
    expect(b.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    b.close();
    for (const t of [
      "lifecycle_activity",
      "lifecycle_evidence",
      "unattributed_rewards",
    ])
      expect(
        s.database.db.prepare("SELECT COUNT(*) AS n FROM " + t).get()!.n,
      ).toBe(0);
    expect(s.database.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it("bounds reward/terminal diagnostics and actionable issue presentation", () => {
    const s = service();
    capture(s);
    const name = s.domain().contracts[0].name;
    for (let i = 0; i < 225; i++)
      feed(
        s,
        notification(
          "Contract Complete: " + name,
          randomUUID(),
          undefined,
          time,
        ),
      );
    expect(s.snapshot().lifecycleIssues).toHaveLength(20);
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM lifecycle_evidence")
        .get()!.n,
    ).toBe(200);
    expect(s.database.diagnostics().length).toBeLessThanOrEqual(200);
  });
});

describe("Lifecycle migration, collisions and rollback", () => {
  it("recovers a saved verified completion during additive schema-6 startup without rescanning OCR", async () => {
    const file = join(
        mkdtempSync(join(tmpdir(), "cargo-legacy-terminal-")),
        "cargo.sqlite",
      ),
      s = service(file);
    capture(s);
    const m = bind(s),
      id = s.domain().contracts[0].id,
      parsed = parseLogLine(ended(m));
    if (parsed.type !== "event") throw Error("fixture");
    s.database.recordEvent(parsed.event, {
      path: "synthetic",
      generation: "old",
      offset: 0,
      mode: "Import",
    });
    s.database.db.exec(
      "DROP TABLE lifecycle_activity; DROP TABLE lifecycle_evidence; PRAGMA user_version=6",
    );
    await s.close();
    services.splice(services.indexOf(s), 1);
    const upgraded = service(file);
    expect(upgraded.domain().contracts[0]).toMatchObject({
      id,
      status: "Completed",
      completedAt: time,
    });
    expect(upgraded.lifecycleHistory(id)).toHaveLength(1);
    expect(
      upgraded.database.db.prepare("PRAGMA foreign_key_check").all(),
    ).toEqual([]);
  });
  it("does not treat reused objective IDs across different missions as unique identity", () => {
    const s = service();
    capture(s);
    const c = s.domain().contracts[0],
      oid = randomUUID(),
      a = randomUUID(),
      b = randomUUID();
    s.store.setState({
      contracts: [
        {
          ...c,
          cargoObjectives: c.cargoObjectives.map((o) => ({
            ...o,
            externalObjectiveId: oid,
          })),
        },
      ],
    });
    for (const m of [a, b])
      feed(
        s,
        notification("Contract Accepted: " + c.name, m),
        notification(
          "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
          m,
          oid,
        ),
      );
    feed(s, ended(a), ended(b));
    expect(s.domain().contracts[0].status).toBe("Active");
    expect(s.domain().contracts[0].missionId).toBeUndefined();
    expect(s.snapshot().lifecycleIssues).toHaveLength(2);
    s.store.setState({contracts:[...s.domain().contracts,{...c,id:randomUUID(),missionId:a,status:"Completed",supersededBy:c.id,cargoObjectives:[]}]});
    feed(s,notification("New Objective: Deliver 1/8 SCU of Agricultural Supplies to Port Tressler above microTech",b,oid));
    expect(s.domain().contracts[0].missionId).toBeUndefined();
    expect(s.snapshot().lifecycleIssues).toHaveLength(1);
  });
  it("rolls back the event, lifecycle audit and in-memory transition when persistence fails", () => {
    const s = service();
    capture(s);
    const m = bind(s),
      before = structuredClone(s.domain());
    s.database.db.exec(
      "CREATE TRIGGER fail_lifecycle BEFORE UPDATE ON contracts BEGIN SELECT RAISE(ABORT,'simulated lifecycle failure'); END",
    );
    expect(() => feed(s, ended(m))).toThrow(/simulated/);
    expect(s.domain()).toEqual(before);
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM lifecycle_activity")
        .get()!.n,
    ).toBe(0);
    expect(s.database.counts().completed).toBe(0);
  });
});
