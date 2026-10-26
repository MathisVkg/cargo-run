import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { resolve, join, sep, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { CargoDatabase } from "../electron/main/storage/database";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { OcrQueue } from "../electron/main/ocr/queue";
import {
  CaptureShortcut,
  validateCaptureSettings,
} from "../electron/main/ocr/shortcut";
import { ocrFixture } from "./fixtures/ocr";
import type { CaptureBackend } from "../electron/main/ocr/nativeHost";
import type { OcrProvider } from "../electron/main/ocr/provider";
const folders: string[] = [],
  queues: OcrQueue[] = [],
  databases: CargoDatabase[] = [];
function setup(persist?: string) {
  mkdirSync("work", { recursive: true });
  const folder = mkdtempSync(join(resolve("work"), "ocr-unit-"));
  folders.push(folder);
  const db = new CargoDatabase(persist ?? ":memory:");
  databases.push(db);
  const repository = new CaptureRepository(db);
  const order: string[] = [],
    sounds: boolean[] = [];
  let fail = false,
    active = 0,
    overlap = false;
  const backend: CaptureBackend = {
    available: () => ({ available: true, error: null }),
    displays: async () => [
      {
        id: "display-1",
        label: "Display 1",
        width: 1920,
        height: 1080,
        primary: true,
      },
    ],
    capture: async (id) => {
      order.push(id);
      writeFileSync(join(folder, id + ".png"), "synthetic");
      writeFileSync(join(folder, id + ".thumb.png"), "synthetic");
      return {
        displayId: "display-1",
        displayLabel: "Display 1",
        width: 1920,
        height: 1080,
        bytes: 100,
        soundRequested: false,
      };
    },
    feedback: async (good) => {
      sounds.push(good);
    },
    close: async () => {},
  };
  const provider: OcrProvider = {
    name: "Mock offline provider",
    available: () => ({ available: true, error: null }),
    recognize: async () => {
      active++;
      if (active > 1) overlap = true;
      try {
        await new Promise((r) => setTimeout(r, 15));
        if (fail) throw Error("Synthetic OCR failure");
        return ocrFixture(true);
      } finally {
        active--;
      }
    },
    close: async () => {},
  };
  const api = {
    register: () => true,
    unregister: () => {},
    isRegistered: () => true,
  };
  const queue = new OcrQueue(
    repository,
    backend,
    provider,
    api,
    folder,
    async (path) => {
      if (!existsSync(path)) throw Error("Missing screenshot");
      return { image: Buffer.from("fixture"), width: 1920, height: 1080 };
    },
  );
  queues.push(queue);
  return {
    queue,
    db,
    repository,
    folder,
    order,
    sounds,
    setFail: (value: boolean) => {
      fail = value;
    },
    overlap: () => overlap,
  };
}
async function until(check: () => boolean) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("Queue condition timed out");
}
afterEach(async () => {
  for (const q of queues.splice(0)) await q.close();
  for (const db of databases.splice(0)) db.close();
  for (const p of folders.splice(0)) {
    const target = resolve(p);
    if (
      !target.startsWith(resolve("work") + sep) ||
      !basename(target).startsWith("ocr-unit-")
    )
      throw Error("Unsafe test cleanup");
    rmSync(target, { recursive: true, force: true });
  }
});
describe("capture queue and scoped shortcuts", () => {
  it("captures in request order and recognizes serially while allowing rapid captures", async () => {
    const s = setup();
    await s.queue.initialize();
    await Promise.all([
      s.queue.capture("Shortcut"),
      s.queue.capture("Shortcut"),
      s.queue.capture("Shortcut"),
    ]);
    const ids = s.repository.list().map((r) => r.id);
    await until(() =>
      s.repository.list().every((r) => r.status === "Processed"),
    );
    expect(s.order).toEqual(ids);
    expect(s.overlap()).toBe(false);
    expect(s.sounds).toEqual([true, true, true]);
    expect(
      s.db.db.prepare("SELECT COUNT(*) AS n FROM contracts").get()?.n,
    ).toBe(0);
  });
  it("records processing failures independently from successful screenshot confirmation and allows retry", async () => {
    const s = setup();
    s.setFail(true);
    await s.queue.initialize();
    await s.queue.capture("Manual");
    await until(() => s.repository.list()[0]?.status === "Failed");
    const record = s.repository.list()[0];
    expect(record.screenshot).toBeTruthy();
    expect(record.error).toContain("Synthetic");
    expect(s.sounds).toEqual([true]);
    s.setFail(false);
    s.queue.retry(record.id);
    await until(() => s.repository.get(record.id)?.status === "Processed");
    expect(s.repository.get(record.id)?.attempts).toBe(2);
  });
  it("persists queue results and settings in SQLite without touching log configuration", async () => {
    const s = setup();
    const file = join(s.folder, "persistent.sqlite");
    const other = new CargoDatabase(file);
    const repo = new CaptureRepository(other);
    repo.saveSettings({
      enabled: false,
      accelerator: "Ctrl+Alt+F10",
      sounds: false,
      displayId: "auto",
    });
    repo.put({
      id: randomUUID(),
      capturedAt: new Date().toISOString(),
      source: "Manual",
      status: "Failed",
      displayId: null,
      displayLabel: null,
      screenshot: null,
      width: null,
      height: null,
      bytes: 0,
      attempts: 1,
      error: "Fixture error",
      result: null,
      observation: null,
    });
    other.close();
    const reopened = new CargoDatabase(file);
    expect(new CaptureRepository(reopened).list()[0].error).toBe(
      "Fixture error",
    );
    expect(new CaptureRepository(reopened).settings().sounds).toBe(false);
    reopened.close();
    expect(s.db.getMonitorConfig()).toEqual({ path: null, enabled: false });
  });
  it("resumes interrupted OCR after restart and marks interrupted unsaved captures failed", async () => {
    const s = setup();
    const id = randomUUID();
    writeFileSync(join(s.folder, id + ".png"), "fixture");
    const base = {
      id,
      capturedAt: new Date().toISOString(),
      source: "Manual" as const,
      status: "Processing" as const,
      displayId: "display-1",
      displayLabel: "Display",
      screenshot: id + ".png",
      width: 1920,
      height: 1080,
      bytes: 100,
      attempts: 1,
      error: null,
      result: null,
      observation: null,
    };
    s.repository.put(base);
    s.repository.put({
      ...base,
      id: randomUUID(),
      screenshot: null,
      status: "Captured",
    });
    await s.queue.initialize();
    await until(() => s.repository.get(id)?.status === "Processed");
    expect(s.repository.list()[1].status).toBe("Failed");
  });
  it("deletes captures and files and clears pending results without resurrection", async () => {
    const s = setup();
    await s.queue.initialize();
    await s.queue.capture("Manual");
    await until(() => !!s.repository.list()[0]?.screenshot);
    const id = s.repository.list()[0].id;
    s.queue.delete(id);
    expect(existsSync(join(s.folder, id + ".png"))).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(s.repository.list()).toEqual([]);
    await s.queue.capture("Manual");
    s.queue.clear();
    await new Promise((r) => setTimeout(r, 40));
    expect(s.repository.list()).toEqual([]);
  });
  it("handles missing screenshots and rejects unsafe capture identifiers", async () => {
    const s = setup();
    await s.queue.initialize();
    s.setFail(true);
    await s.queue.capture("Manual");
    await until(() => s.repository.list()[0]?.status === "Failed");
    const id = s.repository.list()[0].id;
    rmSync(join(s.folder, id + ".png"));
    expect(() => s.queue.retry(id)).toThrow("missing");
    expect(() => s.queue.delete("../contracts.sqlite")).toThrow("CaptureId");
    expect(() => s.queue.imagePath("bad")).toThrow("CaptureId");
  });
  it("bounds pending captures and reports capture failures through distinct feedback", async () => {
    const s = setup();
    await s.queue.initialize();
    for (let i = 0; i < 12; i++)
      s.repository.put({
        id: randomUUID(),
        capturedAt: new Date().toISOString(),
        source: "Shortcut",
        status: "Captured",
        displayId: null,
        displayLabel: null,
        screenshot: null,
        width: null,
        height: null,
        bytes: 0,
        attempts: 0,
        error: null,
        result: null,
        observation: null,
      });
    await expect(s.queue.capture("Shortcut")).rejects.toThrow("full");
    expect(s.sounds).toEqual([false]);
  });
  it("reports shortcut conflicts and disables/unregisters only its own binding", () => {
    const calls: string[] = [];
    let succeeds = false;
    const controller = new CaptureShortcut(
      {
        register: () => succeeds,
        isRegistered: () => succeeds,
        unregister: (key) => calls.push(key),
      },
      () => {},
    );
    const settings = {
      enabled: true,
      accelerator: "Ctrl+Shift+F9",
      sounds: true,
      displayId: "auto",
    };
    controller.apply(settings);
    expect(controller.registered).toBe(false);
    expect(controller.error).toContain("unavailable");
    succeeds = true;
    controller.apply(settings);
    expect(controller.registered).toBe(true);
    controller.apply({ ...settings, enabled: false });
    expect(controller.registered).toBe(false);
    expect(calls).toContain("Ctrl+Shift+F9");
  });
  it("validates shortcut and display settings at the privileged boundary", () => {
    expect(() =>
      validateCaptureSettings({
        enabled: true,
        accelerator: "F9",
        sounds: true,
        displayId: "auto",
      }),
    ).toThrow();
    expect(() =>
      validateCaptureSettings({
        enabled: true,
        accelerator: "Ctrl+Shift+F9;cmd",
        sounds: true,
        displayId: "auto",
      }),
    ).toThrow();
    expect(
      validateCaptureSettings({
        enabled: false,
        accelerator: "Alt+F10",
        sounds: false,
        displayId: "auto",
      }).accelerator,
    ).toBe("Alt+F10");
  });
});

describe("schema compatibility", () => {
  it("adds OCR storage to a v1 database without changing contract rows", () => {
    const s = setup(),
      file = join(s.folder, "legacy.sqlite");
    const legacy = new CargoDatabase(file);
    legacy.db
      .prepare(
        "INSERT INTO contracts(id,mission_id,origin,payload) VALUES(?,?,?,?)",
      )
      .run(
        "existing-manual",
        null,
        "Manual",
        JSON.stringify({
          id: "existing-manual",
          name: "Preserved legacy cargo",
        }),
      );
    legacy.db.exec("DROP TABLE ocr_captures; PRAGMA user_version=1");
    legacy.close();
    const upgraded = new CargoDatabase(file);
    expect(
      upgraded.db
        .prepare("SELECT payload FROM contracts WHERE id=?")
        .get("existing-manual")?.payload,
    ).toContain("Preserved legacy cargo");
    expect(new CaptureRepository(upgraded).list()).toEqual([]);
    expect(upgraded.db.prepare("PRAGMA user_version").get()?.user_version).toBe(
      2,
    );
    upgraded.close();
  });
});
