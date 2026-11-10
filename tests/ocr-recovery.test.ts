import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TrackingService } from "./helpers/beta";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { OcrQueue } from "../electron/main/ocr/queue";
import { extractContract } from "../electron/main/ocr/parser";
import { progressStamp } from "../src/types/progress";
import type { CaptureRecord, OcrResult } from "../src/types/ocr";
const services: TrackingService[] = [],
  queues: OcrQueue[] = [];
afterEach(async () => {
  for (const q of queues.splice(0)) await q.close();
  for (const s of services.splice(0)) await s.close();
});
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), "cargo-ocr-recovery-")),
    s = new TrackingService(":memory:");
  services.push(s);
  const repo = new CaptureRepository(s.database);
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
    at = new Date().toISOString();
  const c: CaptureRecord = {
    id,
    capturedAt: at,
    source: "Manual",
    status: "Processed",
    displayId: "fixture",
    displayLabel: "Recovery fixture",
    screenshot: id + ".png",
    width: result.width,
    height: result.height,
    bytes: 5,
    attempts: 1,
    error: null,
    result,
    observation: extractContract(result, id, at),
  };
  writeFileSync(join(folder, id + ".png"), "image");
  repo.put(c);
  let available = true,
    calls = 0,
    recognize = async () => structuredClone(result);
  const q = new OcrQueue(
    repo,
    {
      available: () => ({ available: true, error: null }),
      displays: async () => [],
      capture: async () => {
        throw Error("Recovery must never capture another image");
      },
      feedback: async () => {},
      close: async () => {},
    },
    {
      name: "Offline test worker",
      available: () => ({
        available,
        error: available ? null : "Bundled OCR engine unavailable",
      }),
      recognize: async () => {
        calls++;
        return recognize();
      },
      close: async () => {},
    },
    { register: () => true, unregister: () => {}, isRegistered: () => true },
    folder,
    async (file) => {
      if (!existsSync(file)) throw Error("Saved image unavailable");
      return {
        image: Buffer.from("image"),
        width: result.width,
        height: result.height,
      };
    },
  );
  q.onRecognized = (id) => {
    s.processScan(id);
  };
  queues.push(q);
  await q.initialize();
  return {
    s,
    repo,
    q,
    c,
    result,
    folder,
    calls: () => calls,
    setAvailable: (v: boolean) => {
      available = v;
    },
    setRecognition: (r: () => Promise<OcrResult>) => {
      recognize = r;
    },
  };
}
async function finished(x: Awaited<ReturnType<typeof setup>>) {
  for (let i = 0; i < 200; i++) {
    const c = x.repo.get(x.c.id)!;
    if (c.recovery && !["Queued", "Processing"].includes(c.recovery.status))
      return c;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("Recovery timed out");
}
describe("Saved screenshot recognition recovery", () => {
  it("runs the worker, visibly improves missing pickup and imports without another capture", async () => {
    const x = await setup(),
      o = structuredClone(x.c.observation!);
    o.objectives[0].pickup = {
      ...o.objectives[0].pickup,
      value: null,
      state: "Missing",
    };
    x.repo.put({ ...x.c, observation: o });
    x.s.processScan(x.c.id);
    expect(x.s.domain().contracts).toHaveLength(0);
    const started = x.q.reprocess(x.c.id);
    expect(started.captures[0].recovery?.status).toBe("Processing");
    expect(x.repo.get(x.c.id)?.observation).toEqual(o);
    const done = await finished(x);
    expect(done.recovery?.status).toBe("Improved");
    expect(done.recovery?.message).toMatch(/completed/);
    expect(done.observation?.objectives[0].pickup.value).toBeTruthy();
    expect(done.originalRecognition?.observation).toEqual(o);
    expect(x.s.domain().contracts).toHaveLength(1);
    expect(x.calls()).toBe(1);
    expect(readFileSync(join(x.folder, x.c.id + ".png"), "utf8")).toBe("image");
  });
  it("explicitly reports unchanged extraction and does not duplicate imported cargo or evidence", async () => {
    const x = await setup();
    x.s.processScan(x.c.id);
    const before = structuredClone(x.s.domain().contracts);
    x.q.reprocess(x.c.id);
    const done = await finished(x);
    expect(done.recovery?.status).toBe("Unchanged");
    expect(done.recovery?.message).toMatch(/same information/);
    expect(x.s.domain().contracts).toEqual(before);
    expect(x.s.contractEvidence(before[0].id)).toHaveLength(1);
    expect(x.s.cargoActivity(before[0].id)).toHaveLength(0);
    expect(done.attempts).toBe(2);
  });
  it("explains unchanged missing information and preserves it for a compact manual correction", async () => {
    const x = await setup(),
      r = structuredClone(x.result);
    r.lines = r.lines.filter((l) => !/Collect|NB Int|Spaceport/.test(l.text));
    r.text = r.lines.map((l) => l.text).join("\n");
    const observation = extractContract(r, x.c.id, x.c.capturedAt);
    expect(observation.objectives[0].pickup.value).toBeNull();
    x.repo.put({ ...x.c, result: r, observation });
    x.setRecognition(async () => structuredClone(r));
    x.q.reprocess(x.c.id);
    const done = await finished(x);
    expect(done.recovery?.status).toBe("Unchanged");
    expect(done.recovery?.message).toMatch(/never visible|not visible/);
    expect(x.s.domain().contracts).toHaveLength(0);
  });
  it("reports missing/expired screenshots without changing recognized data or linked contract", async () => {
    const x = await setup();
    x.s.processScan(x.c.id);
    const before = structuredClone(x.s.domain());
    unlinkSync(join(x.folder, x.c.id + ".png"));
    expect(() => x.q.reprocess(x.c.id)).toThrow(/missing/);
    const c = x.repo.get(x.c.id)!;
    expect(c.recovery?.status).toBe("Failed");
    expect(c.result).toEqual(x.c.result);
    expect(c.observation).toEqual(x.c.observation);
    expect(x.s.domain()).toEqual(before);
    expect(x.calls()).toBe(0);
  });
  it("reports an unavailable engine before queueing or dropping previous evidence", async () => {
    const x = await setup();
    x.setAvailable(false);
    expect(() => x.q.reprocess(x.c.id)).toThrow(/unavailable/);
    expect(x.repo.get(x.c.id)?.result).toEqual(x.c.result);
    expect(x.repo.get(x.c.id)?.recovery?.status).toBe("Failed");
    expect(x.calls()).toBe(0);
  });
  it("retains previous recognition on worker error and allows a later retry", async () => {
    const x = await setup();
    x.s.processScan(x.c.id);
    const before = structuredClone(x.s.domain());
    x.setRecognition(async () => {
      throw Error("Synthetic worker failure: retry locally");
    });
    x.q.reprocess(x.c.id);
    const failed = await finished(x);
    expect(failed.recovery?.status).toBe("Failed");
    expect(failed.recovery?.message).toMatch(/worker failure/);
    expect(failed.result).toEqual(x.c.result);
    expect(x.s.domain()).toEqual(before);
    x.setRecognition(async () => structuredClone(x.result));
    x.q.reprocess(x.c.id);
    expect((await finished(x)).recovery?.status).toBe("Unchanged");
    expect(x.s.domain().contracts).toHaveLength(1);
  });
  it("rejects blank or worse replacement recognition and keeps original immutable evidence", async () => {
    const x = await setup();
    x.s.processScan(x.c.id);
    x.setRecognition(async () => ({ ...x.result, text: "", lines: [] }));
    x.q.reprocess(x.c.id);
    const done = await finished(x);
    expect(done.recovery?.status).toBe("Failed");
    expect(done.result).toEqual(x.c.result);
    expect(done.originalRecognition?.result).toEqual(x.c.result);
    expect(done.recognitionHistory?.[0].result?.text).toBe("");
    expect(x.s.domain().contracts).toHaveLength(1);
  });
  it("does not erase manual corrections, loaded cargo or delivery history during a changed rescan", async () => {
    const x = await setup();
    x.s.processScan(x.c.id);
    const c = x.s.domain().contracts[0];
    for (const [action, quantity] of [
      ["Load", 7],
      ["Deliver", 2],
    ] as const) {
      const o = x.s.domain().contracts[0].cargoObjectives[0];
      x.s.cargoProgress({
        requestId: randomUUID(),
        shipId: x.s.domain().selectedShipId,
        changes: [
          { objectiveId: o.id, action, quantity, expected: progressStamp(o) },
        ],
      });
    }
    x.s.saveContract({
      id: c.id,
      draft: {
        name: "Manual corrected title",
        payout: 1234,
        objectives: x.s.domain().contracts[0].cargoObjectives,
      },
    });
    const before = structuredClone(x.s.domain().contracts);
    const changed = structuredClone(x.result);
    changed.lines = changed.lines.map((l) => ({
      ...l,
      text: l.text.replace("34,500", "35,000"),
    }));
    changed.text = changed.lines.map((l) => l.text).join("\n");
    x.setRecognition(async () => changed);
    x.q.reprocess(x.c.id);
    await finished(x);
    expect(x.s.domain().contracts).toEqual(before);
    expect(x.s.cargoActivity(c.id)).toHaveLength(2);
    expect(x.repo.get(x.c.id)?.originalRecognition?.result).toEqual(x.result);
  });
  it("suppresses duplicate in-flight requests and bounds recognition history", async () => {
    const x = await setup();
    let release!: (r: OcrResult) => void;
    x.setRecognition(
      () =>
        new Promise<OcrResult>((r) => {
          release = r;
        }),
    );
    x.q.reprocess(x.c.id);
    await new Promise((r) => setTimeout(r, 1));
    x.q.reprocess(x.c.id);
    expect(x.calls()).toBe(1);
    release(x.result);
    await finished(x);
    x.setRecognition(async () => structuredClone(x.result));
    for (let i = 0; i < 4; i++) {
      x.q.reprocess(x.c.id);
      await finished(x);
    }
    expect(x.repo.get(x.c.id)?.recognitionHistory).toHaveLength(3);
    expect(x.repo.get(x.c.id)?.originalRecognition?.result).toEqual(x.result);
  });
  it("restores previous recognition and surfaces an import transaction failure", async () => {
    const x = await setup();
    x.q.onRecognized = () => {
      throw Error("Simulated import transaction failure");
    };
    x.q.reprocess(x.c.id);
    const done = await finished(x);
    expect(done.recovery?.status).toBe("Failed");
    expect(done.recovery?.message).toMatch(/transaction failure/);
    expect(done.result).toEqual(x.result);
    expect(x.s.domain().contracts).toEqual([]);
  });
  it("keeps saved-text extraction distinct from image recognition", async () => {
    const x = await setup();
    x.q.reparse(x.c.id);
    expect(x.calls()).toBe(0);
    expect(x.repo.get(x.c.id)?.attempts).toBe(1);
    expect(x.repo.get(x.c.id)?.recovery?.message).toMatch(
      /without image recognition/,
    );
  });

  it.each(["image", "saved text"])(
    "repairs an OCR-owned 715 requirement to 15 via %s without replacing row identity, verified mission or cargo",
    async (mode) => {
      const x = await setup();
      const r: OcrResult = JSON.parse(
        readFileSync(
          join(__dirname, "fixtures/mobiglas/agricultural-15-real.json"),
          "utf8",
        ),
      ).result;
      const old = extractContract(r, x.c.id, x.c.capturedAt);
      old.parserVersion = "0.4.1";
      old.objectives[0].requiredSCU.value = 715;
      x.repo.put({ ...x.c, result: r, observation: old });
      expect(x.s.processScan(x.c.id)?.status).toBe("Imported");
      let c = x.s.domain().contracts[0];
      const objectiveId = c.cargoObjectives[0].id;
      for (const [action, quantity] of [
        ["Load", 9],
        ["Deliver", 2],
      ] as const) {
        const o = x.s.domain().contracts[0].cargoObjectives[0];
        x.s.cargoProgress({
          requestId: randomUUID(),
          shipId: x.s.domain().selectedShipId,
          changes: [
            { objectiveId: o.id, action, quantity, expected: progressStamp(o) },
          ],
        });
      }
      c = x.s.domain().contracts[0];
      const missionId = randomUUID();
      x.s.store.setState({
        contracts: [
          {
            ...c,
            missionId,
            missionAssociation: {
              source: "User confirmed",
              at: x.c.capturedAt,
              eventId: "verified-fixture",
            },
          },
        ],
      });
      x.s.database.saveDomain(x.s.domain());
      const before = structuredClone(x.s.domain().contracts[0]);
      if (mode === "image") {
        x.setRecognition(async () => structuredClone(r));
        x.q.reprocess(x.c.id);
        await finished(x);
      } else x.q.reparse(x.c.id);
      const after = x.s.domain().contracts[0];
      expect(after).toMatchObject({
        id: before.id,
        missionId,
        status: "Active",
        confirmedEarnings: 0,
      });
      expect(after.cargoObjectives).toHaveLength(1);
      expect(after.cargoObjectives[0]).toMatchObject({
        id: objectiveId,
        quantitySCU: 15,
        loadedSCU: 7,
        deliveredSCU: 2,
        loadedShipId: before.cargoObjectives[0].loadedShipId,
      });
      expect(x.repo.get(x.c.id)?.importResult?.status).toBe("Updated");
      expect(x.s.cargoActivity(before.id)).toHaveLength(2);
      expect(x.repo.get(x.c.id)?.originalRecognition?.observation).toEqual(old);
    },
  );
  it("withholds uncertain quantities even when a verified target could establish coverage", async () => {
    const x = await setup();
    const obs = structuredClone(x.c.observation!);
    obs.objectives[0].requiredSCU.state = "Ambiguous";
    x.repo.put({ ...x.c, observation: obs });
    expect(x.s.processScan(x.c.id)?.status).toBe("Pending corrections");
    expect(x.s.domain().contracts).toEqual([]);
  });

  it("preserves a manually corrected requirement when fresh recognition disagrees", async () => {
    const x = await setup();
    const r: OcrResult = JSON.parse(
      readFileSync(
        join(__dirname, "fixtures/mobiglas/agricultural-15-real.json"),
        "utf8",
      ),
    ).result;
    const old = extractContract(r, x.c.id, x.c.capturedAt);
    old.objectives[0].requiredSCU.value = 715;
    x.repo.put({ ...x.c, result: r, observation: old });
    x.s.processScan(x.c.id);
    const c = x.s.domain().contracts[0];
    x.s.saveContract({
      id: c.id,
      draft: {
        name: c.name,
        payout: c.payout,
        objectives: c.cargoObjectives.map((o) => ({ ...o, quantitySCU: 20 })),
      },
    });
    const before = structuredClone(x.s.domain().contracts);
    x.setRecognition(async () => structuredClone(r));
    x.q.reprocess(x.c.id);
    await finished(x);
    expect(x.s.domain().contracts).toEqual(before);
    expect(x.repo.get(x.c.id)?.importResult?.status).toBe(
      "Pending corrections",
    );
  });
});
