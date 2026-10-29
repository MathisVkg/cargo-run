import { afterEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { TrackingService } from "../electron/main/trackingService";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { notification, missionA, missionB } from "./fixtures/log";
import type { CaptureRecord, OcrResult } from "../src/types/ocr";
const services: TrackingService[] = [],
  folders: string[] = [];
function service(file = ":memory:") {
  const s = new TrackingService(file);
  services.push(s);
  return s;
}
function fixture(id = "88825398-27e5-4561-9516-c717ae7e750b"): OcrResult {
  return JSON.parse(
    readFileSync(join(__dirname, "fixtures/mobiglas", id + ".json"), "utf8"),
  ).result;
}
function capture(s: TrackingService, result = fixture()) {
  const id = randomUUID(),
    time = "2026-10-29T08:00:00.000Z";
  const c: CaptureRecord = {
    id,
    capturedAt: time,
    source: "Manual",
    status: "Processed",
    displayId: "fixture",
    displayLabel: "Genuine saved OCR",
    screenshot: id + ".png",
    width: result.width,
    height: result.height,
    bytes: 0,
    attempts: 1,
    error: null,
    result,
    observation: extractContract(result, id, time),
  };
  new CaptureRepository(s.database).put(c);
  return c;
}
function feed(s: TrackingService, ...lines: string[]) {
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    {
      path: "fixture/Game.log",
      generation: "automatic",
      offset: 0,
      mode: "Import",
    },
  );
}
function log(s: TrackingService, mission = missionA) {
  feed(
    s,
    notification(
      "Contract Accepted: Rookie Rank - Direct Small Cargo Haul",
      mission,
      undefined,
      "2026-10-29T07:59:00Z",
    ),
    notification(
      "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
      mission,
      "objective-" + mission,
      "2026-10-29T07:59:10Z",
    ),
  );
  return s.database.pendingMissions().find((c) => c.missionId === mission)!;
}
function legacy(s: TrackingService) {
  const c = log(s);
  s.store.setState({
    contracts: [c],
    currentRun: { ...s.domain().currentRun, contractIds: [c.id] },
  });
  s.database.transaction(() => s.database.saveDomain(s.domain()));
  return c;
}
function resolveIssue(
  s: TrackingService,
  c: CaptureRecord,
  patch: Record<string, unknown> = {},
) {
  const request = { captureId: c.id, ...patch },
    r = s.scanIssue(request);
  return s.resolveScan({
    ...request,
    observationHash: r.review.observationHash,
    targetVersion: r.review.targetVersion,
  });
}
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
  for (const p of folders.splice(0)) {
    if (!p.startsWith(resolve("work") + sep)) throw Error("Unsafe test folder");
    rmSync(p, { recursive: true, force: true });
  }
});
describe("operational automatic OCR importing", () => {
  it("imports the genuine accepted 34,500 / 8 SCU Agricultural Supplies capture without monitoring or review", () => {
    const s = service(),
      c = capture(s),
      r = s.processScan(c.id)!;
    expect(r.status).toBe("Imported");
    expect(c.observation?.coverage?.state).toBe("Established");
    const saved = s.snapshot().contracts[0];
    expect(saved).toMatchObject({
      name: "Rookie Rank - Direct Small Cargo Haul",
      payout: 34500,
      acceptedAt: null,
      source: "OCR",
      confirmedEarnings: 0,
    });
    expect(saved.missionId).toBeUndefined();
    expect(saved.cargoObjectives).toHaveLength(1);
    expect(saved.cargoObjectives[0]).toMatchObject({
      commodity: "Agricultural Supplies",
      pickupLocation: "NB Int. Spaceport",
      destination: "Port Tressler above microTech",
      quantitySCU: 8,
    });
    expect(s.snapshot().tracking.enabled).toBe(false);
    expect(s.contractEvidence(saved.id)[0].associationType).toBe(
      "AutomaticCreate",
    );
  });
  it("does not use arbitrary OCR confidence thresholds", () => {
    const s = service(),
      r = fixture();
    for (const l of r.lines) l.confidence = 1;
    const c = capture(s, r);
    expect(s.processScan(c.id)?.status).toBe("Imported");
  });
  it("recognizes actual multi-objective coverage and keeps all quantities", () => {
    const s = service(),
      c = capture(s, fixture("9ccc7ea4-c6f6-49bc-8bfc-701980e610da"));
    expect(s.processScan(c.id)?.status).toBe("Imported");
    expect(
      s.snapshot().contracts[0].cargoObjectives.map((o) => o.quantitySCU),
    ).toEqual([7, 6, 7, 5]);
  });
  it("records acceptance and objectives only as pending mission evidence", () => {
    const s = service();
    log(s);
    expect(s.snapshot().contracts).toEqual([]);
    expect(s.snapshot().currentRun.contractIds).toEqual([]);
    expect(s.database.pendingMissions()[0].cargoObjectives).toHaveLength(1);
    expect(s.snapshot().tracking.pendingMissions).toBe(1);
  });
  it("automatically promotes a unique title/objective match and uses its known acceptance time", () => {
    const s = service(),
      pending = log(s),
      c = capture(s);
    expect(s.processScan(c.id)?.status).toBe("Updated");
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.snapshot().contracts[0]).toMatchObject({
      id: pending.id,
      missionId: missionA,
      acceptedAt: "2026-10-29T07:59:00.000Z",
      payout: 34500,
    });
    expect(
      s.snapshot().contracts[0].cargoObjectives[0].externalObjectiveId,
    ).toBe("objective-" + missionA);
  });
  it("enriches a preserved legacy log contract rather than inserting another", () => {
    const s = service(),
      old = legacy(s),
      c = capture(s);
    s.processScan(c.id);
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.snapshot().contracts[0].id).toBe(old.id);
  });
  it("does not verify a trigger when objective/title identity evidence is insufficient", () => {
    const s = service();
    feed(s, notification("Contract Accepted: Unrelated Cargo Haul", missionA));
    const c = capture(s);
    c.trigger = {
      requestId: randomUUID(),
      candidateMissionId: missionA,
      eventAt: c.capturedAt,
      eventType: "Accepted",
      delaySeconds: 3,
      attempt: 1,
      association: "Unverified",
    };
    new CaptureRepository(s.database).put(c);
    s.processScan(c.id);
    expect(s.snapshot().contracts[0].missionId).toBeUndefined();
  });
  it("requires a compact choice for a title-only log candidate", () => {
    const s = service();
    feed(
      s,
      notification(
        "Contract Accepted: Rookie Rank - Direct Small Cargo Haul",
        missionA,
      ),
    );
    const c = capture(s);
    expect(s.processScan(c.id)?.status).toBe("Ambiguous match");
    expect(s.snapshot().contracts).toHaveLength(0);
    expect(resolveIssue(s, c, { targetId: "log-" + missionA })?.status).toBe(
      "Updated",
    );
  });
  it("makes repeated CaptureId processing and reparsing idempotent", () => {
    const s = service(),
      c = capture(s);
    s.processScan(c.id);
    const before = structuredClone(s.snapshot().contracts);
    c.observation = extractContract(c.result!, c.id, c.capturedAt);
    const repo = new CaptureRepository(s.database);
    repo.put({ ...repo.get(c.id)!, observation: c.observation });
    s.processScan(c.id);
    expect(s.snapshot().contracts).toEqual(before);
    expect(
      s.database.db.prepare("SELECT * FROM ocr_review_audit").all(),
    ).toHaveLength(1);
  });
  it("updates additional screenshots of the same verified mission without duplicate objectives", () => {
    const s = service();
    log(s);
    const a = capture(s);
    s.processScan(a.id);
    const b = capture(s);
    expect(s.processScan(b.id)?.status).toBe("Updated");
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
    expect(s.contractEvidence(s.snapshot().contracts[0].id)).toHaveLength(2);
  });
  it("never silently merges identical OCR-only contracts", () => {
    const s = service(),
      a = capture(s);
    s.processScan(a.id);
    const b = capture(s);
    expect(s.processScan(b.id)?.status).toBe("Ambiguous match");
    expect(resolveIssue(s, b, { targetId: "", separate: true })?.status).toBe(
      "Imported",
    );
    expect(s.snapshot().contracts).toHaveLength(2);
  });
  it("keeps distinct identical MissionIds separate through necessary candidate choices", () => {
    const s = service();
    log(s, missionA);
    log(s, missionB);
    const a = capture(s);
    expect(s.processScan(a.id)?.status).toBe("Ambiguous match");
    resolveIssue(s, a, { targetId: "log-" + missionA });
    const b = capture(s);
    expect(s.processScan(b.id)?.status).toBe("Ambiguous match");
    resolveIssue(s, b, { targetId: "log-" + missionB });
    expect(new Set(s.snapshot().contracts.map((c) => c.missionId))).toEqual(
      new Set([missionA, missionB]),
    );
  });
  it("excludes old completed and abandoned contracts from normal candidates", () => {
    const s = service(),
      a = capture(s);
    s.processScan(a.id);
    s.abandonContract(s.snapshot().contracts[0].id);
    const b = capture(s);
    expect(s.scanIssue({ captureId: b.id }).review.targets).toHaveLength(0);
    expect(s.processScan(b.id)?.status).toBe("Imported");
  });
  it("produces only a pickup correction when the pickup OCR is missing", () => {
    const s = service(),
      r = fixture();
    r.lines = r.lines.filter(
      (l) => !/Collect Agricultural|^Spaceport\./i.test(l.text),
    );
    r.text = r.lines.map((l) => l.text).join("\n");
    const c = capture(s, r);
    expect(s.processScan(c.id)?.status).toBe("Pending corrections");
    expect(s.snapshot().contracts).toHaveLength(0);
    const issue = s.scanIssue({ captureId: c.id });
    expect(issue.review.errors).toHaveLength(1);
    issue.review.draft.objectives[0].pickupLocation = "NB Int. Spaceport";
    expect(
      resolveIssue(s, c, { draft: issue.review.draft, coverageConfirmed: true })
        ?.status,
    ).toBe("Imported");
  });
  it("preserves unseen known objectives during a partial screenshot without mandatory unrelated rows", () => {
    const s = service();
    const old = legacy(s);
    const extra = {
      ...old.cargoObjectives[0],
      id: "other-row",
      externalObjectiveId: "other-objective",
      commodity: "Aluminum",
      quantitySCU: 10,
      pickupLocation: "",
      destination: "Elsewhere",
    };
    s.store.setState({
      contracts: [{ ...old, cargoObjectives: [...old.cargoObjectives, extra] }],
    });
    s.database.transaction(() => s.database.saveDomain(s.domain()));
    const c = capture(s);
    c.observation!.potentiallyIncomplete = true;
    c.observation!.coverage = { state: "Partial", reason: "Scrolling list" };
    new CaptureRepository(s.database).put(c);
    const issue = s.scanIssue({ captureId: c.id });
    expect(issue.review.draft.objectives).toHaveLength(1);
    expect(issue.review.errors).toEqual([]);
    expect(s.processScan(c.id)?.status).toBe("Updated");
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(2);
    expect(s.snapshot().contracts[0].cargoObjectives[1]).toEqual(extra);
  });
  it("does not auto-finalize an unknown partial list", () => {
    const s = service(),
      c = capture(s);
    c.observation!.coverage = {
      state: "Partial",
      reason: "List continues below viewport",
    };
    c.observation!.potentiallyIncomplete = true;
    new CaptureRepository(s.database).put(c);
    expect(s.processScan(c.id)?.status).toBe("Pending corrections");
    expect(s.snapshot().contracts).toHaveLength(0);
  });
  it("preserves manual corrections and requires authorization for conflicting OCR", () => {
    const s = service();
    log(s);
    const a = capture(s);
    s.processScan(a.id);
    const current = s.snapshot().contracts[0];
    s.store.setState({
      contracts: [
        {
          ...current,
          payout: 40000,
          fieldProvenance: {
            ...current.fieldProvenance,
            payout: { source: "Manual", at: new Date().toISOString() },
          },
        },
      ],
    });
    s.database.transaction(() => s.database.saveDomain(s.domain()));
    const b = capture(s);
    expect(s.processScan(b.id)?.status).toBe("Pending corrections");
    expect(s.snapshot().contracts[0].payout).toBe(40000);
    resolveIssue(s, b, { choices: { payout: "Keep" } });
    expect(s.snapshot().contracts[0].payout).toBe(40000);
    expect(s.snapshot().contracts[0].fieldProvenance?.payout.source).toBe(
      "Manual",
    );
  });
  it("does not auto-import Offers or ambiguous acceptance", () => {
    for (const kind of ["Offers", "Ambiguous"]) {
      const s = service(),
        c = capture(s);
      c.observation!.view.value = kind === "Offers" ? "Offers" : null;
      c.observation!.view.state =
        kind === "Offers" ? "Recognized" : "Ambiguous";
      new CaptureRepository(s.database).put(c);
      expect(s.processScan(c.id)?.status).toBe("Pending corrections");
      expect(s.snapshot().contracts).toEqual([]);
    }
  });
  it("rejects invalid screenshots and quantities", () => {
    const s = service(),
      c = capture(s);
    c.observation!.objectives[0].requiredSCU.value = 0;
    new CaptureRepository(s.database).put(c);
    expect(s.processScan(c.id)?.status).toBe("Pending corrections");
    expect(s.snapshot().contracts).toEqual([]);
  });
  it("rolls back automatic creation and capture association if auditing fails", () => {
    const s = service(),
      c = capture(s);
    s.database.db.exec(
      "CREATE TRIGGER import_failure BEFORE INSERT ON ocr_review_audit BEGIN SELECT RAISE(ABORT,'failure'); END;",
    );
    expect(() => s.processScan(c.id)).toThrow(/failure/);
    expect(s.snapshot().contracts).toEqual([]);
    expect(
      s.database.db.prepare("SELECT * FROM capture_contract_links").all(),
    ).toEqual([]);
  });
  it("rolls back automatic enrichment without partially modifying a legacy contract", () => {
    const s = service(),
      old = legacy(s),
      c = capture(s);
    s.database.db.exec(
      "CREATE TRIGGER import_failure BEFORE INSERT ON ocr_review_audit BEGIN SELECT RAISE(ABORT,'failure'); END;",
    );
    expect(() => s.processScan(c.id)).toThrow();
    expect(s.snapshot().contracts[0]).toEqual(old);
    expect(s.database.loadDomain()?.contracts[0]).toEqual(old);
  });
  it("preserves completion events arriving after OCR", () => {
    const s = service();
    log(s);
    const c = capture(s);
    s.processScan(c.id);
    feed(
      s,
      notification(
        "Contract Complete: Rookie Rank - Direct Small Cargo Haul",
        missionA,
      ),
    );
    expect(s.snapshot().contracts[0].status).toBe("Completed");
    expect(s.snapshot().contracts[0].confirmedEarnings).toBe(0);
  });
  it("keeps pre-acceptance objectives and completion for explicit closed-mission recovery", () => {
    const s = service();
    feed(
      s,
      notification(
        "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
        missionA,
        "early",
      ),
      notification(
        "Contract Complete: Rookie Rank - Direct Small Cargo Haul",
        missionA,
      ),
    );
    log(s);
    expect(s.database.pendingMissions()[0].status).toBe("Completed");
    expect(s.snapshot().contracts).toEqual([]);
    const c = capture(s);
    expect(s.processScan(c.id)?.status).toBe("Pending corrections");
    expect(s.scanIssue({ captureId: c.id }).review.targets).toEqual([]);
  });
  it("preserves existing schema 4 ledger rows, runs, captures and links through additive migration and restart", async () => {
    mkdirSync("work", { recursive: true });
    const folder = mkdtempSync(join(resolve("work"), "auto-import-"));
    folders.push(folder);
    const file = join(folder, "cargo.sqlite");
    const s = service(file),
      c = capture(s);
    s.processScan(c.id);
    s.finishRun();
    const before = JSON.parse(JSON.stringify(s.snapshot().contracts)),
      runs = structuredClone(s.snapshot().runs);
    s.database.db.exec(
      "DROP TABLE pending_log_missions; PRAGMA user_version=4;",
    );
    await s.close();
    services.splice(services.indexOf(s), 1);
    const restored = service(file);
    expect(restored.snapshot().contracts).toEqual(before);
    expect(restored.snapshot().runs).toEqual(runs);
    expect(restored.contractEvidence(before[0].id)).toHaveLength(1);
    expect(new CaptureRepository(restored.database).get(c.id)).not.toBeNull();
    expect(
      restored.database.db.prepare("PRAGMA user_version").get()?.user_version,
    ).toBe(5);
  });
});
describe("late identity and unknown timing", () => {
  it("offers a compact late-identity choice and consolidates the original capture without duplicate cargo", () => {
    const s = service(),
      c = capture(s);
    s.processScan(c.id);
    const original = s.snapshot().contracts[0];
    log(s);
    expect(
      new CaptureRepository(s.database).get(c.id)?.importResult?.status,
    ).toBe("Ambiguous match");
    const result = resolveIssue(s, c, { targetId: "log-" + missionA });
    expect(result?.status).toBe("Updated");
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.snapshot().contracts[0].missionId).toBe(missionA);
    expect(
      s.domain().contracts.find((c) => c.id === original.id)?.supersededBy,
    ).toBe("log-" + missionA);
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
  });
  it("retains unknown acceptance time even when the uniquely matched log notification lacks a timestamp", () => {
    const s = service();
    const acceptance = notification(
      "Contract Accepted: Rookie Rank - Direct Small Cargo Haul",
      missionA,
    ).replace(/^<[^>]+>\s*/, "");
    feed(
      s,
      acceptance,
      notification(
        "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
        missionA,
        "untimed",
      ),
    );
    const c = capture(s);
    s.processScan(c.id);
    expect(s.snapshot().contracts[0].missionId).toBe(missionA);
    expect(s.snapshot().contracts[0].acceptedAt).toBeNull();
  });
  it("does not reopen a resolved identity choice after an unrelated mission event", () => {
    const s = service(),
      c = capture(s);
    s.processScan(c.id);
    const local = s.snapshot().contracts[0].id;
    log(s);
    resolveIssue(s, c, { targetId: local });
    expect(
      new CaptureRepository(s.database).get(c.id)?.importResult?.status,
    ).toBe("Updated");
    feed(s, notification("Contract Accepted: Unrelated Haul", missionB));
    expect(
      new CaptureRepository(s.database).get(c.id)?.importResult?.status,
    ).toBe("Updated");
  });
});

