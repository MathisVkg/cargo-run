import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CargoDatabase } from "../electron/main/storage/database";
import {
  AutomaticCapture,
  type AutoOutcome,
} from "../electron/main/ocr/automatic";
import { defaultCapturePolicy } from "../src/types/capturePolicy";
import type { MissionEvent } from "../src/types/tracking";
const dbs: CargoDatabase[] = [],
  schedulers: AutomaticCapture[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => {
  for (const s of schedulers.splice(0)) s.close();
  for (const db of dbs.splice(0)) db.close();
  vi.useRealTimers();
});
function event(n = 1): MissionEvent {
  return {
    id: "event-" + n,
    kind: "Accepted",
    missionId: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"),
    objectiveId: null,
    timestamp: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    title: "Rookie Rank - Cargo Haul",
  };
}
function setup(enabled = true) {
  const db = new CargoDatabase(":memory:");
  dbs.push(db);
  const policy = { ...defaultCapturePolicy, autoEnabled: enabled };
  const capture = vi.fn<
    (
      trigger: import("../src/types/capturePolicy").CaptureTrigger,
      valid: () => boolean,
    ) => Promise<AutoOutcome>
  >(async () => ({
    captureId: "observation",
    validation: "UsableUnassociated",
    message: "Independent unverified observation.",
  }));
  const s = new AutomaticCapture(db, () => policy, capture);
  schedulers.push(s);
  s.setMonitoring(true);
  return { s, db, policy, capture };
}
describe("bounded automatic acceptance scheduler", () => {
  it("delays one live acceptance, deduplicates its MissionId and keeps trigger association unverified", async () => {
    const x = setup();
    x.s.accept(event());
    x.s.accept({ ...event(), id: "other-notification" });
    await vi.advanceTimersByTimeAsync(2999);
    expect(x.capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(x.capture).toHaveBeenCalledTimes(1);
    expect(x.capture.mock.calls[0][0]).toMatchObject({
      candidateMissionId: event().missionId,
      association: "Unverified",
      attempt: 1,
      delaySeconds: 3,
    });
    expect(x.s.history()).toHaveLength(1);
    expect(x.s.history()[0].status).toBe("Completed");
  });
  it("serializes rapid distinct acceptances without assuming one screenshot belongs to several missions", async () => {
    const x = setup();
    let active = 0,
      max = 0;
    x.capture.mockImplementation(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 100));
      active--;
      return {
        validation: "ReviewUnassociated",
        message: "Another contract is visible; manual review.",
      };
    });
    x.s.accept(event(1));
    x.s.accept(event(2));
    x.s.accept(event(3));
    await vi.advanceTimersByTimeAsync(3500);
    expect(x.capture).toHaveBeenCalledTimes(3);
    expect(max).toBe(1);
    expect(x.s.history().every((r) => r.status === "Completed")).toBe(true);
  });
  it("supports configurable delay, rejects unrelated/non-hauling events and remains disabled by default", async () => {
    const x = setup(false);
    x.s.accept(event());
    await vi.advanceTimersByTimeAsync(10000);
    expect(x.capture).not.toHaveBeenCalled();
    expect(x.s.history()[0].status).toBe("Skipped");
    const y = setup();
    y.policy.delaySeconds = 10;
    y.s.accept({ ...event(2), title: "Rescue a pilot" });
    expect(y.s.history()).toEqual([]);
    y.s.accept(event(3));
    await vi.advanceTimersByTimeAsync(9999);
    expect(y.capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(y.capture).toHaveBeenCalledTimes(1);
  });
  it("retries invalid screens or failed capture up to the configured limit", async () => {
    const x = setup();
    x.capture.mockResolvedValue({
      validation: "Rejected",
      message: "No contract details",
    });
    x.s.accept(event());
    await vi.advanceTimersByTimeAsync(10000);
    expect(x.capture).toHaveBeenCalledTimes(3);
    expect(x.s.history()[0]).toMatchObject({ status: "Failed", attempts: 3 });
    const y = setup();
    y.capture.mockRejectedValue(Error("Window missing"));
    y.s.accept(event(2));
    await vi.advanceTimersByTimeAsync(10000);
    expect(y.capture).toHaveBeenCalledTimes(3);
    expect(y.s.history()[0].status).toBe("Failed");
  });
  it("stops retrying an unchanged screenshot", async () => {
    const x = setup();
    x.capture.mockResolvedValue({
      validation: "Duplicate",
      message: "Unchanged screen",
    });
    x.s.accept(event());
    await vi.advanceTimersByTimeAsync(10000);
    expect(x.capture).toHaveBeenCalledTimes(1);
    expect(x.s.history()[0].status).toBe("Skipped");
  });
  it("cancels pending capture when monitoring stops and does not replay it on restart", async () => {
    const x = setup();
    x.s.accept(event());
    x.s.setMonitoring(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(x.capture).not.toHaveBeenCalled();
    expect(x.s.history()[0].status).toBe("Skipped");
    const y = setup();
    y.s.accept(event(2));
    y.s.recover();
    await vi.advanceTimersByTimeAsync(5000);
    expect(y.capture).not.toHaveBeenCalled();
    expect(y.s.history()[0].status).toBe("Expired");
  });
  it("bounds pending work and records overflow and stale events", () => {
    const x = setup();
    for (let n = 1; n <= 25; n++) x.s.accept(event(n));
    expect(x.s.history().filter((r) => r.status === "Pending")).toHaveLength(
      20,
    );
    expect(x.s.history().filter((r) => r.status === "Skipped")).toHaveLength(5);
    x.s.accept({ ...event(99), timestamp: "2026-10-26T00:00:00Z" });
    expect(x.s.history()[0].status).toBe("Expired");
  });
  it("invalidates an in-flight request on stop without scheduling another retry", async () => {
    const x = setup();
    let finish: (r: AutoOutcome) => void = () => {};
    x.capture.mockImplementation(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    x.s.accept(event());
    await vi.advanceTimersByTimeAsync(3000);
    x.s.setMonitoring(false);
    finish({ validation: "Rejected", message: "Stopped" });
    await vi.advanceTimersByTimeAsync(10000);
    expect(x.capture).toHaveBeenCalledTimes(1);
    expect(x.s.history()[0].status).toBe("Skipped");
  });
});
