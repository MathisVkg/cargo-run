import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TrackingService } from "./helpers/beta";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { parseLogLine } from "../electron/main/log/parser";
import { progressStamp } from "../src/types/progress";
import type { CaptureRecord, OcrResult } from "../src/types/ocr";
const services: TrackingService[] = [];
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
});
const real = readFileSync(
    join(__dirname, "fixtures/log/nov05-sanitized.log"),
    "utf8",
  )
    .trim()
    .split(/\r?\n/),
  mission = "11111111-1111-4111-8111-111111111111",
  title = "Rookie Rank - Direct Extra Small Cargo Haul";
function service(file = ":memory:") {
  const s = new TrackingService(file);
  services.push(s);
  return s;
}
function feed(s: TrackingService, lines = real) {
  s.processLines(
    lines.map((text, i) => ({ text, offset: i * 100 })),
    {
      path: "sanitized-real-fixture",
      generation: "nov05",
      offset: 0,
      mode: "Import",
    },
  );
}
function capture(s: TrackingService, at = "2026-11-05T18:24:30.000Z") {
  const r: OcrResult = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "fixtures/mobiglas/88825398-27e5-4561-9516-c717ae7e750b.json",
      ),
      "utf8",
    ),
  ).result;
  r.lines = r.lines.map((l) => ({
    ...l,
    text: l.text
      .replace("Rookie Rank - Direct Small Cargo Haul", title)
      .replaceAll("Agricultural Supplies", "Corundum"),
  }));
  r.text = r.lines.map((l) => l.text).join("\n");
  const id = randomUUID(),
    c: CaptureRecord = {
      id,
      capturedAt: at,
      source: "Manual",
      status: "Processed",
      displayId: "fixture",
      displayLabel: "Synthetic OCR with real-log commodity",
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
  expect(s.processScan(id)?.status).toBe("Imported");
  return c;
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
const start = real.filter((l) => /CreateMarker|Contract Accepted:/.test(l));
describe("Real November 5 identity-only fixture", () => {
  it("recognizes actual UTC acceptance, marker/state identifiers and unbracketed MissionEnded", () => {
    const parsed = real.map((l) => parseLogLine(l));
    expect(parsed.filter((p) => p.type === "identity")).toHaveLength(6);
    const accepted = parsed.find(
      (p) => p.type === "event" && p.event.kind === "Accepted",
    );
    expect(accepted?.type === "event" && accepted.event.timestamp).toBe(
      "2026-11-05T18:24:01.549Z",
    );
    const ended = parsed.find(
      (p) => p.type === "event" && p.event.kind === "Completed",
    );
    expect(ended?.type === "event" && ended.event.timestamp).toBe(
      "2026-11-05T18:37:35.664Z",
    );
    expect(parsed.filter((p) => p.type === "reward")).toHaveLength(1);
    expect(
      parsed.filter((p) => p.type === "event" && p.event.kind === "Objective"),
    ).toHaveLength(0);
  });
  it("associates at acceptance from paired marker/template corroboration and later closes with inventory preserved", () => {
    const s = service();
    capture(s);
    const before = structuredClone(s.domain().contracts[0]);
    cargo(s, "Load", 8);
    cargo(s, "Deliver", 5);
    feed(s, start);
    expect(s.domain().contracts[0]).toMatchObject({
      id: before.id,
      status: "Active",
      missionId: mission,
      missionAssociation: { source: "Acceptance context" },
    });
    const cargoBefore = structuredClone(
      s.domain().contracts[0].cargoObjectives,
    );
    feed(s, real);
    const c = s.domain().contracts[0];
    expect(c).toMatchObject({
      id: before.id,
      status: "Completed",
      completedAt: "2026-11-05T18:37:35.664Z",
      confirmedEarnings: 0,
    });
    expect(c.cargoObjectives).toEqual(cargoBefore);
    expect(s.cargoActivity(c.id)).toHaveLength(2);
    expect(s.snapshot().lifecycleIssues).toEqual([]);
    expect(s.lifecycleHistory(c.id)).toHaveLength(1);
  });
  it("handles log-first capture-later and completion before OCR finishes without placeholders", () => {
    const s = service();
    feed(s);
    expect(s.domain().contracts).toEqual([]);
    capture(s);
    expect(s.domain().contracts).toHaveLength(1);
    expect(s.domain().contracts[0]).toMatchObject({
      missionId: mission,
      status: "Completed",
    });
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM mission_identity_evidence")
        .get()!.n,
    ).toBe(5);
  });
  it("retains marker evidence arriving before acceptance and ignores duplicate notifications", () => {
    const s = service();
    capture(s);
    feed(
      s,
      start.filter((l) => /CreateMarker/.test(l)),
    );
    expect(s.domain().contracts[0].missionId).toBeUndefined();
    feed(
      s,
      start.filter((l) => /Contract Accepted:/.test(l)),
    );
    feed(s, start);
    expect(s.domain().contracts[0].missionId).toBe(mission);
    expect(s.database.counts().accepted).toBe(1);
    expect(s.domain().contracts).toHaveLength(1);
  });
  it("does not verify title plus timing without corroborating objective evidence", () => {
    const s = service();
    capture(s);
    feed(
      s,
      start.filter((l) => /Contract Accepted:/.test(l)),
    );
    expect(s.domain().contracts[0].missionId).toBeUndefined();
    expect(s.domain().contracts[0].associationDiagnostics?.decision).toBe(
      "Pending",
    );
  });
  it("leaves identical title/commodity missions ambiguous rather than choosing the closest time", () => {
    const s = service();
    capture(s);
    const second = randomUUID(),
      other = start.map((l) =>
        l
          .replaceAll(mission, second)
          .replaceAll("18:24:01.549", "18:24:02.000"),
      );
    feed(s, [...start, ...other]);
    expect(s.domain().contracts[0].missionId).toBeUndefined();
    expect(s.domain().contracts[0].associationDiagnostics?.reason).toMatch(
      /Multiple/,
    );
  });
  it("can distinguish same titles when the complete marker templates prove different commodities", () => {
    const s = service();
    capture(s);
    const other = start.map((l) =>
      l.replaceAll(mission, randomMission).replaceAll("Corundum", "Titanium"),
    );
    feed(s, [...start, ...other]);
    expect(s.domain().contracts[0].missionId).toBe(mission);
  });
  it("does not use an incomplete marker pair, inconsistent definition or an expired acceptance window", () => {
    for (const mode of ["pair", "definition", "invalidDefinition", "late"]) {
      const s = service();
      capture(s, mode === "late" ? "2026-11-05T18:27:30Z" : undefined);
      let rows = [...start];
      if (mode === "pair") rows = rows.filter((l) => !l.includes("dropoff_"));
      if (mode === "definition")
        rows = rows.map((l) =>
          l.includes("dropoff_")
            ? l.replace(
                /contractDefinitionId\[[^\]]+\]/,
                "contractDefinitionId[" + randomUUID() + "]",
              )
            : l,
        );
      if (mode === "invalidDefinition")
        rows = rows.map((l) =>
          l.replace(
            /contractDefinitionId\[[^\]]+\]/,
            "contractDefinitionId[00000000-0000-0000-0000-000000000000]",
          ),
        );
      feed(s, rows);
      expect(s.domain().contracts[0].missionId).toBeUndefined();
    }
  });
  it("preserves verified associations across restart and repeated real-log history import", async () => {
    const file = join(
        mkdtempSync(join(tmpdir(), "cargo-acceptance-")),
        "cargo.sqlite",
      ),
      s = service(file);
    capture(s);
    feed(s);
    const c = structuredClone(s.domain().contracts[0]);
    await s.close();
    services.splice(services.indexOf(s), 1);
    const reopened = service(file);
    feed(reopened);
    expect(reopened.domain().contracts).toEqual([c]);
    expect(reopened.lifecycleHistory(c.id)).toHaveLength(1);
    expect(
      reopened.database.db.prepare("PRAGMA foreign_key_check").all(),
    ).toEqual([]);
  });
  it("does not duplicate a reserved MissionId or close an unrelated OCR contract", () => {
    const s = service();
    capture(s);
    const c = s.domain().contracts[0],
      id = randomUUID();
    s.store.setState({
      contracts: [
        c,
        {
          ...structuredClone(c),
          id,
          missionId: mission,
          name: "Other verified mission",
          cargoObjectives: [],
        },
      ],
    });
    s.database.transaction(() => s.database.saveDomain(s.domain()));
    feed(s);
    expect(s.domain().contracts[0].missionId).toBeUndefined();
    expect(s.domain().contracts[0].status).toBe("Active");
    expect(
      s.domain().contracts.filter((c) => c.missionId === mission),
    ).toHaveLength(1);
  });
  it("keeps canonical reward evidence unverified despite the real matching payout", () => {
    const s = service();
    feed(s);
    expect(
      s.database.db
        .prepare("SELECT COUNT(*) AS n FROM unattributed_rewards")
        .get()!.n,
    ).toBe(1);
    expect(s.domain().contracts).toEqual([]);
  });

  it("corroborates the observed Aluminium template spelling against Aluminum OCR without title-only matching", () => {
    const s = service(),
      cap = capture(s),
      repo = new CaptureRepository(s.database);
    const c = s.domain().contracts[0];
    const r = structuredClone(cap.result!);
    r.lines = r.lines.map((l) => ({
      ...l,
      text: l.text.replaceAll("Corundum", "Aluminum"),
    }));
    r.text = r.lines.map((l) => l.text).join("\n");
    // Update the same fixture's OCR-owned commodity, preserving its row identity.
    const updated = {
      ...c,
      cargoObjectives: c.cargoObjectives.map((o) => ({
        ...o,
        commodity: "Aluminum",
      })),
    };
    s.store.setState({ contracts: [updated] });
    s.database.saveDomain(s.domain());
    const observation = extractContract(r, cap.id, cap.capturedAt);
    repo.put({ ...cap, result: r, observation });
    const link = s.contractEvidence(c.id)[0];
    s.database.db
      .prepare("UPDATE capture_contract_links SET payload=? WHERE capture_id=?")
      .run(JSON.stringify({ ...link, observation }), cap.id);
    feed(
      s,
      start.map((l) => l.replaceAll("Corundum", "Aluminium")),
    );
    expect(s.domain().contracts[0].missionId).toBe(mission);
    expect(s.domain().contracts[0].missionAssociation?.source).toBe(
      "Acceptance context",
    );
    feed(
      s,
      real.map((l) => l.replaceAll("Corundum", "Aluminium")),
    );
    expect(s.domain().contracts[0]).toMatchObject({
      status: "Completed",
      confirmedEarnings: 0,
    });
  });
  it("explains missing corroboration in manual fallback and does not resolve from one title candidate", () => {
    const s = service();
    capture(s);
    feed(
      s,
      real.filter((l) => !l.includes("CreateMarker")),
    );
    const i = s.snapshot().lifecycleIssues![0];
    expect(i.candidates).toHaveLength(1);
    expect(i.candidates[0].automaticReason).toMatch(/No complete/);
    expect(i.candidates[0].identityEvidence).toMatch(/objective state/);
    expect(s.domain().contracts[0].status).toBe("Active");
  });
});
const randomMission = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