describe("additional genuine multi-objective export", () => {
  it("retains the newly supplied 61,500 screenshot's actual 4+3 SCU rather than replacing it with a reported total", () => {
    const s = service(),
      c = capture(s, fixture("de84af0a-5ad9-4458-a490-288293bdf989"));
    expect(s.processScan(c.id)?.status).toBe("Imported");
    expect(s.snapshot().contracts[0].payout).toBe(61500);
    expect(
      s.snapshot().contracts[0].cargoObjectives.map((o) => o.quantitySCU),
    ).toEqual([4, 3]);
  });
});

describe("partial promotion and quantity conflicts", () => {
  it("does not promote a pending mission from an incomplete list merely because visible rows match", () => {
    const s = service();
    log(s);
    const c = capture(s);
    c.observation!.coverage = { state: "Partial", reason: "List continues" };
    c.observation!.potentiallyIncomplete = true;
    new CaptureRepository(s.database).put(c);
    expect(s.processScan(c.id)?.status).toBe("Pending corrections");
    expect(s.snapshot().contracts).toEqual([]);
  });
  it("asks about a changed quantity rather than appending a duplicate objective", () => {
    const s = service();
    log(s);
    const a = capture(s);
    s.processScan(a.id);
    const b = capture(s);
    b.observation!.objectives[0].requiredSCU.value = 9;
    new CaptureRepository(s.database).put(b);
    expect(s.processScan(b.id)?.status).toBe("Ambiguous match");
    const issue = s.scanIssue({ captureId: b.id, targetId: "log-" + missionA });
    expect(
      issue.review.conflicts.some((c) => c.path === "objectives.0.quantitySCU"),
    ).toBe(true);
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
    resolveIssue(s, b, {
      targetId: "log-" + missionA,
      choices: { "objectives.0.quantitySCU": "Keep" },
    });
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(1);
    expect(s.snapshot().contracts[0].cargoObjectives[0].quantitySCU).toBe(8);
  });
});
