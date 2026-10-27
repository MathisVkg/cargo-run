import { writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CaptureBackend, CapturedImage } from "./nativeHost";
import type { CaptureMode } from "../../../src/types/capturePolicy";
export interface GameWindow {
  handle: string;
  pid: number;
  width: number;
  height: number;
  foreground: boolean;
  process: string;
}
export interface WindowImage {
  isEmpty(): boolean;
  getSize(scaleFactor?: number): { width: number; height: number };
  toBitmap(options?: { scaleFactor: number }): Buffer;
  toPNG(options?: { scaleFactor: number }): Buffer;
  resize(size: { width: number }): WindowImage;
}
export interface WindowSource {
  id: string;
  thumbnail: WindowImage;
}
export interface WindowApi {
  windows(): Promise<GameWindow[]>;
  sources(size: { width: number; height: number }): Promise<WindowSource[]>;
}
export function selectGameWindow(windows: GameWindow[]): GameWindow {
  const games = windows.filter(
    (w) =>
      w.process.toLowerCase() === "starcitizen.exe" &&
      w.width >= 640 &&
      w.height >= 360 &&
      w.width * w.height <= 33177600,
  );
  const focused = games.filter((w) => w.foreground);
  if (focused.length === 1) return focused[0];
  if (games.length !== 1)
    throw Error(
      games.length
        ? "Several Star Citizen render windows are visible. Focus the intended game window."
        : "Star Citizen render window unavailable, minimized or too small.",
    );
  return games[0];
}
export function validateWindowImage(image: WindowImage, target: GameWindow) {
  const { width, height } = image.getSize(1);
  if (
    image.isEmpty() ||
    width < 640 ||
    height < 360 ||
    width * height > 33177600
  )
    throw Error(
      "Window capture is empty or too small for contract recognition.",
    );
  if (width < target.width * 0.85 || height < target.height * 0.85)
    throw Error(
      "Window capture returned a reduced-resolution thumbnail (" +
        width +
        " × " +
        height +
        "); no upscaling or display substitution was performed.",
    );
  const pixels = image.toBitmap({ scaleFactor: 1 });
  let lit = 0,
    count = 0,
    min = 255,
    max = 0;
  const stride = Math.max(1, Math.floor((width * height) / 4096)) * 4;
  for (let i = 0; i + 2 < pixels.length; i += stride) {
    const value = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (value > 12) lit++;
    min = Math.min(min, value);
    max = Math.max(max, value);
    count++;
  }
  if (!count || lit / count < 0.01 || max - min < 8)
    throw Error(
      "Window capture returned a black or blank frame. Try borderless mode or explicitly select Full Display.",
    );
  return { width, height };
}
export class WindowCaptureBackend implements CaptureBackend {
  private closed = false;
  private enumerating: Promise<WindowSource[]> | null = null;
  private async sources(size: { width: number; height: number }) {
    if (this.enumerating)
      throw Error(
        "A previous window-source query is still pending; no overlapping query was started.",
      );
    const operation = this.api.sources(size);
    this.enumerating = operation;
    void operation.then(
      () => {
        if (this.enumerating === operation) this.enumerating = null;
      },
      () => {
        if (this.enumerating === operation) this.enumerating = null;
      },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(Error("Window-source query timed out after 10 seconds.")),
            10000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  constructor(
    private display: CaptureBackend,
    private api: WindowApi,
    private directory: string,
  ) {}
  available() {
    return this.display.available();
  }
  displays() {
    return this.display.displays();
  }
  context() {
    return (
      this.display.context?.() ??
      Promise.reject(Error("Window environment metadata unavailable."))
    );
  }
  feedback(success: boolean) {
    return this.display.feedback(success);
  }
  close() {
    this.closed = true;
    return this.display.close();
  }
  async capture(
    id: string,
    displayId: string,
    sounds: boolean,
    options?: { mode: CaptureMode; allowDisplayFallback: boolean },
  ): Promise<CapturedImage> {
    if (this.closed) throw Error("Capture service is shutting down.");
    const mode = options?.mode ?? "Display";
    if (mode === "Display")
      return {
        ...(await this.display.capture(id, displayId, sounds)),
        backend: "Display",
        fallback: false,
      };
    let failure: string;
    try {
      const target = selectGameWindow(await this.api.windows());
      if (this.closed) throw Error("Capture service is shutting down.");
      const sources = await this.sources({
        width: target.width,
        height: target.height,
      });
      if (this.closed) throw Error("Capture service is shutting down.");
      const matches = sources.filter((s) => {
        const m = /^window:(\d+):0$/.exec(s.id);
        return m && BigInt(m[1]) === BigInt(target.handle);
      });
      if (matches.length !== 1)
        throw Error(
          "The verified Star Citizen window has no unique capturable surface.",
        );
      // Recheck HWND/process after asynchronous enumeration to avoid stale/reused handles.
      const current = (await this.api.windows()).find(
        (w) =>
          w.handle === target.handle &&
          w.pid === target.pid &&
          w.process.toLowerCase() === "starcitizen.exe",
      );
      if (!current)
        throw Error(
          "Star Citizen window changed while capture was being prepared.",
        );
      const image = matches[0].thumbnail,
        { width, height } = validateWindowImage(image, current),
        png = image.toPNG({ scaleFactor: 1 });
      if (png.length > 33554432)
        throw Error("Window screenshot exceeds 32 MiB.");
      const file = join(this.directory, id + ".png"),
        tmp = file + ".tmp",
        thumb = join(this.directory, id + ".thumb.png");
      try {
        writeFileSync(tmp, png);
        renameSync(tmp, file);
        writeFileSync(
          thumb,
          image.resize({ width: Math.min(400, width) }).toPNG(),
        );
      } catch (error) {
        for (const p of [tmp, file, thumb])
          if (existsSync(p))
            try {
              unlinkSync(p);
            } catch {
              /* queue reports storage failure */
            }
        throw error;
      }
      return {
        displayId: "window:" + target.handle,
        displayLabel: "Star Citizen window",
        width,
        height,
        bytes: png.length,
        soundRequested: sounds,
        backend: "Window",
        fallback: false,
        context: await this.context().catch(() => undefined),
      };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (this.closed) throw Error("Capture service is shutting down.");
    if (mode !== "Automatic" || !options?.allowDisplayFallback)
      throw Error(
        "Star Citizen Window: " +
          failure +
          " Display fallback is not enabled for this request.",
      );
    try {
      const result = await this.display.capture(id, displayId, sounds);
      return {
        ...result,
        backend: "Display",
        fallback: true,
        fallbackReason: failure,
      };
    } catch (error) {
      throw Object.assign(
        Error(
          "Star Citizen window failed: " +
            failure +
            " Full-display fallback also failed: " +
            (error instanceof Error ? error.message : String(error)),
        ),
        {
          captureBackend: "Display",
          fallback: true,
          fallbackReason: failure,
          shortcutContext:
            error && typeof error === "object" && "shortcutContext" in error
              ? error.shortcutContext
              : undefined,
        },
      );
    }
  }
}
