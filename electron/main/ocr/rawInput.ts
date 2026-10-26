import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import type { CaptureSettings } from "../../../src/types/ocr";
import type { InputPrototypeSnapshot } from "../../../src/types/inputPrototype";
import { normalizeShortcut } from "../../../src/utils/shortcut";
export interface InputPrototype {
  state: InputPrototypeSnapshot;
  onChange: (message: string) => void;
  onInvoke: () => void;
  configure(settings: CaptureSettings): void;
  close(): void;
  resetCounts(): void;
}
export class WindowsRawInput implements InputPrototype {
  state: InputPrototypeSnapshot;
  onChange: (message: string) => void = () => {};
  onInvoke = () => {};
  private child: ChildProcessWithoutNullStreams | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private executable: string,
    selected: InputPrototypeSnapshot["selected"],
    comparison: boolean,
  ) {
    this.state = {
      selected,
      comparison,
      status: "Disabled",
      error: null,
      rawInvocations: 0,
      electronInvocations: 0,
    };
  }
  resetCounts() {
    this.state.rawInvocations = 0;
    this.state.electronInvocations = 0;
  }
  configure(settings: CaptureSettings) {
    this.close();
    this.resetCounts();
    if (!settings.enabled) {
      this.onChange("Raw Input prototype disabled.");
      return;
    }
    if (!existsSync(this.executable)) {
      this.fail(
        "Raw Input prototype is not built. Run npm run native:raw-input.",
      );
      return;
    }
    const accelerator = normalizeShortcut(settings.accelerator);
    this.state.status = "Starting";
    this.state.error = null;
    this.onChange(
      "Raw Input helper starting; registration and delivery are unverified.",
    );
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.executable, [accelerator], {
        windowsHide: true,
        stdio: "pipe",
      });
    } catch (error) {
      this.fail("Raw Input helper could not start: " + String(error));
      return;
    }
    this.child = child;
    child.stdin.on("error", () => {});
    const reader = createInterface({ input: child.stdout });
    this.timer = setTimeout(() => {
      if (this.child === child)
        this.fail(
          "Raw Input readiness timed out. Keep Electron selected; check local executable policy without changing security settings.",
        );
    }, 5000);
    reader.on("line", (line) => {
      if (this.child !== child || line.length > 256) return;
      try {
        const event = JSON.parse(line) as { event: string; code?: number };
        if (event.event === "ready" && this.state.status === "Starting") {
          if (this.timer) clearTimeout(this.timer);
          this.timer = null;
          this.state.status = "Listening";
          this.onChange(
            "Raw Input INPUTSINK registered. Actual delivery is unverified until a configured chord is observed.",
          );
        } else if (
          event.event === "shortcut" &&
          this.state.status === "Listening"
        ) {
          this.state.rawInvocations++;
          this.onInvoke();
        } else if (event.event === "error")
          this.fail(
            "Raw Input registration failed (Windows code " +
              (Number.isInteger(event.code) ? event.code : 0) +
              ").",
          );
      } catch {
        /* No unrecognized output or input data is retained. */
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", (error) => {
      if (this.child === child)
        this.fail(
          "Raw Input helper launch failed: " +
            error.message +
            ". Electron remains available; do not bypass executable policy.",
        );
    });
    child.on("exit", () => {
      reader.close();
      if (this.child === child)
        this.fail(
          "Raw Input helper exited. No automatic backend switch was made.",
        );
    });
  }
  private fail(message: string) {
    this.close();
    this.state.status = "Error";
    this.state.error = message.slice(0, 500);
    this.onChange(this.state.error);
  }
  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const child = this.child;
    this.child = null;
    if (child) {
      child.stdin.end();
      child.kill();
    }
    this.state.status = "Disabled";
    this.state.error = null;
  }
}
