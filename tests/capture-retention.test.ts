import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  unlinkSync,
  utimesSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { CargoDatabase } from "../electron/main/storage/database";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { CaptureRetention, expiration } from "../electron/main/ocr/retention";
import {
  defaultCapturePolicy,
  validatePolicy,
} from "../src/types/capturePolicy";
import type { CaptureRecord } from "../src/types/ocr";
const resources: { db: CargoDatabase; folder: string }[] = [];
const now = Date.parse("2026-10-27T12:00:00Z");
function setup() {
  mkdirSync("work", { recursive: true });
  const folder = mkdtempSync(join(resolve("work"), "retention-unit-")),
    db = new CargoDatabase(":memory:"),
    repository = new CaptureRepository(db);
  resources.push({ db, folder });
  function record(age: number, status: CaptureRecord["status"] = "Processed") {
    const c: CaptureRecord = {
      id: randomUUID(),
      capturedAt: new Date(now - age * 86400000).toISOString(),
      source: "Manual",
      status,
      displayId: null,
      displayLabel: null,
      screenshot: null,
      width: 100,
      height: 100,
      bytes: 3,
      attempts: 1,
      error: null,
      result: null,
      observation: null,
    };
    c.screenshot = c.id + ".png";
    repository.put(c);
    writeFileSync(join(folder, c.screenshot), "abc");
    return c;
  }
  return {
    folder,
    db,
    repository,
    record,
    retention: new CaptureRetention(repository, folder),
  };
}
afterEach(() => {
  for (const { db, folder } of resources.splice(0)) {
    db.close();
    if (!resolve(folder).startsWith(resolve("work") + sep))
      throw Error("Unsafe test cleanup");
    rmSync(folder, { recursive: true, force: true });
  }
});
describe("capture retention and schema compatibility", () => {
  it("deletes expired unlinked evidence and metadata but preserves nonexpired and processing captures", () => {
    const s = setup(),
      old = s.record(8),
      fresh = s.record(6),
      busy = s.record(30, "Processing"),
      pending = s.record(30, "Captured");
    const result = s.retention.cleanup(defaultCapturePolicy, new Set(), now);
    expect(result.deleted).toBe(1);
    expect(s.repository.get(old.id)).toBeNull();
    expect(existsSync(join(s.folder, old.screenshot!))).toBe(false);
    expect(s.repository.list().map((c) => c.id)).toEqual([
      fresh.id,
      busy.id,
      pending.id,
    ]);
  });
  it("protects active-request records and removes metadata for already missing files", () => {
    const s = setup(),
      protectedRecord = s.record(8),
      missing = s.record(8);
    unlinkSync(join(s.folder, missing.screenshot!));
    s.retention.cleanup(
      defaultCapturePolicy,
      new Set([protectedRecord.id]),
      now,
    );
    expect(s.repository.get(missing.id)).toBeNull();
    expect(s.repository.get(protectedRecord.id)).not.toBeNull();
  });
  it("keeps metadata and reports a cleanup failure so a later cleanup can retry", () => {
    const s = setup(),
      c = s.record(8);
    const broken = new CaptureRetention(s.repository, s.folder, () => {
      throw Error("File locked");
    });
    expect(
      broken.cleanup(defaultCapturePolicy, new Set(), now).errors[0],
    ).toContain("locked");
    expect(s.repository.get(c.id)).not.toBeNull();
    expect(
      s.retention.cleanup(defaultCapturePolicy, new Set(), now).deleted,
    ).toBe(1);
  });
  it("calculates owned storage and never removes unrelated files", () => {
    const s = setup();
    s.record(0);
    writeFileSync(join(s.folder, "unrelated.txt"), "private");
    expect(s.retention.usage().bytes).toBe(3);
    s.retention.cleanup(defaultCapturePolicy, new Set(), now);
    expect(existsSync(join(s.folder, "unrelated.txt"))).toBe(true);
  });
  it("prepares future linked evidence policy without inventing associations", () => {
    const s = setup(),
      c = s.record(100);
    expect(
      expiration(
        {
          ...c,
          evidenceLink: {
            contractId: "future",
            status: "Active",
            closedAt: null,
          },
        },
        defaultCapturePolicy,
      ),
    ).toBeNull();
    expect(
      expiration(
        {
          ...c,
          evidenceLink: {
            contractId: "future",
            status: "Completed",
            closedAt: "2026-10-01T00:00:00Z",
          },
        },
        defaultCapturePolicy,
      ),
    ).toBe("2026-10-31T00:00:00.000Z");
    expect(c.evidenceLink).toBeUndefined();
  });
  it("validates all retention and capture policy controls", () => {
    expect(validatePolicy(defaultCapturePolicy)).toEqual(defaultCapturePolicy);
    for (const invalid of [
      { delaySeconds: 0 },
      { delaySeconds: 11 },
      { maxAttempts: 6 },
      { unlinkedDays: 2 },
      { source: "Launcher" },
      { autoEnabled: "yes" },
    ])
      expect(() =>
        validatePolicy({ ...defaultCapturePolicy, ...invalid }),
      ).toThrow();
  });
  it("migrates v2 while preserving existing capture and contract payloads", () => {
    const s = setup(),
      c = s.record(0);
    s.db.db.exec("DROP TABLE automatic_captures; PRAGMA user_version=2");
    const file = join(s.folder, "legacy.sqlite");
    const fileDb = new CargoDatabase(file);
    fileDb.db
      .prepare("INSERT INTO ocr_captures(id,payload) VALUES(?,?)")
      .run(c.id, JSON.stringify(c));
    fileDb.db
      .prepare(
        "INSERT INTO contracts(id,mission_id,origin,payload) VALUES(?,?,?,?)",
      )
      .run("legacy", null, "Manual", '{"name":"Keep contract"}');
    fileDb.db.exec("DROP TABLE automatic_captures; PRAGMA user_version=2");
    fileDb.close();
    const upgraded = new CargoDatabase(file);
    expect(new CaptureRepository(upgraded).get(c.id)).toEqual(c);
    expect(
      upgraded.db.prepare("SELECT payload FROM contracts").get()?.payload,
    ).toContain("Keep contract");
    expect(upgraded.db.prepare("PRAGMA user_version").get()?.user_version).toBe(
      5,
    );
    upgraded.close();
  });
});

it("removes expired orphan images in the owned namespace and leaves unrelated files", () => {
  const s = setup(),
    id = randomUUID(),
    file = join(s.folder, id + ".png");
  writeFileSync(file, "old");
  const old = new Date(now - 8 * 86400000);
  utimesSync(file, old, old);
  writeFileSync(join(s.folder, "unrelated.png"), "keep");
  expect(
    s.retention.cleanup(defaultCapturePolicy, new Set(), now).deleted,
  ).toBe(1);
  expect(existsSync(file)).toBe(false);
  expect(existsSync(join(s.folder, "unrelated.png"))).toBe(true);
});
it("reports an unavailable capture folder without crashing", () => {
  const s = setup();
  if (!resolve(s.folder).startsWith(resolve("work") + sep))
    throw Error("Unsafe test cleanup");
  rmSync(s.folder, { recursive: true, force: true });
  expect(
    s.retention.cleanup(defaultCapturePolicy, new Set(), now).errors.length,
  ).toBeGreaterThan(0);
});
