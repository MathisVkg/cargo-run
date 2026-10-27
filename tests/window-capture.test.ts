import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  WindowCaptureBackend,
  selectGameWindow,
  validateWindowImage,
  type WindowImage,
  type GameWindow,
} from "../electron/main/ocr/windowCapture";
const folders: string[] = [];
afterEach(() => {
  for (const f of folders.splice(0)) {
    if (!resolve(f).startsWith(resolve("work") + sep))
      throw Error("Unsafe test cleanup");
    rmSync(f, { recursive: true, force: true });
  }
});
const target: GameWindow = {
  handle: "47",
  pid: 42,
  width: 1920,
  height: 1080,
  foreground: false,
  process: "StarCitizen.exe",
};
function image(width = 1920, height = 1080, black = false): WindowImage {
  const pixels = Buffer.alloc(width * height * 4);
  if (!black) for (let i = 0; i < pixels.length; i++) pixels[i] = i % 251;
  return {
    isEmpty: () => !width,
    getSize: () => ({ width, height }),
    toBitmap: () => pixels,
    toPNG: () => Buffer.from("test-png"),
    resize() {
      return this;
    },
  };
}
function setup(windows = [target], img = image()) {
  mkdirSync("work", { recursive: true });
  const dir = mkdtempSync(join(resolve("work"), "window-unit-"));
  folders.push(dir);
  const display = {
    available: () => ({ available: true, error: null }),
    displays: async () => [],
    capture: vi.fn(async () => ({
      displayId: "display",
      displayLabel: "Display",
      width: 3840,
      height: 2160,
      bytes: 100,
      soundRequested: false,
    })),
    feedback: async () => {},
    close: async () => {},
  };
  const api = {
    windows: vi.fn(async () => windows),
    sources: vi.fn(async () => [{ id: "window:47:0", thumbnail: img }]),
  };
  return {
    backend: new WindowCaptureBackend(display, api, dir),
    display,
    api,
    dir,
  };
}
describe("verified window capture and explicit fallback", () => {
  it("captures a matching HWND without display substitution and records actual dimensions", async () => {
    const s = setup();
    const r = await s.backend.capture("sample", "auto", false, {
      mode: "Window",
      allowDisplayFallback: false,
    });
    expect(r).toMatchObject({
      backend: "Window",
      fallback: false,
      width: 1920,
      height: 1080,
    });
    expect(s.display.capture).not.toHaveBeenCalled();
    expect(existsSync(join(s.dir, "sample.png"))).toBe(true);
  });
  it("supports actual 4K output without upscaling", () =>
    expect(
      validateWindowImage(image(3840, 2160), {
        ...target,
        width: 3840,
        height: 2160,
      }),
    ).toEqual({ width: 3840, height: 2160 }));
  it("rejects unavailable and incorrect processes, regardless of window titles", () => {
    expect(() => selectGameWindow([])).toThrow("unavailable");
    expect(() =>
      selectGameWindow([{ ...target, process: "RSI Launcher.exe" }]),
    ).toThrow("unavailable");
  });
  it("rejects ambiguous windows but selects a unique foreground game surface", () => {
    expect(() =>
      selectGameWindow([target, { ...target, handle: "48" }]),
    ).toThrow("Several");
    expect(
      selectGameWindow([target, { ...target, handle: "48", foreground: true }])
        .handle,
    ).toBe("48");
  });
  it("rejects a wrong Electron source or a reused HWND", async () => {
    const s = setup();
    s.api.sources.mockResolvedValue([
      { id: "window:99:0", thumbnail: image() },
    ]);
    await expect(
      s.backend.capture("sample", "auto", false, {
        mode: "Window",
        allowDisplayFallback: false,
      }),
    ).rejects.toThrow("no unique");
    s.api.sources.mockResolvedValue([
      { id: "window:47:0", thumbnail: image() },
    ]);
    s.api.windows
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce([{ ...target, pid: 100 }]);
    await expect(
      s.backend.capture("sample", "auto", false, {
        mode: "Window",
        allowDisplayFallback: false,
      }),
    ).rejects.toThrow("changed");
  });
  it("rejects empty, black and low resolution thumbnails", () => {
    expect(() => validateWindowImage(image(0, 0), target)).toThrow("empty");
    expect(() => validateWindowImage(image(1920, 1080, true), target)).toThrow(
      "black",
    );
    expect(() =>
      validateWindowImage(image(), { ...target, width: 3840, height: 2160 }),
    ).toThrow("reduced-resolution");
  });
  it("falls back only in Automatic mode with explicit permission and records why", async () => {
    const s = setup([]);
    await expect(
      s.backend.capture("sample", "display", false, {
        mode: "Automatic",
        allowDisplayFallback: false,
      }),
    ).rejects.toThrow("fallback is not enabled");
    await expect(
      s.backend.capture("sample", "display", false, {
        mode: "Window",
        allowDisplayFallback: true,
      }),
    ).rejects.toThrow();
    expect(s.display.capture).not.toHaveBeenCalled();
    const r = await s.backend.capture("sample", "display", false, {
      mode: "Automatic",
      allowDisplayFallback: true,
    });
    expect(r).toMatchObject({
      backend: "Display",
      fallback: true,
      width: 3840,
    });
    expect(r.fallbackReason).toContain("unavailable");
  });
  it("preserves the existing explicit display backend", async () => {
    const s = setup();
    await s.backend.capture("sample", "chosen-display", false, {
      mode: "Display",
      allowDisplayFallback: true,
    });
    expect(s.display.capture).toHaveBeenCalledWith(
      "sample",
      "chosen-display",
      false,
    );
    expect(s.api.windows).not.toHaveBeenCalled();
  });
});

describe("window capture self-exclusion and shutdown", () => {
  it("excludes the current Cargo Run process even if an internal source number matches", async () => {
    const s = setup();
    s.api.sources.mockResolvedValue([
      { id: "window:47:1", thumbnail: image() },
    ]);
    await expect(
      s.backend.capture("sample", "auto", false, {
        mode: "Window",
        allowDisplayFallback: false,
      }),
    ).rejects.toThrow("no unique");
  });
  it("cannot capture or fall back after shutdown", async () => {
    const s = setup();
    await s.backend.close();
    await expect(
      s.backend.capture("sample", "auto", false, {
        mode: "Automatic",
        allowDisplayFallback: true,
      }),
    ).rejects.toThrow("shutting down");
    expect(s.display.capture).not.toHaveBeenCalled();
  });
});

it("reports both the window failure and an explicit display-fallback failure", async () => {
  const s = setup([]);
  s.display.capture.mockRejectedValue(Error("Display disconnected"));
  try {
    await s.backend.capture("sample", "missing", false, {
      mode: "Automatic",
      allowDisplayFallback: true,
    });
    throw Error("Expected failure");
  } catch (error) {
    expect(String(error)).toContain("window unavailable");
    expect(String(error)).toContain("Display disconnected");
    expect(error).toHaveProperty("fallback", true);
  }
});

it("bounds a stalled window query and refuses to stack another one",async()=>{
 vi.useFakeTimers();try{
  const s=setup();s.api.sources.mockImplementation(()=>new Promise(()=>{}));
  const pending=expect(s.backend.capture("sample","auto",false,{mode:"Window",allowDisplayFallback:false})).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10001);await pending;
  await expect(s.backend.capture("sample","auto",false,{mode:"Window",allowDisplayFallback:false})).rejects.toThrow("still pending");
  expect(s.api.sources).toHaveBeenCalledTimes(1);await s.backend.close();
 }finally{vi.useRealTimers();}
});
