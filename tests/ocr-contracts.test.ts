import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { resolve, join, sep } from "node:path";
import { TrackingService } from "../electron/main/trackingService";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { CaptureRetention, expiration } from "../electron/main/ocr/retention";
import { extractContract } from "../electron/main/ocr/parser";
import {
  defaultCapturePolicy,
  validatePolicy,
} from "../src/types/capturePolicy";
import type { CaptureRecord, OcrResult } from "../src/types/ocr";
import type { ConfirmReview } from "../src/types/review";
import { observedAluminumFixture } from "./fixtures/ocr-observed";
import { reportedHydrogenFixture } from "./fixtures/ocr-hydrogen";
import { reviewCaptures } from "../src/utils/captureReview";
import { operationStats } from "../src/stores/selectors";
import { notification, missionA, missionB } from "./fixtures/log";
const services: TrackingService[] = [],
  folders: string[] = [];
const service = (path = ":memory:") => {
  const s = new TrackingService(path);
  services.push(s);
  return s;
};
function folder() {
  mkdirSync("work", { recursive: true });
  const dir = mkdtempSync(join(resolve("work"), "review-unit-"));
  folders.push(dir);
  return dir;
}
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
  for (const p of folders.splice(0)) {
    if (!p.startsWith(resolve("work") + sep)) throw Error("Unsafe cleanup");
    rmSync(p, { recursive: true, force: true });
  }
});
function capture(
  s: TrackingService,
  result: OcrResult = observedAluminumFixture(3840, 2160),
): CaptureRecord {
  const id = randomUUID(),
    time = "2026-10-20T12:00:00.000Z";
  const c: CaptureRecord = {
    id,
    capturedAt: time,
    source: "Manual",
    status: "Processed",
    displayId: "1",
    displayLabel: "Fixture",
    screenshot: id + ".png",
    width: result.width,
    height: result.height,
    bytes: 100,
    attempts: 1,
    error: null,
    result,
    observation: extractContract(result, id, time),
  };
  new CaptureRepository(s.database).put(c);
  return c;
}
function input(
  s: TrackingService,
  c: CaptureRecord,
  targetId = "",
  patch: Partial<ConfirmReview> = {},
): ConfirmReview {
  const r = s.prepareOcr({ captureId: c.id, targetId, advanced: true });
  return {
    captureId: c.id,
    advanced: true,
    targetId,
    action: targetId ? "Update" : "Create",
    draft: r.draft,
    observationHash: r.observationHash,
    targetVersion: r.targetVersion,
    sourceVersion: r.sourceVersion,
    acceptedConfirmed: true,
    incompleteConfirmed: true,
    associationConfirmed: true,
    distinctConfirmed: true,
    consolidationConfirmed: true,
    objectiveRemovalConfirmed: true,
    choices: Object.fromEntries(r.conflicts.map((x) => [x.path, "Reviewed"])),
    ...patch,
  };
}
function feed(s: TrackingService, ...lines: string[]) {
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    {
      path: "fixture/Game.log",
      generation: "review",
      offset: 0,
      mode: "Import",
    },
  );
}
function log(
  s: TrackingService,
  mission = missionA,
  qty = 31,
  delivered = 0,
  title = "Junior Rank - Direct Small Cargo Haul",
) {
  feed(
    s,
    notification("Contract Accepted: " + title, mission),
    notification(
      "New Objective: Deliver " +
        delivered +
        "/" +
        qty +
        " SCU of Hydrogen to Rayari Deltana Research Outpost",
      mission,
      "objective-" + mission,
    ),
  );
  // Explicit legacy-ledger fixture: v0.4.0 saved these incomplete contracts.
  // New default pending-only behavior is verified in automatic-import.test.ts.
  const legacy = s.database
    .pendingMissions()
    .find((c) => c.missionId === mission)!;
  s.store.setState({
    contracts: [
      ...s.domain().contracts.filter((c) => c.missionId !== mission),
      legacy,
    ],
    currentRun: {
      ...s.domain().currentRun,
      contractIds: [
        ...new Set([...s.domain().currentRun.contractIds, legacy.id]),
      ],
    },
  });
  s.database.transaction(() => s.database.saveDomain(s.domain()));
  return legacy;
}
describe("reviewed OCR contract transactions", () => {
  it("creates one multi-destination OCR-only contract with unknown acceptance and no log", () => {
    const s = service(),
      c = capture(s),
      raw = JSON.stringify(c.result);
    const result = s.confirmOcr(input(s, c)),
      contract = result.state.contracts[0];
    expect(result.state.tracking.enabled).toBe(false);
    expect(contract).toMatchObject({
      source: "OCR",
      dataOrigin: "OCR",
      payout: 61500,
      acceptedAt: null,
      confirmedEarnings: 0,
    });
    expect(contract.missionId).toBeUndefined();
    expect(contract.cargoObjectives).toHaveLength(2);
    expect(contract.cargoObjectives.map((o) => o.pickupLocation)).toEqual([
      "Port Tressler",
      "Port Tressler",
    ]);
    expect(operationStats(result.state.contracts)).toMatchObject({
      potential: 61500,
      scu: 8,
    });
    expect(
      JSON.stringify(new CaptureRepository(s.database).get(c.id)?.result),
    ).toBe(raw);
    expect(s.contractEvidence(contract.id)).toHaveLength(1);
  });
  it("uses actual contract B OCR quantities 7+6+7+5, not earlier synthetic totals", () => {
    const s = service(),
      result = JSON.parse(
        readFileSync(
          join(
            __dirname,
            "fixtures/mobiglas/9ccc7ea4-c6f6-49bc-8bfc-701980e610da.json",
          ),
          "utf8",
        ),
      ).result;
    const c = capture(s, result),
      saved = s.confirmOcr(input(s, c)).state.contracts[0];
    expect(saved.payout).toBe(65250);
    expect(saved.cargoObjectives.map((o) => o.quantitySCU)).toEqual([
      7, 6, 7, 5,
    ]);
    expect(new Set(saved.cargoObjectives.map((o) => o.commodity)).size).toBe(2);
    expect(operationStats([saved]).scu).toBe(25);
  });
  it("parses and saves reported contract C with its 31 SCU Hydrogen pickup and reward", () => {
    const s = service(),
      c = capture(s, reportedHydrogenFixture()),
      saved = s.confirmOcr(input(s, c)).state.contracts[0];
    expect(saved).toMatchObject({
      name: "Junior Rank - Direct Small Cargo Haul",
      payout: 60750,
    });
    expect(saved.cargoObjectives[0]).toMatchObject({
      commodity: "Hydrogen",
      quantitySCU: 31,
      pickupLocation: "microTech Logistics Depot S4LD13",
      destination: "Rayari Deltana Research Outpost",
    });
  });
  it("preserves unknown optional reward and company instead of guessing", () => {
    const s = service(),
      c = capture(s),
      i = input(s, c);
    i.draft!.payout = null;
    i.draft!.company = null;
    const saved = s.confirmOcr(i).state.contracts[0];
    expect(saved.payout).toBeNull();
    expect(saved.company).toBeNull();
  });
  it.each([0, -1, NaN, Infinity, null])(
    "rejects invalid required quantity %s atomically",
    (quantity) => {
      const s = service(),
        c = capture(s),
        i = input(s, c);
      i.draft!.objectives[0].quantitySCU = quantity;
      expect(() => s.confirmOcr(i)).toThrow();
      expect(s.snapshot().contracts).toHaveLength(0);
      expect(
        s.database.db.prepare("SELECT * FROM capture_contract_links").all(),
      ).toHaveLength(0);
    },
  );
  it("requires explicit acceptance for Offers and ambiguous screenshots", () => {
    for (const text of ["ACCEPT OFFER", ""]) {
      const s = service(),
        r = observedAluminumFixture();
      r.lines = r.lines.map((l) => (l.text === "ABANDON" ? { ...l, text } : l));
      const c = capture(s, r);
      expect(() =>
        s.confirmOcr(input(s, c, "", { acceptedConfirmed: false })),
      ).toThrow(/accepted/i);
    }
  });
  it("requires incomplete-list acknowledgement", () => {
    const s = service(),
      c = capture(s);
    c.observation!.potentiallyIncomplete = true;
    c.observation!.warnings.push("Partial list");
    new CaptureRepository(s.database).put(c);
    expect(() =>
      s.confirmOcr(input(s, c, "", { incompleteConfirmed: false })),
    ).toThrow(/incomplete/);
  });
  it("records manual corrections separately from immutable OCR", () => {
    const s = service(),
      c = capture(s),
      i = input(s, c);
    i.draft!.name = "Corrected haul";
    i.draft!.objectives[0].destination = "NB Int. Spaceport";
    const saved = s.confirmOcr(i).state.contracts[0],
      link = s.contractEvidence(saved.id)[0];
    expect(saved.fieldProvenance?.name.source).toBe("Manual");
    expect(link.original.name).toBe(c.observation!.title.value);
    expect(link.corrections).toContain("name");
    expect(link.reviewed.name).toBe("Corrected haul");
  });
  it("is idempotent on repeated confirmation and reprocessing the same CaptureId", () => {
    const s = service(),
      c = capture(s),
      i = input(s, c),
      first = s.confirmOcr(i);
    expect(s.confirmOcr(i).idempotent).toBe(true);
    const repo = new CaptureRepository(s.database);
    repo.put({
      ...c,
      observation: extractContract(c.result!, c.id, c.capturedAt),
    });
    expect(s.confirmOcr(input(s, c)).contractId).toBe(first.contractId);
    expect(s.snapshot().contracts).toHaveLength(1);
  });
  it("requires explicit distinct-instance confirmation for identical separate OCR captures", () => {
    const s = service(),
      a = capture(s);
    s.confirmOcr(input(s, a));
    const b = capture(s);
    expect(
      s.prepareOcr({ captureId: b.id, targetId: "" }).candidates.length,
    ).toBeGreaterThan(0);
    expect(() =>
      s.confirmOcr(input(s, b, "", { distinctConfirmed: false })),
    ).toThrow(/separate/);
    s.confirmOcr(input(s, b));
    expect(s.snapshot().contracts).toHaveLength(2);
  });
  it("enriches log contract C, preserves MissionId and counts it once", () => {
    const s = service(),
      old = log(s),
      c = capture(s, reportedHydrogenFixture()),
      saved = s.confirmOcr(input(s, c, old.id)).state.contracts;
    expect(saved).toHaveLength(1);
    expect(saved[0].missionId).toBe(missionA);
    expect(saved[0].acceptedAt).toBe(old.acceptedAt);
    expect(saved[0].cargoObjectives).toHaveLength(1);
    expect(saved[0].cargoObjectives[0].id).toBe(old.cargoObjectives[0].id);
    expect(saved[0].cargoObjectives[0].pickupLocation).toBe(
      "microTech Logistics Depot S4LD13",
    );
    expect(saved[0].sources).toEqual(expect.arrayContaining(["Log", "OCR"]));
  });
  it("requires explicit association even with an automatic trigger candidate", () => {
    const s = service(),
      old = log(s),
      c = capture(s, reportedHydrogenFixture());
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
    const r = s.prepareOcr({ captureId: c.id, targetId: "" });
    expect(r.target).toBeUndefined();
    expect(r.candidates[0].kind).not.toBe("Verified MissionId");
    expect(() =>
      s.confirmOcr(input(s, c, old.id, { associationConfirmed: false })),
    ).toThrow(/association/);
  });
  it("keeps two different MissionIds with identical details separate", () => {
    const s = service(),
      a = log(s),
      b = log(s, missionB),
      c = capture(s, reportedHydrogenFixture());
    s.confirmOcr(input(s, c, a.id));
    expect(
      s
        .prepareOcr({ captureId: c.id })
        .candidates.some((x) => x.kind === "Verified MissionId"),
    ).toBe(true);
    expect(() => s.confirmOcr(input(s, c, b.id))).toThrow(
      /different|bound|MissionIds/,
    );
    expect(s.snapshot().contracts).toHaveLength(2);
  });
  it("requires conflict choices and never regresses delivered progress", () => {
    const s = service(),
      old = log(s, missionA, 31, 4),
      c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id);
    expect(() => s.confirmOcr({ ...i, choices: {} })).toThrow(/conflict/);
    expect(() => s.confirmOcr(i)).toThrow(/regress/);
    i.choices["objectives.0.deliveredSCU"] = "Keep";
    const saved = s.confirmOcr(i).state.contracts[0];
    expect(saved.cargoObjectives[0].deliveredSCU).toBe(4);
    expect(s.contractEvidence(saved.id)[0].conflicts.length).toBeGreaterThan(0);
  });
  it("honors an explicit reward conflict choice and preserves both values", () => {
    const s = service(),
      old = log(s);
    s.store.setState({ contracts: [{ ...old, payout: 100 }] });
    s.database.transaction(() => s.database.saveDomain(s.domain()));
    const c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id);
    i.choices.payout = "Keep";
    expect(s.confirmOcr(i).state.contracts[0].payout).toBe(100);
    expect(s.contractEvidence(old.id)[0].original.payout).toBe(60750);
  });
  it("preserves completed lifecycle and confirmed earnings during an earlier OCR review", () => {
    const s = service(),
      old = log(s);
    feed(s, notification("Contract Complete: " + old.name, missionA));
    s.store.setState({
      contracts: s
        .domain()
        .contracts.map((x) => ({ ...x, confirmedEarnings: 900 })),
    });
    const c = capture(s, reportedHydrogenFixture());
    const saved = s.confirmOcr(input(s, c, old.id)).state.contracts[0];
    expect(saved.status).toBe("Completed");
    expect(saved.confirmedEarnings).toBe(900);
  });
  it("rejects stale contract edits and changed OCR evidence", () => {
    const s = service(),
      old = log(s),
      c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id);
    feed(
      s,
      notification(
        "New Objective: Deliver 1/31 SCU of Hydrogen to Rayari Deltana Research Outpost",
        missionA,
        "objective-" + missionA,
        "2026-10-20T15:00:00Z",
      ),
    );
    expect(() => s.confirmOcr(i)).toThrow(/changed|conflict|regress/);
    const fresh = input(s, c, old.id);
    new CaptureRepository(s.database).put({
      ...c,
      observation: { ...c.observation!, warnings: ["Changed parser output"] },
    });
    expect(() => s.confirmOcr(fresh)).toThrow(/OCR changed/);
  });
  it("keeps distinct identical objective rows and maps each explicitly without double counting", () => {
    const s = service(),
      old = log(s);
    feed(
      s,
      notification(
        "New Objective: Deliver 0/31 SCU of Hydrogen to Rayari Deltana Research Outpost",
        missionA,
        "second",
      ),
    );
    const c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id),
      objectives = s.domain().contracts[0].cargoObjectives;
    i.draft!.objectives = [
      {
        ...i.draft!.objectives[0],
        existingObjectiveId: objectives[0].id,
        externalObjectiveId: objectives[0].externalObjectiveId,
      },
      {
        ...i.draft!.objectives[0],
        existingObjectiveId: objectives[1].id,
        externalObjectiveId: objectives[1].externalObjectiveId,
      },
    ];
    const checked = s.prepareOcr(i);
    i.choices = Object.fromEntries(
      checked.conflicts.map((c) => [c.path, "Reviewed"]),
    );
    expect(s.confirmOcr(i).state.contracts[0].cargoObjectives).toHaveLength(2);
  });
  it("rejects duplicate mapping of two rows to one ObjectiveId", () => {
    const s = service(),
      old = log(s),
      c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id);
    i.draft!.objectives.push({ ...i.draft!.objectives[0] });
    expect(() => s.confirmOcr(i)).toThrow(/two rows|already assigned/);
  });
  it("late Game.log association preserves OCR record, all evidence and immutable run snapshots", () => {
    const s = service(),
      c = capture(s, reportedHydrogenFixture()),
      local = s.confirmOcr(input(s, c)).contractId;
    s.finishRun();
    const snapshot = structuredClone(s.snapshot().runs[0]);
    const old = log(s),
      i = input(s, c, old.id),
      result = s.confirmOcr(i);
    expect(result.state.contracts).toHaveLength(1);
    expect(result.state.contracts[0].missionId).toBe(missionA);
    expect(s.domain().contracts.find((c) => c.id === local)?.supersededBy).toBe(
      old.id,
    );
    expect(s.snapshot().runs[0]).toEqual(snapshot);
    expect(s.contractEvidence(old.id)).toHaveLength(1);
    expect(s.snapshot().currentRun.contractIds).toEqual([old.id]);
  });
  it("rolls back domain, objectives, links and audit when persistence fails", () => {
    const s = service(),
      c = capture(s);
    s.database.db.exec(
      "CREATE TRIGGER fail_review BEFORE INSERT ON ocr_review_audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END;",
    );
    expect(() => s.confirmOcr(input(s, c))).toThrow(/test audit/);
    expect(s.snapshot().contracts).toHaveLength(0);
    expect(s.database.db.prepare("SELECT * FROM contracts").all()).toHaveLength(
      0,
    );
    expect(
      s.database.db.prepare("SELECT * FROM capture_contract_links").all(),
    ).toHaveLength(0);
  });
  it("never mixes samples with reviewed real contracts", () => {
    const s = service();
    s.loadSamples();
    const c = capture(s);
    expect(() => s.confirmOcr(input(s, c))).toThrow(/demonstration/);
  });
  it("supports manual correction, completion and finalization without fabricated earnings", () => {
    const s = service(),
      c = capture(s),
      id = s.confirmOcr(input(s, c)).contractId,
      old = s.snapshot().contracts[0];
    s.saveContract({
      id,
      draft: {
        name: "Edited local",
        payout: null,
        objectives: old.cargoObjectives.map((o) => ({ ...o, deliveredSCU: 1 })),
      },
    });
    expect(s.snapshot().contracts[0].acceptedAt).toBeNull();
    s.completeContract(id);
    s.finishRun();
    expect(s.snapshot().contracts[0]).toMatchObject({
      status: "Completed",
      confirmedEarnings: 0,
    });
    expect(s.snapshot().runs).toHaveLength(1);
  });
  it("persists reviewed contracts and evidence across restart", async () => {
    const file = join(folder(), "cargo.sqlite"),
      s = service(file),
      c = capture(s),
      id = s.confirmOcr(input(s, c)).contractId;
    await s.close();
    services.splice(services.indexOf(s), 1);
    const restored = service(file);
    expect(restored.snapshot().contracts[0].id).toBe(id);
    expect(restored.contractEvidence(id)[0].captureId).toBe(c.id);
  });
});
describe("linked screenshot retention", () => {
  it("protects active captures, expires 30 days after closure and retains minimal evidence", () => {
    const s = service(),
      dir = folder(),
      repo = new CaptureRepository(s.database),
      c = capture(s),
      id = s.confirmOcr(input(s, c)).contractId,
      retention = new CaptureRetention(repo, dir);
    writeFileSync(join(dir, c.id + ".png"), "fixture");
    expect(expiration(repo.get(c.id)!, defaultCapturePolicy)).toBeNull();
    retention.cleanup(
      defaultCapturePolicy,
      new Set(),
      Date.now() + 100 * 86400000,
    );
    expect(existsSync(join(dir, c.id + ".png"))).toBe(true);
    s.completeContract(id);
    const expiry = expiration(repo.get(c.id)!, defaultCapturePolicy)!;
    expect(
      Date.parse(expiry) - Date.parse(s.snapshot().contracts[0].completedAt!),
    ).toBe(30 * 86400000);
    retention.cleanup(defaultCapturePolicy, new Set(), Date.parse(expiry) + 1);
    expect(repo.get(c.id)).toBeNull();
    expect(s.snapshot().contracts).toHaveLength(1);
    expect(s.contractEvidence(id)[0].imageAvailable).toBe(false);
  });
  it("unlinking only one of several screenshots changes retention without deleting contract", () => {
    const s = service(),
      a = capture(s),
      id = s.confirmOcr(input(s, a)).contractId,
      b = capture(s);
    s.confirmOcr(input(s, b, id));
    expect(s.contractEvidence(id).filter((x) => x.attached)).toHaveLength(2);
    s.unlinkEvidence({ contractId: id, captureId: a.id });
    const repo = new CaptureRepository(s.database);
    expect(repo.get(a.id)?.evidenceLink).toBeUndefined();
    expect(repo.get(b.id)?.evidenceLink?.status).toBe("Active");
    expect(s.confirmOcr(input(s, a)).idempotent).toBe(true);
    expect(s.snapshot().contracts).toHaveLength(1);
  });
  it("preserves abandoned contract and evidence when image files are missing", () => {
    const s = service(),
      c = capture(s),
      id = s.confirmOcr(input(s, c)).contractId;
    s.abandonContract(id);
    const repo = new CaptureRepository(s.database),
      retention = new CaptureRetention(repo, folder());
    retention.cleanup(
      defaultCapturePolicy,
      new Set(),
      Date.now() + 31 * 86400000,
    );
    expect(s.snapshot().contracts[0].status).toBe("Abandoned");
    expect(s.contractEvidence(id)[0].original.name).toBe(
      c.observation!.title.value,
    );
  });
});
describe("view evidence and shared capture policy", () => {
  it("uses positioned ACCEPT OFFER and does not mistake it for a title", () => {
    const r = observedAluminumFixture();
    r.lines = r.lines.map((l) =>
      l.text === "ABANDON" ? { ...l, text: "ACCEPT OFFER" } : l,
    );
    const o = extractContract(r, "fixture", "2026-10-20");
    expect(o.view.value).toBe("Offers");
    expect(o.title.value).not.toMatch(/ACCEPT OFFER/);
  });
  it("marks contradictory action buttons ambiguous and ignores action words in the description", () => {
    const r = observedAluminumFixture();
    r.lines.push({ ...r.lines.at(-1)!, id: "offer", text: "ACCEPT OFFER" });
    expect(extractContract(r, "fixture", "2026-10-20").view.state).toBe(
      "Ambiguous",
    );
    r.lines = r.lines.filter((l) => l.text !== "ABANDON");
    r.lines.at(-1)!.box.y = 200;
    expect(extractContract(r, "fixture", "2026-10-20").view.value).toBeNull();
  });
  it("preserves a legacy differing automatic method as an explicit override", () => {
    const legacy = {
      ...defaultCapturePolicy,
      source: "Display" as const,
      autoSource: "Window" as const,
    };
    delete legacy.autoSourceOverride;
    expect(validatePolicy(legacy).autoSourceOverride).toBe(true);
    expect(
      validatePolicy({ ...legacy, autoSource: "Display" }).autoSourceOverride,
    ).toBe(false);
    expect(defaultCapturePolicy.autoSourceOverride).toBe(false);
  });
});

