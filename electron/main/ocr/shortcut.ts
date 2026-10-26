import type { CaptureSettings } from "../../../src/types/ocr";
export interface ShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  isRegistered(accelerator: string): boolean;
}
export function validateCaptureSettings(input: unknown): CaptureSettings {
  if (!input || typeof input !== "object") throw Error("Invalid OCR settings.");
  const s = input as CaptureSettings;
  if (
    typeof s.enabled !== "boolean" ||
    typeof s.sounds !== "boolean" ||
    typeof s.displayId !== "string" ||
    s.displayId.length > 128 ||
    typeof s.accelerator !== "string" ||
    s.accelerator.length > 80
  )
    throw Error("Invalid OCR settings fields.");
  const parts = s.accelerator.split("+"),
    key = parts.pop() ?? "",
    modifiers = parts.map((p) => p.toLowerCase());
  if (
    parts.length < 1 ||
    parts.length > 3 ||
    !modifiers.some((p) =>
      ["ctrl", "control", "commandorcontrol", "alt"].includes(p),
    ) ||
    modifiers.some(
      (p) =>
        ![
          "ctrl",
          "control",
          "commandorcontrol",
          "alt",
          "shift",
          "super",
          "meta",
        ].includes(p),
    ) ||
    new Set(modifiers).size !== modifiers.length ||
    !/^([a-z0-9]|F(?:[1-9]|1\d|2[0-4]))$/i.test(key)
  )
    throw Error(
      "Use Ctrl or Alt plus a letter, digit or F1–F24, optionally with Shift. Example: Ctrl+Shift+F9.",
    );
  return {
    enabled: s.enabled,
    sounds: s.sounds,
    displayId: s.displayId,
    accelerator: s.accelerator,
  };
}
export class CaptureShortcut {
  private current: string | null = null;
  registered = false;
  error: string | null = null;
  constructor(
    private api: ShortcutApi,
    private capture: () => void,
  ) {}
  apply(settings: CaptureSettings) {
    this.close();
    this.error = null;
    if (!settings.enabled) return;
    try {
      const registered = this.api.register(settings.accelerator, this.capture);
      if (!registered || !this.api.isRegistered(settings.accelerator)) {
        if (registered) this.api.unregister(settings.accelerator);
        this.error =
          "Shortcut is unavailable or reserved by another application. Choose another combination or disable the shortcut.";
        return;
      }
      this.current = settings.accelerator;
      this.registered = true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
  close() {
    if (this.current) this.api.unregister(this.current);
    this.current = null;
    this.registered = false;
  }
}
