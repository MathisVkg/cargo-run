import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), exists: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", () => ({ existsSync: mocks.exists }));
import { WindowsRawInput } from "../electron/main/ocr/rawInput";
function child() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });
}
const settings = {
  enabled: true,
  accelerator: "F8",
  displayId: "auto",
  sounds: false,
};
describe("optional Raw Input host lifecycle and bounded protocol", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.exists.mockReturnValue(true);
  });
  afterEach(() => vi.useRealTimers());
  it("does not claim listening before a native ready acknowledgement or count readiness as invocation", () => {
    const c = child();
    mocks.spawn.mockReturnValue(c);
    const h = new WindowsRawInput("helper.exe", "RawInput", true);
    h.configure(settings);
    expect(h.state.status).toBe("Starting");
    expect(h.state.rawInvocations).toBe(0);
    c.stdout.write('{"event":"ready"}\n');
    expect(h.state.status).toBe("Listening");
    expect(h.state.rawInvocations).toBe(0);
    c.stdout.write('{"event":"shortcut"}\n');
    expect(h.state.rawInvocations).toBe(1);
    h.close();
  });
  it("drops stale process callbacks after reconfiguration and rejects arbitrary event payloads", () => {
    const old = child(),
      next = child();
    mocks.spawn.mockReturnValueOnce(old).mockReturnValueOnce(next);
    const h = new WindowsRawInput("helper.exe", "Electron", true);
    h.configure(settings);
    h.configure({ ...settings, accelerator: "Ctrl+Shift+S" });
    old.stdout.write('{"event":"ready"}\n{"event":"shortcut"}\n');
    expect(h.state.status).toBe("Starting");
    expect(h.state.rawInvocations).toBe(0);
    next.stdout.write('{"event":"ready"}\n{"event":"key","text":"private"}\n');
    expect(h.state.rawInvocations).toBe(0);
    h.close();
  });
  it("fails visibly on executable policy/launch error and makes no automatic backend switch", () => {
    const c = child();
    mocks.spawn.mockReturnValue(c);
    const h = new WindowsRawInput("helper.exe", "RawInput", false);
    h.configure(settings);
    c.emit("error", new Error("spawn UNKNOWN"));
    expect(h.state.status).toBe("Error");
    expect(h.state.error).toMatch(/launch failed/);
    expect(h.state.selected).toBe("RawInput");
    expect(c.kill).toHaveBeenCalled();
  });
  it("bounds readiness timeout and stops the helper", () => {
    const c = child();
    mocks.spawn.mockReturnValue(c);
    const h = new WindowsRawInput("helper.exe", "RawInput", false);
    h.configure(settings);
    vi.advanceTimersByTime(5001);
    expect(h.state.status).toBe("Error");
    expect(c.kill).toHaveBeenCalled();
  });
  it("never starts a disabled or unavailable helper", () => {
    const h = new WindowsRawInput("helper.exe", "Electron", false);
    mocks.spawn.mockClear();
    h.configure({ ...settings, enabled: false });
    expect(mocks.spawn).not.toHaveBeenCalled();
    mocks.exists.mockReturnValue(false);
    h.configure(settings);
    expect(h.state.status).toBe("Error");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
