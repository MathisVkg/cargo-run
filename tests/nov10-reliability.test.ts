import { applyMissionEvent } from "../electron/main/log/reconcile";
import { parseLogLine } from "../electron/main/log/parser";
import { afterEach, describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { TrackingService } from "./helpers/beta";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { progressStamp } from "../src/types/progress";
import { locationIdentity } from "../electron/main/ocr/objectiveEvidence";
import type { CaptureRecord } from "../src/types/ocr";
const log = readFileSync(
  join(__dirname, "fixtures/log/nov10-sanitized.log"),
  "utf8",
)
  .trim()
  .split(/\r?\n/);
const mids = [
  "00000001-1111-4111-8111-111111111111",
  "00000004-1111-4111-8111-111111111111",
];
const services: TrackingService[] = [];
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
});
function service(file = ":memory:") {
  const s = new TrackingService(file);
  services.push(s);
  return s;
}
function feed(s: TrackingService, rows = log) {
  s.processLines(
    rows.map((text, i) => ({ text, offset: i * 100 })),
    { path: "sanitized-Nov10", generation: "nov10", offset: 0, mode: "Import" },
  );
}
function capture(s: TrackingService, name = "tin") {
  const f = JSON.parse(
    readFileSync(
      join(__dirname, "fixtures/mobiglas/nov10-" + name + ".json"),
      "utf8",
    ),
  );
  const id = randomUUID(),
    c: CaptureRecord = {
      id,
      capturedAt: f.capturedAt,
      source: "Manual",
      status: "Processed",
      displayId: "fixture",
      displayLabel: "Sanitized real Nov10",
      screenshot: null,
      width: f.result.width,
      height: f.result.height,
      bytes: 0,
      attempts: 1,
      error: null,
      result: f.result,
      observation: extractContract(f.result, id, f.capturedAt),
    };
  new CaptureRepository(s.database).put(c);
  return c;
}
describe("November 10 genuine session", () => {
  it("documents the exact 69-confidence Tin veto and requires corroboration when it is absent", () => {
    const s = service(),
      c = capture(s);
    expect(
      c
        .result!.lines.find((l) => /Deliver/.test(l.text))!
        .words!.find((w) => w.text === "0/12")!.confidence,
    ).toBe(69);
    expect(c.observation!.objectives[0].requiredSCU).toMatchObject({
      value: 12,
      state: "Ambiguous",
    });
    expect(s.processScan(c.id)?.status).toBe("Pending corrections");
  });
  it("uses independent logged objective evidence, associates two missions and closes each once with cargo unchanged", () => {
    const s = service();
    feed(
      s,
      log.filter((l) =>
        /Creating objective|Contract Accepted:|New Objective:/.test(l),
      ),
    );
    const tin = capture(s),
      aluminum = capture(s, "aluminum");
    expect(s.processScan(tin.id)?.status).toBe("Imported");
    expect(s.processScan(aluminum.id)?.status).toBe("Imported");
    expect(s.domain().contracts.map((c) => c.missionId)).toEqual(mids);
    const c = s.domain().contracts[0],
      o = c.cargoObjectives[0];
    s.cargoProgress({
      requestId: randomUUID(),
      shipId: s.domain().selectedShipId,
      changes: [
        {
          objectiveId: o.id,
          action: "Load",
          quantity: 9,
          expected: progressStamp(o),
        },
      ],
    });
    const cargo = structuredClone(
      s.domain().contracts.map((c) => c.cargoObjectives),
    );
    feed(s);
    feed(s);
    expect(s.domain().contracts.map((c) => c.status)).toEqual([
      "Completed",
      "Completed",
    ]);
    expect(s.domain().contracts.map((c) => c.cargoObjectives)).toEqual(cargo);
    expect(s.domain().contracts.map((c) => c.confirmedEarnings)).toEqual([
      0, 0,
    ]);
    expect(s.domain().contracts.map((c) => c.completedAt)).toEqual([
      "2026-11-10T14:29:45.978Z",
      "2026-11-10T14:29:46.016Z",
    ]);
    expect(s.lifecycleHistory(c.id)).toHaveLength(1);
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    const saved = new CaptureRepository(s.database).get(tin.id)!;
    expect(saved.result).toEqual(tin.result);
    expect(saved.observation!.objectives[0].quantityEvidence?.source).toBe(
      "Log objective",
    );
  });
  it("reconsiders an unimported uncertain capture when supporting log evidence arrives later", () => {
    const s = service(),
      c = capture(s);
    s.processScan(c.id);
    feed(s);
    expect(s.domain().contracts).toHaveLength(1);
    expect(s.domain().contracts[0]).toMatchObject({
      missionId: mids[0],
      status: "Completed",
    });
  });
  it("ignores old unknown title-only context and contradictory known quantities while preserving recent competition", () => {
    for (const recent of [false, true]) {
      const s = service();
      const id = randomUUID();
      const old = log
        .filter((l) => l.includes(mids[1]) && /Contract Accepted:/.test(l))
        .map((l) =>
          l
            .replaceAll(mids[1], id)
            .replace(
              "2026-11-10T14:17:12.744Z",
              recent ? "2026-11-10T14:17:11.744Z" : "2026-11-02T14:17:12.744Z",
            ),
        );
      feed(s, old);
      feed(
        s,
        log.filter(
          (l) =>
            l.includes(mids[1]) &&
            /Creating objective|Contract Accepted:/.test(l),
        ),
      );
      const c = capture(s, "aluminum");
      s.processScan(c.id);
      expect(s.domain().contracts[0].missionId).toBe(
        recent ? undefined : mids[1],
      );
    }
  });
  it("does not merge a partial/scrolled observation or resolve conflicting values by title/time", () => {
    const s = service();
    feed(s);
    const c = capture(s);
    c.result!.text += "\nMORE OBJECTIVES";
    c.observation = extractContract(c.result!, c.id, c.capturedAt);
    new CaptureRepository(s.database).put(c);
    expect(s.processScan(c.id)?.status).toBe("Pending corrections");
    expect(s.domain().contracts).toEqual([]);
  });
  it("preserves associations, evidence, cargo and audit after restart", async () => {
    const file = join(
        mkdtempSync(join(tmpdir(), "cargo-nov10-")),
        "cargo.sqlite",
      ),
      s = service(file);
    feed(s);
    const c = capture(s);
    s.processScan(c.id);
    const before = structuredClone(s.domain().contracts);
    await s.close();
    services.splice(services.indexOf(s), 1);
    const again = service(file);
    feed(again);
    expect(again.domain().contracts).toEqual(before);
    expect(again.contractEvidence(before[0].id)).toHaveLength(1);
    expect(again.database.db.prepare("PRAGMA foreign_key_check").all()).toEqual(
      [],
    );
  });
  it("matches only complete location qualifiers, never arbitrary prefixes or conflicting planets", () => {
    expect(
      locationIdentity(
        "Sakura Sun Goldenrod Workcenter",
        "Sakura Sun Goldenrod Workcenter on microTech",
      ),
    ).toBe(true);
    expect(
      locationIdentity("Port Tressler", "Port Tressler above microTech"),
    ).toBe(true);
    expect(
      locationIdentity("Sakura Sun", "Sakura Sun Goldenrod Workcenter"),
    ).toBe(false);
    expect(
      locationIdentity("Workcenter on microTech", "Workcenter on Hurston"),
    ).toBe(false);
  });
  it("imports real Tin without monitoring after separately recognizing the numeric pixel region at 95 confidence", () => {
    const s = service(),
      c = capture(s);
    const f = JSON.parse(
      readFileSync(join(__dirname, "fixtures/mobiglas/nov10-tin.json"), "utf8"),
    );
    c.result!.lines.find(
      (l) => l.id === f.regionalRecognition.lineId,
    )!.quantityCheck = f.regionalRecognition.quantityCheck;
    c.observation = extractContract(c.result!, c.id, c.capturedAt);
    new CaptureRepository(s.database).put(c);
    expect(s.processScan(c.id)?.status).toBe("Imported");
    expect(s.domain().contracts[0].cargoObjectives[0]).toMatchObject({
      quantitySCU: 12,
      deliveredSCU: 0,
    });
    expect(c.observation.coverage?.state).toBe("Established");
  });
  it.each([12, 13])(
    "distinguishes identical titles/commodity/destination only when objective requirements differ (%i)",
    (required) => {
      const s = service(),
        other = randomUUID();
      const start = log.filter(
        (l) =>
          l.includes(mids[0]) && /Contract Accepted:|New Objective:/.test(l),
      );
      feed(s, [
        ...start,
        ...start.map((l) =>
          l
            .replaceAll(mids[0], other)
            .replace("0/12 SCU", "0/" + required + " SCU"),
        ),
      ]);
      const c = capture(s);
      s.processScan(c.id);
      if (required === 12) {
        expect(s.domain().contracts).toEqual([]);
      } else {
        expect(s.domain().contracts[0].missionId).toBe(mids[0]);
        expect(
          s.domain().contracts[0].missionAssociation?.evidenceIds?.length,
        ).toBeGreaterThan(1);
      }
    },
  );
  it("does not reuse an already-abandoned matching acceptance as a current candidate", () => {
    const s = service(),
      old = randomUUID();
    const start = log.filter(
      (l) => l.includes(mids[0]) && /Contract Accepted:|New Objective:/.test(l),
    );
    feed(
      s,
      start.map((l) =>
        l.replaceAll(mids[0], old).replace("14:13:18.035Z", "14:00:00.000Z"),
      ),
    );
    feed(s, [
      "<2026-11-10T14:01:00Z> [Notice] <MissionEnded> Received MissionEnded push message for: mission_id " +
        old +
        " - mission_state MISSION_STATE_ABANDONED",
    ]);
    feed(s, start);
    const c = capture(s);
    s.processScan(c.id);
    expect(s.domain().contracts[0].missionId).toBe(mids[0]);
  });

  it("keeps a qualified OCR row when later supported log notifications omit the planet qualifier", () => {
    const s = service();
    feed(
      s,
      log.filter((l) => /Contract Accepted:|New Objective:/.test(l)),
    );
    const c = capture(s);
    s.processScan(c.id);
    const contract = s.domain().contracts[0],
      event = log
        .map((l) => parseLogLine(l))
        .find((e) => e.type === "event" && e.event.kind === "Objective");
    if (event?.type !== "event") throw Error("Missing genuine objective");
    const next = applyMissionEvent([contract], {
      ...event.event,
      id: randomUUID(),
      deliveredSCU: 1,
    }).contracts[0];
    expect(next.cargoObjectives).toHaveLength(1);
    expect(next.cargoObjectives[0].id).toBe(contract.cargoObjectives[0].id);
    expect(next.cargoObjectives[0].destination).toBe(
      "Sakura Sun Goldenrod Workcenter on microTech",
    );
  });
});
