import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrackingService } from "../electron/main/trackingService";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { notification } from "./fixtures/log";
import type { CaptureRecord, OcrResult } from "../src/types/ocr";
const services: TrackingService[] = [];
const create = () => {
  const s = new TrackingService(":memory:");
  services.push(s);
  return s;
};
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
});
function capture(s: TrackingService, multi = false) {
  const r: OcrResult = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "fixtures/mobiglas",
        multi
          ? "9ccc7ea4-c6f6-49bc-8bfc-701980e610da.json"
          : "88825398-27e5-4561-9516-c717ae7e750b.json",
      ),
      "utf8",
    ),
  ).result;
  if (multi) {
    let i = 0;
    r.lines = r.lines.map((l) => ({
      ...l,
      text: /Deliver 0\/\d+ SCU/.test(l.text)
        ? l.text.replace(/0\/\d+/, "0/" + [4, 5, 5, 4][i++])
        : l.text,
    }));
    r.text = r.lines.map((l) => l.text).join("\n");
  }
  const id = randomUUID(),
    at = "2026-11-01T20:00:00.000Z",
    c: CaptureRecord = {
      id,
      capturedAt: at,
      source: "Manual",
      status: "Processed",
      displayId: "fixture",
      displayLabel: "Synthetic matching case from repository coordinates",
      screenshot: null,
      width: r.width,
      height: r.height,
      bytes: 0,
      attempts: 1,
      error: null,
      result: r,
      observation: extractContract(r, id, at),
    };
  new CaptureRepository(s.database).put(c);
  return c;
}
function pending(
  s: TrackingService,
  title: string,
  mission = randomUUID(),
  at = "2026-11-01T19:55:00Z",
  cargo = true,
) {
  const lines = [
    notification("Contract Accepted: " + title, mission, undefined, at),
  ];
  if (cargo)
    lines.push(
      notification(
        "New Objective: Deliver 0/8 SCU of Agricultural Supplies to Port Tressler above microTech",
        mission,
        "objective-" + mission,
        at,
      ),
    );
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    { path: "fixture", generation: randomUUID(), offset: 0, mode: "Import" },
  );
  return mission;
}
describe("Objective-supported routine OCR candidates", () => {
  it("imports an accepted complete scan with no candidate", () => {
    const s = create(),
      c = capture(s);
    expect(s.processScan(c.id)?.status).toBe("Imported");
    expect(s.snapshot().contracts).toHaveLength(1);
  });
  it("selects one matching objective-supported pending mission without using time alone", () => {
    const s = create(),
      c = capture(s),
      mission = pending(s, c.observation!.title.value!);
    expect(s.processScan(c.id)?.status).toBe("Updated");
    expect(s.snapshot().contracts[0].missionId).toBe(mission);
    expect(
      s.snapshot().contracts[0].cargoObjectives[0].externalObjectiveId,
    ).toBe("objective-" + mission);
  });
  it("does not let two title-only pending Junior missions block the reported 65250/18 SCU capture", () => {
    const s = create(),
      c = capture(s, true),
      title = c.observation!.title.value!;
    pending(s, title, randomUUID(), "2026-11-01T11:13:05Z", false);
    pending(s, title, randomUUID(), "2026-11-01T19:55:29Z", false);
    const outcome = s.processScan(c.id)!;
    expect(outcome.status).toBe("Imported");
    expect(s.snapshot().contracts[0].missionId).toBeUndefined();
    expect(s.snapshot().contracts[0].payout).toBe(65250);
    expect(
      s
        .snapshot()
        .contracts[0].cargoObjectives.reduce((n, o) => n + o.quantitySCU, 0),
    ).toBe(18);
    expect(outcome.candidateIds).toEqual([]);
    expect(outcome.matchingDiagnostics).toHaveLength(2);
    expect(
      outcome.matchingDiagnostics?.every(
        (d) =>
          d.origin === "Pending Game.log" &&
          d.decision === "Excluded" &&
          d.objectiveCount === 0,
      ),
    ).toBe(true);
    expect(s.database.pendingMissions()).toHaveLength(2);
    expect(s.database.counts().accepted).toBe(2);
    expect(s.processScan(c.id)?.status).toBe("Imported");
    expect(s.snapshot().contracts).toHaveLength(1);
  });
  it("keeps genuine ambiguity between two different active MissionIds with identical cargo", () => {
    const s = create(),
      c = capture(s),
      title = c.observation!.title.value!;
    pending(s, title);
    pending(s, title, randomUUID(), "2026-11-01T19:59:59Z");
    const o = s.processScan(c.id)!;
    expect(o.status).toBe("Ambiguous match");
    expect(o.candidateIds).toHaveLength(2);
    expect(s.snapshot().contracts).toHaveLength(0);
  });
  it("excludes same-title pending missions with genuinely different commodities/destinations", () => {
    const s = create(),
      c = capture(s),
      mission = pending(s, c.observation!.title.value!);
    const p = s.database.pendingMissions()[0];
    p.cargoObjectives = p.cargoObjectives.map((o) => ({
      ...o,
      commodity: "Titanium",
      destination: "Orison",
      quantitySCU: 4,
    }));
    s.database.savePendingMission(p);
    expect(s.processScan(c.id)?.status).toBe("Imported");
    expect(s.snapshot().contracts[0].missionId).not.toBe(mission);
  });
  it("excludes old abandoned history but retains a recent closed-identity safety check", () => {
    for (const recent of [false, true]) {
      const s = create(),
        c = capture(s),
        mission = pending(
          s,
          c.observation!.title.value!,
          randomUUID(),
          recent ? "2026-11-01T19:55:00Z" : "2026-10-28T10:00:00Z",
        ),
        p = s.database.pendingMissions().find((t) => t.missionId === mission)!;
      p.status = "Abandoned";
      s.database.savePendingMission(p);
      const o = s.processScan(c.id)!;
      expect(o.candidateIds).toEqual([]);
      expect(o.status).toBe(recent ? "Pending corrections" : "Imported");
      if (recent) expect(o.message).toContain("already closed");
    }
  });
  it("does not elevate an unverified trigger into a MissionId binding", () => {
    const s = create(),
      c = capture(s),
      mission = pending(
        s,
        c.observation!.title.value!,
        randomUUID(),
        c.capturedAt,
        false,
      );
    c.trigger = {
      requestId: randomUUID(),
      candidateMissionId: mission,
      eventAt: c.capturedAt,
      eventType: "Accepted",
      delaySeconds: 3,
      attempt: 1,
      association: "Unverified",
    };
    new CaptureRepository(s.database).put(c);
    expect(s.processScan(c.id)?.status).toBe("Imported");
    expect(s.snapshot().contracts[0].missionId).toBeUndefined();
  });
  it("preserves a verified capture binding even if a distinct identical mission later appears", () => {
    const s = create(),
      c = capture(s),
      title = c.observation!.title.value!,
      mission = pending(s, title);
    s.processScan(c.id);
    pending(s, title);
    const issue = s.scanIssue({ captureId: c.id });
    expect(issue.review.target?.missionId).toBe(mission);
    expect(issue.outcome.status).toBe("Updated");
  });
  it("does not automatically merge a second identical OCR-only instance", () => {
    const s = create(),
      c = capture(s);
    s.processScan(c.id);
    const repeat = capture(s);
    expect(s.processScan(repeat.id)?.status).toBe("Ambiguous match");
    expect(s.snapshot().contracts).toHaveLength(1);
  });
});

