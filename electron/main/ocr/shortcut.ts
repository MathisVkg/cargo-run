import type { CaptureSettings } from "../../../src/types/ocr";
import { normalizeShortcut } from "../../../src/utils/shortcut";
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
  return {
    enabled: s.enabled,
    sounds: s.sounds,
    displayId: s.displayId,
    accelerator: normalizeShortcut(s.accelerator),
  };
}
export class CaptureShortcut {
  private current: string | null = null;
  registered = false;
  error: string | null = null;
  invocations = 0;
  constructor(
    private api: ShortcutApi,
    private capture: () => void,
  ) {}
  apply(settings: CaptureSettings) {
    this.close();
    this.error = null;
    this.invocations = 0;
    if (!settings.enabled) return;
    try {
      const accelerator = normalizeShortcut(settings.accelerator);
      const registered = this.api.register(accelerator, () => {
        if (this.current !== accelerator || !this.registered) return;
        this.invocations++;
        this.capture();
      });
      if (!registered || !this.api.isRegistered(accelerator)) {
        if (registered) this.api.unregister(accelerator);
        this.error =
          "Shortcut registration failed: the binding is unavailable and may be reserved or owned by another application. Try F8 or Ctrl+Shift+F9; registration alone does not prove game-focused delivery.";
        return;
      }
      this.current = accelerator;
      this.registered = true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
  resetInvocations() {
    this.invocations = 0;
  }
  close() {
    if (this.current) this.api.unregister(this.current);
    this.current = null;
    this.registered = false;
  }
}
