import type { InputPrototype } from "./rawInput";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  unlinkSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { CaptureBackend } from "./nativeHost";
import type { OcrProvider } from "./provider";
import { CaptureRepository } from "./repository";
import {
  CaptureShortcut,
  validateCaptureSettings,
  type ShortcutApi,
} from "./shortcut";
import { extractContract } from "./parser";
import type {
  CaptureRecord,
  OcrSnapshot,
  OcrResult,
} from "../../../src/types/ocr";
export interface ImageLoader {
  (path: string): Promise<{ image: Buffer; width: number; height: number }>;
}
import type {
  ShortcutContext,
  ShortcutDiagnostics,
  ShortcutStage,
} from "../../../src/types/shortcut";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OcrQueue {
  readonly shortcut: CaptureShortcut;
  private settings;
  private revision = 0;
  private displayList: OcrSnapshot["displays"] = [];
  private lastCapture: OcrSnapshot["lastCapture"] = null;
  private nativeError: string | null = null;
  private captureTail: Promise<void> = Promise.resolve();
  private processor: Promise<void> | null = null;
  private closing = false;
  private recording = false;
  private recordingLease: ReturnType<typeof setTimeout> | null = null;
  private shortcutDiagnostics: ShortcutDiagnostics;
  onChange: (state: OcrSnapshot) => void = () => {};
  constructor(
    private repository: CaptureRepository,
    private backend: CaptureBackend,
    private provider: OcrProvider,
    api: ShortcutApi,
    readonly directory: string,
    private loadImage: ImageLoader,
    private inputPrototype?: InputPrototype,
  ) {
    mkdirSync(directory, { recursive: true });
    this.settings = repository.settings();
    this.shortcutDiagnostics = repository.diagnostics();
    this.shortcut = new CaptureShortcut(api, () => {
      if (this.recording || this.closing) return;
      if (this.inputPrototype) {
        this.inputPrototype.state.electronInvocations++;
        this.recordDiagnostic(
          "BackendInvocation",
          "Electron callback observed (capture backend: " +
            this.inputPrototype.state.selected +
            ").",
        );
        if (this.inputPrototype.state.selected !== "Electron") {
          this.publish();
          return;
        }
      }
      this.invokeCapture();
    });
    if (this.inputPrototype) {
      this.inputPrototype.onChange = (message) => {
        this.recordDiagnostic("Registration", message);
        this.publish();
      };
      this.inputPrototype.onInvoke = () => {
        if (this.recording || this.closing) return;
        this.recordDiagnostic(
          "BackendInvocation",
          "Raw Input configured chord observed (capture backend: " +
            this.inputPrototype!.state.selected +
            ").",
        );
        if (this.inputPrototype!.state.selected === "RawInput")
          this.invokeCapture("RawInput");
        else this.publish();
      };
    }
  }
  private invokeCapture(backend: "Electron" | "RawInput" = "Electron") {
    this.shortcutDiagnostics.totalInvocations++;
    this.shortcutDiagnostics.lastInvocationAt = new Date().toISOString();
    this.recordDiagnostic(
      "Invocation",
      backend + " delivered the configured shortcut invocation.",
      null,
      null,
      "Shortcut",
    );
    this.publish();
    void this.capture("Shortcut").catch(() => {});
  }
  snapshot(): OcrSnapshot {
    const captures = this.repository.list();
    return {
      revision: this.revision,
      recording: this.recording,
      inputPrototype: this.inputPrototype
        ? { ...this.inputPrototype.state }
        : undefined,
      shortcutInvocations:
        this.inputPrototype?.state.selected === "RawInput"
          ? this.inputPrototype.state.rawInvocations
          : this.shortcut.invocations,
      shortcutDiagnostics: this.shortcutDiagnostics,
      settings: this.settings,
      registered:
        this.inputPrototype?.state.selected === "RawInput"
          ? this.inputPrototype.state.status === "Listening"
          : this.shortcut.registered,
      shortcutError:
        this.inputPrototype?.state.selected === "RawInput"
          ? this.inputPrototype.state.error
          : this.shortcut.error,
      engine: { name: this.provider.name, ...this.provider.available() },
      captureAvailable: this.backend.available().available,
      captureError: this.nativeError ?? this.backend.available().error,
      storagePath: this.directory,
      displays: this.displayList,
      captures,
      queued: captures.filter((c) => c.status === "Captured").length,
      processing: captures.some((c) => c.status === "Processing"),
      lastCapture: this.lastCapture,
      limit: 50,
    };
  }
  private publish() {
    if (this.closing) return this.snapshot();
    this.revision++;
    const state = this.snapshot();
    this.onChange(state);
    return state;
  }
  async initialize() {
    const records = this.repository.list();
    for (const record of records)
      if (record.status === "Processing" || record.status === "Captured") {
        const ready = record.screenshot && existsSync(this.file(record.id));
        this.repository.put({
          ...record,
          status: ready ? "Captured" : "Failed",
          error: ready
            ? "Processing interrupted by application exit; resumed."
            : "Capture interrupted before a screenshot was saved. Capture this screen again.",
        });
      }
    const known = new Set(
      this.repository
        .list()
        .filter((r) => r.screenshot)
        .map((r) => r.id),
    );
    for (const name of readdirSync(this.directory)) {
      const match = /^([0-9a-f-]{36})(?:\.thumb)?\.png(?:\.tmp)?$/i.exec(name);
      if (
        match &&
        uuid.test(match[1]) &&
        (!known.has(match[1]) || name.endsWith(".tmp"))
      )
        try {
          unlinkSync(join(this.directory, name));
        } catch {
          /* Never remove files outside the owned capture directory. */
        }
    }
    await this.refreshDisplays();
    this.registerShortcut();
    this.publish();
    this.kick();
  }
  async refreshDisplays() {
    try {
      this.displayList = await this.backend.displays();
      this.nativeError = null;
    } catch (error) {
      this.nativeError = error instanceof Error ? error.message : String(error);
    }
    return this.publish();
  }
  configure(input: unknown) {
    const next = validateCaptureSettings(input);
    if (
      next.displayId !== "auto" &&
      !this.displayList.some((d) => d.id === next.displayId)
    )
      throw Error(
        "Select a connected display or automatic Star Citizen targeting.",
      );
    this.repository.saveSettings(next);
    this.settings = next;
    this.releaseRecording();
    this.registerShortcut();
    return this.publish();
  }
  async capture(source: "Shortcut" | "Manual"): Promise<OcrSnapshot> {
    if (this.closing) throw Error("Capture service is shutting down.");
    if (this.recording)
      throw Error("Finish or cancel shortcut recording before capturing.");
    const records = this.repository.list();
    const reject = async (message: string) => {
      this.lastCapture = {
        at: new Date().toISOString(),
        success: false,
        message,
      };
      this.recordDiagnostic("CaptureError", message, null, null, source);
      this.publish();
      if (this.settings.sounds)
        await this.backend.feedback(false).catch(() => {});
      throw Error(message);
    };
    if (!this.backend.available().available)
      return reject(this.backend.available().error!);
    if (records.length >= 50)
      return reject(
        "Capture storage limit reached (50). Delete or clear captures before scanning more.",
      );
    if (
      records.filter(
        (c) => c.status === "Captured" || c.status === "Processing",
      ).length >= 12
    )
      return reject(
        "OCR queue is full (12 pending). Wait for processing or clear captures.",
      );
    const ownedFiles = readdirSync(this.directory).filter((n) =>
      /^[0-9a-f-]{36}(?:\.thumb)?\.png(?:\.tmp)?$/i.test(n),
    );
    const diskBytes = ownedFiles.reduce((n, file) => {
      try {
        return n + statSync(join(this.directory, file)).size;
      } catch {
        return n;
      }
    }, 0);
    const reserved = records.filter(
      (c) => c.status === "Captured" && !c.screenshot,
    ).length;
    if (diskBytes + (reserved + 1) * 32 * 1024 * 1024 > 512 * 1024 * 1024)
      return reject(
        "Screenshot storage is near its 512 MiB limit. Delete captures before continuing.",
      );
    const id = randomUUID(),
      settings = { ...this.settings };
    const record: CaptureRecord = {
      id,
      capturedAt: new Date().toISOString(),
      source,
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
    };
    this.repository.put(record);
    this.recordDiagnostic(
      "CaptureRequested",
      "Screenshot request accepted into the capture queue.",
      id,
      null,
      source,
    );
    this.publish();
    this.captureTail = this.captureTail.then(async () => {
      if (this.closing || !this.repository.get(id)) return;
      try {
        const image = await this.backend.capture(id, settings.displayId, false);
        const current = this.repository.get(id);
        if (!current) {
          this.removeFiles(id);
          return;
        }
        this.repository.put({
          ...current,
          displayId: image.displayId,
          displayLabel: image.displayLabel,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          status: "Captured",
          error: null,
          screenshot: id + ".png",
        });
        this.lastCapture = {
          at: current.capturedAt,
          success: true,
          message: "Screenshot saved and queued. OCR recognition is separate.",
        };
        this.nativeError = null;
        this.recordDiagnostic(
          "CaptureSaved",
          "Screenshot saved; this is independent from OCR recognition.",
          id,
          image.context ?? null,
          source,
        );
        this.publish();
        if (settings.sounds) await this.backend.feedback(true).catch(() => {});
        this.kick();
      } catch (error) {
        if (!this.repository.get(id)) return;
        const message = error instanceof Error ? error.message : String(error);
        this.repository.put({
          ...this.repository.get(id)!,
          status: "Failed",
          error: message,
        });
        this.lastCapture = { at: record.capturedAt, success: false, message };
        this.nativeError = message;
        const context =
          error && typeof error === "object" && "shortcutContext" in error
            ? ((error as { shortcutContext?: ShortcutContext })
                .shortcutContext ?? null)
            : null;
        this.recordDiagnostic("CaptureError", message, id, context, source);
        this.publish();
        if (settings.sounds && !this.closing)
          await this.backend.feedback(false).catch(() => {});
      }
    });
    return this.snapshot();
  }
  private recordDiagnostic(
    stage: ShortcutStage,
    message: string,
    captureId: string | null = null,
    context: ShortcutContext | null = null,
    source: "Shortcut" | "Manual" | null = null,
  ) {
    if (this.closing) return;
    if (context) this.shortcutDiagnostics.context = context;
    this.shortcutDiagnostics.events = [
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        stage,
        accelerator: this.settings.accelerator,
        source,
        captureId,
        message,
        context,
      },
      ...this.shortcutDiagnostics.events,
    ].slice(0, 50);
    this.repository.saveDiagnostics(this.shortcutDiagnostics);
  }
  private registerShortcut() {
    const prototype = this.inputPrototype;
    this.shortcut.apply({
      ...this.settings,
      enabled:
        this.settings.enabled &&
        (!prototype ||
          prototype.state.selected === "Electron" ||
          prototype.state.comparison),
    });
    if (prototype)
      prototype.configure({
        ...this.settings,
        enabled:
          this.settings.enabled &&
          (prototype.state.selected === "RawInput" ||
            prototype.state.comparison),
      });
    this.recordDiagnostic(
      "Registration",
      this.inputPrototype?.state.selected === "RawInput" &&
        !this.inputPrototype.state.comparison
        ? "Electron backend inactive because Raw Input is explicitly selected. See prototype readiness and invocation counters."
        : this.settings.enabled
          ? this.shortcut.registered
            ? "Registered with Windows through Electron. Callback delivery has not yet been observed for this registration."
            : (this.shortcut.error ?? "Registration failed.")
          : "Global capture shortcut disabled.",
    );
  }
  beginShortcutRecording() {
    if (this.closing) throw Error("Application is shutting down.");
    this.releaseRecording();
    this.recording = true;
    this.shortcut.close();
    this.inputPrototype?.close();
    this.recordDiagnostic(
      "Recording",
      "Shortcut released while recording; capture is suppressed.",
    );
    this.recordingLease = setTimeout(() => {
      if (!this.closing) this.endShortcutRecording();
    }, 45000);
    return this.publish();
  }
  private releaseRecording() {
    if (this.recordingLease) clearTimeout(this.recordingLease);
    this.recordingLease = null;
    this.recording = false;
  }
  endShortcutRecording() {
    if (!this.recording) return this.snapshot();
    this.releaseRecording();
    if (!this.closing) {
      this.registerShortcut();
      this.recordDiagnostic(
        "Recording",
        "Recording ended; saved shortcut restored.",
      );
    }
    return this.publish();
  }
  async probeShortcut() {
    if (this.closing) throw Error("Application is shutting down.");
    try {
      const context = this.backend.context
        ? await this.backend.context()
        : null;
      this.recordDiagnostic(
        "Environment",
        context
          ? "Read-only Windows foreground/process elevation metadata collected."
          : "This capture backend does not expose environment diagnostics.",
        null,
        context,
      );
    } catch (error) {
      this.recordDiagnostic(
        "Environment",
        "Windows metadata query failed: " + String(error),
      );
    }
    return this.publish();
  }
  resetShortcutDiagnostics() {
    this.shortcutDiagnostics = {
      totalInvocations: 0,
      lastInvocationAt: null,
      context: null,
      events: [],
    };
    this.shortcut.resetInvocations();
    this.inputPrototype?.resetCounts();
    this.recordDiagnostic(
      "Registration",
      "Diagnostics reset. Registration remains " +
        (this.snapshot().registered ? "registered/listening" : "inactive") +
        "; now test the binding in the intended foreground application.",
    );
    return this.publish();
  }
  reparse(id: unknown) {
    const record = this.record(id);
    if (!record.result)
      throw Error("No saved OCR text exists for this capture.");
    this.repository.put({
      ...record,
      observation: extractContract(record.result, record.id, record.capturedAt),
    });
    return this.publish();
  }
  private kick() {
    if (this.processor || this.closing) return;
    this.processor = this.process().finally(() => {
      this.processor = null;
      if (
        !this.closing &&
        this.repository
          .list()
          .some((c) => c.status === "Captured" && c.screenshot)
      )
        this.kick();
    });
  }
  private async process() {
    for (;;) {
      if (this.closing) return;
      // Do not process a later capture while an earlier screenshot is still being saved.
      const next = this.repository.list().find((c) => c.status === "Captured");
      if (!next || !next.screenshot) return;
      this.repository.put({
        ...next,
        status: "Processing",
        attempts: next.attempts + 1,
        error: null,
      });
      this.publish();
      try {
        const { image, width, height } = await this.loadImage(
          this.file(next.id),
        );
        const result = await this.provider.recognize(image, width, height);
        if (this.closing) return;
        if (!this.repository.get(next.id)) continue;
        const bounded: OcrResult = {
          ...result,
          text: result.text.slice(0, 262144),
          lines: result.lines.slice(0, 3000),
        };
        const observation = extractContract(bounded, next.id, next.capturedAt);
        if (result.text.length > 262144 || result.lines.length > 3000)
          observation.warnings.push(
            "OCR diagnostics were truncated at the configured size limit.",
          );
        if (!bounded.text.trim())
          observation.warnings.push(
            "The screenshot contained no recognizable text. This does not mean capture failed.",
          );
        this.repository.put({
          ...this.repository.get(next.id)!,
          status: "Processed",
          result: bounded,
          observation,
          error: null,
        });
      } catch (error) {
        if (this.closing) return;
        const current = this.repository.get(next.id);
        if (current)
          this.repository.put({
            ...current,
            status: "Failed",
            error: error instanceof Error ? error.message : String(error),
          });
      }
      this.publish();
    }
  }
  retry(id: unknown) {
    const record = this.record(id);
    if (record.status !== "Failed")
      throw Error("Only failed OCR captures can be retried.");
    if (!record.screenshot || !existsSync(this.file(record.id)))
      throw Error("Screenshot is missing; take a new capture.");
    if (
      this.repository
        .list()
        .filter((c) => c.status === "Captured" || c.status === "Processing")
        .length >= 12
    )
      throw Error("Queue is full. Wait before retrying.");
    this.repository.put({
      ...record,
      status: "Captured",
      error: null,
      result: null,
      observation: null,
    });
    this.publish();
    this.kick();
    return this.snapshot();
  }
  delete(id: unknown) {
    const record = this.record(id);
    this.repository.remove(record.id);
    this.removeFiles(record.id);
    return this.publish();
  }
  clear() {
    const records = this.repository.list();
    this.repository.clear();
    for (const c of records) this.removeFiles(c.id);
    return this.publish();
  }
  private record(id: unknown) {
    if (typeof id !== "string" || !uuid.test(id))
      throw Error("Invalid CaptureId.");
    const record = this.repository.get(id);
    if (!record) throw Error("Capture was not found.");
    return record;
  }
  file(id: unknown, thumbnail = false): string {
    if (typeof id !== "string" || !uuid.test(id))
      throw Error("Invalid CaptureId.");
    return join(this.directory, id + (thumbnail ? ".thumb.png" : ".png"));
  }
  imagePath(id: unknown, thumbnail = false): string | null {
    const record = this.record(id);
    if (!record.screenshot) return null;
    const file = this.file(record.id, thumbnail);
    return existsSync(file) ? file : null;
  }
  private removeFiles(id: string) {
    for (const file of [
      this.file(id),
      this.file(id, true),
      this.file(id) + ".tmp",
    ])
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch (error) {
        this.nativeError =
          "Could not delete a screenshot file: " + String(error);
      }
  }
  async close() {
    this.closing = true;
    this.releaseRecording();
    this.shortcut.close();
    this.inputPrototype?.close();
    await this.backend.close();
    await this.provider.close();
    await this.captureTail.catch(() => {});
    if (this.processor) await this.processor.catch(() => {});
  }
}