describe("review safeguards and grouped attempts", () => {
  it("groups rejected automatic OCR attempts while retaining usable observations", () => {
    const s = service(),
      base = capture(s),
      trigger = {
        requestId: randomUUID(),
        candidateMissionId: missionA,
        eventAt: base.capturedAt,
        eventType: "Accepted" as const,
        delaySeconds: 1,
        attempt: 1,
        association: "Unverified" as const,
      };
    const first = {
      ...base,
      id: randomUUID(),
      source: "Automatic" as const,
      trigger,
      status: "Failed" as const,
      validation: "Rejected" as const,
    };
    const last = {
      ...first,
      id: randomUUID(),
      trigger: { ...trigger, attempt: 2 },
      validationMessage: "Final rejection",
    };
    const valid = {
      ...base,
      id: randomUUID(),
      source: "Automatic" as const,
      trigger: { ...trigger, attempt: 3 },
      validation: "ReviewUnassociated" as const,
    };
    const rows = reviewCaptures([first, last, valid]);
    expect(rows.map((c) => c.id)).toEqual([valid.id, last.id]);
    expect(rows[1].validationMessage).toBe("Final rejection");
  });
  it("retains independent automatic requests and all manual failures", () => {
    const s = service(),
      c = capture(s),
      manual = { ...c, status: "Failed" as const };
    expect(
      reviewCaptures([manual, { ...manual, id: randomUUID() }]),
    ).toHaveLength(2);
  });
  it("protects an active linked image even if its capture metadata is missing", () => {
    const s = service(),
      dir = folder(),
      repo = new CaptureRepository(s.database),
      c = capture(s),
      id = s.confirmOcr(input(s, c)).contractId;
    repo.remove(c.id);
    writeFileSync(join(dir, c.id + ".png"), "active evidence");
    new CaptureRetention(repo, dir).cleanup(
      defaultCapturePolicy,
      new Set(),
      Date.now() + 100 * 86400000,
    );
    expect(existsSync(join(dir, c.id + ".png"))).toBe(true);
    expect(s.contractEvidence(id)[0].imageAvailable).toBe(false);
  });
  it("requires explicit removal and forbids discarding delivered objectives", () => {
    const s = service(),
      old = log(s, missionA, 31, 3),
      c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id);
    i.draft!.objectives[0] = {
      ...i.draft!.objectives[0],
      existingObjectiveId: undefined,
      externalObjectiveId: undefined,
      newDistinct: true,
    };
    i.removeObjectiveIds = [old.cargoObjectives[0].id];
    expect(() => s.confirmOcr(i)).toThrow(/undelivered/);
  });
  it("refuses an ObjectiveId belonging to another MissionId", () => {
    const s = service(),
      old = log(s),
      c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id);
    i.draft!.objectives[0].externalObjectiveId = "foreign";
    expect(() => s.confirmOcr(i)).toThrow(/ObjectiveId/);
  });
  it("preserves newer manual edits when an old review is submitted", () => {
    const s = service(),
      c = capture(s),
      id = s.confirmOcr(input(s, c)).contractId;
    const pending = input(s, c, id),
      old = s.snapshot().contracts[0];
    s.saveContract({
      id,
      draft: {
        name: "Newer correction",
        payout: old.payout,
        objectives: old.cargoObjectives,
      },
    });
    expect(() => s.confirmOcr(pending)).toThrow(/changed/);
    expect(s.snapshot().contracts[0].name).toBe("Newer correction");
    expect(s.snapshot().contracts[0].fieldProvenance?.name.source).toBe(
      "Manual",
    );
  });
  it("preserves supporting pickup and maximum progress in later and out-of-order Game.log events", () => {
    const s = service(),
      old = log(s),
      c = capture(s, reportedHydrogenFixture());
    s.confirmOcr(input(s, c, old.id));
    feed(
      s,
      notification(
        "New Objective: Deliver 6/31 SCU of Hydrogen to Rayari Deltana Research Outpost",
        missionA,
        "objective-" + missionA,
        "2026-10-21T15:00:00Z",
      ),
    );
    feed(
      s,
      notification(
        "New Objective: Deliver 2/31 SCU of Hydrogen to Rayari Deltana Research Outpost",
        missionA,
        "objective-" + missionA,
        "2026-10-20T15:00:00Z",
      ),
    );
    const row = s.snapshot().contracts[0].cargoObjectives[0];
    expect(row.deliveredSCU).toBe(6);
    expect(row.pickupLocation).toBe("microTech Logistics Depot S4LD13");
  });
  it("leaves indistinguishable unassigned OCR rows unresolved instead of merging or appending a duplicate", () => {
    const s = service(),
      old = log(s),
      c = capture(s, reportedHydrogenFixture()),
      i = input(s, c, old.id);
    // Explicitly retain two distinct OCR objectives. A later id-less event cannot choose between them.
    i.draft!.objectives = [
      {
        ...i.draft!.objectives[0],
        existingObjectiveId: undefined,
        externalObjectiveId: undefined,
        newDistinct: true,
      },
      {
        ...i.draft!.objectives[0],
        existingObjectiveId: undefined,
        externalObjectiveId: undefined,
        newDistinct: true,
      },
    ];
    i.removeObjectiveIds = [old.cargoObjectives[0].id];
    s.confirmOcr(i);
    feed(
      s,
      notification(
        "New Objective: Deliver 1/31 SCU of Hydrogen to Rayari Deltana Research Outpost",
        missionA,
      ),
    );
    expect(s.snapshot().contracts[0].cargoObjectives).toHaveLength(2);
    expect(s.snapshot().tracking.unresolved).toBeGreaterThan(0);
  });
});
describe("verified identity across consolidated evidence", () => {
  it("moves every screenshot binding to the canonical MissionId and exposes verified matches", () => {
    const s = service(),
      a = capture(s, reportedHydrogenFixture()),
      local = s.confirmOcr(input(s, a)).contractId,
      b = capture(s, reportedHydrogenFixture());
    s.confirmOcr(input(s, b, local));
    const canonical = log(s);
    s.confirmOcr(input(s, a, canonical.id));
    const review = s.prepareOcr({ captureId: b.id });
    expect(review.previous?.missionId).toBe(missionA);
    expect(review.target?.id).toBe(canonical.id);
    expect(
      review.candidates.some(
        (c) =>
          c.contract.id === canonical.id && c.kind === "Verified MissionId",
      ),
    ).toBe(true);
    expect(s.contractEvidence(canonical.id)).toHaveLength(2);
  });
});
