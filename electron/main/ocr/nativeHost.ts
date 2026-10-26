import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { CaptureDisplay } from "../../../src/types/ocr";
import type { ShortcutContext } from "../../../src/types/shortcut";
export interface CapturedImage {
  context?: ShortcutContext;
  displayId: string;
  displayLabel: string;
  width: number;
  height: number;
  bytes: number;
  soundRequested: boolean;
}
export interface CaptureBackend {
  available(): { available: boolean; error: string | null };
  displays(): Promise<CaptureDisplay[]>;
  capture(
    id: string,
    displayId: string,
    sounds: boolean,
  ): Promise<CapturedImage>;
  context?(): Promise<ShortcutContext>;
  feedback(success: boolean): Promise<void>;
  close(): Promise<void>;
}
export class WindowsCaptureHost implements CaptureBackend {
  private child: ChildProcessWithoutNullStreams | null = null;
  private sequence = 0;
  private pending = new Map<
    string,
    {
      resolve: (data: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private resources: string,
    private captureDirectory: string,
  ) {}
  available() {
    const good =
      process.platform === "win32" &&
      existsSync(join(this.resources, "CargoRun.CaptureHost.exe")) &&
      existsSync(join(this.resources, "capture-success.wav")) &&
      existsSync(join(this.resources, "capture-warning.wav"));
    return {
      available: good,
      error: good
        ? null
        : "Windows capture helper unavailable. Use Windows 10/11 x64 with .NET Framework 4.8 and run npm run native:build.",
    };
  }
  private start() {
    if (this.child) return;
    const capability = this.available();
    if (!capability.available) throw Error(capability.error!);
    const child = spawn(
      join(this.resources, "CargoRun.CaptureHost.exe"),
      [
        this.captureDirectory,
        join(this.resources, "capture-success.wav"),
        join(this.resources, "capture-warning.wav"),
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    this.child = child;
    const reader = createInterface({ input: child.stdout });
    reader.on("line", (line) => {
      try {
        const result = JSON.parse(line) as {
          id: string;
          ok: boolean;
          result: unknown;
          error?: string;
          context?: ShortcutContext;
        };
        const pending = this.pending.get(result.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(result.id);
        if (result.ok) pending.resolve(result.result);
        else
          pending.reject(
            Object.assign(Error(result.error ?? "Windows capture failed."), {
              shortcutContext: result.context,
            }),
          );
      } catch {
        /* Only a bounded JSON protocol is accepted. */
      }
    });
    const fail = (message: string) => {
      if (this.child === child) this.child = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error(message));
      }
      this.pending.clear();
      reader.close();
    };
    child.on("error", (e) => fail("Capture helper failed: " + e.message));
    child.on("exit", () => fail("Capture helper exited. Retry capture."));
    child.stderr.on("data", () => {
      /* Native error responses are returned through the JSON protocol. */
    });
  }
  private request(
    op: string,
    data: Record<string, unknown> = {},
  ): Promise<unknown> {
    this.start();
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.child?.kill();
        reject(
          Error(
            "Windows capture timed out. Check that the desktop is unlocked.",
          ),
        );
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(
        JSON.stringify({ id, op, ...data }) + "\n",
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(error);
          }
        },
      );
    });
  }
  async displays() {
    return (await this.request("displays")) as CaptureDisplay[];
  }
  async capture(captureId: string, displayId: string, sounds: boolean) {
    return (await this.request("capture", {
      captureId,
      displayId,
      sounds,
      parentPid: process.pid,
    })) as CapturedImage;
  }
  async context() {
    return (await this.request("context", {
      parentPid: process.pid,
    })) as ShortcutContext;
  }
  async feedback(success: boolean) {
    await this.request("feedback", { success });
  }
  async close() {
    const child = this.child;
    this.child = null;
    if (child) {
      child.stdin.end();
      child.kill();
    }
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Capture service is shutting down."));
    }
    this.pending.clear();
  }
}