describe("Matching persistence and diagnostic limits", () => {
  it("retains an imported capture identity across database restart without duplicating contracts", async () => {
    const database = join(
      mkdtempSync(join(tmpdir(), "cargo-matching-")),
      "cargo-run.sqlite",
    );
    const first = new TrackingService(database);
    services.push(first);
    const c = capture(first, true);
    pending(
      first,
      c.observation!.title.value!,
      randomUUID(),
      "2026-11-01T11:13:05Z",
      false,
    );
    expect(first.processScan(c.id)?.status).toBe("Imported");
    const id = first.snapshot().contracts[0].id;
    await first.close();
    services.splice(services.indexOf(first), 1);
    const restarted = new TrackingService(database);
    services.push(restarted);
    expect(restarted.snapshot().contracts).toHaveLength(1);
    expect(restarted.processScan(c.id)?.contractId).toBe(id);
    expect(restarted.snapshot().contracts).toHaveLength(1);
    expect(restarted.database.pendingMissions()).toHaveLength(1);
  });
  it("bounds diagnostic entries without deleting pending evidence", () => {
    const s = create(),
      c = capture(s);
    for (let i = 0; i < 55; i++)
      pending(
        s,
        c.observation!.title.value!,
        randomUUID(),
        c.capturedAt,
        false,
      );
    const o = s.processScan(c.id)!;
    expect(o.status).toBe("Imported");
    expect(o.matchingDiagnostics).toHaveLength(50);
    expect(s.database.pendingMissions()).toHaveLength(55);
    expect(s.database.counts().accepted).toBe(55);
  });
});
