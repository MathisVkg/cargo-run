import type { InputPrototype } from "./rawInput";
import { randomUUID, createHash } from "node:crypto";
import {
  defaultCapturePolicy,
  validatePolicy,
  type CapturePolicy,
  type CaptureTrigger,
  type CaptureMode,
} from "../../../src/types/capturePolicy";
import { AutomaticCapture, type AutoOutcome } from "./automatic";
import { CaptureRetention, expiration } from "./retention";
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
  readonly automatic: AutomaticCapture;
  private policy: CapturePolicy;
  private retention: CaptureRetention;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private settleWaiters = new Map<
    string,
    (record: CaptureRecord | null) => void
  >();
  private captureGuards = new Map<string, () => boolean>();
  private shortcutQuietTimer: ReturnType<typeof setTimeout> | null = null;
  private shortcutLatched = false;
  private shortcutRepeatBurst = 0;
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
    this.policy = validatePolicy({
      ...defaultCapturePolicy,
      ...repository.database.getSetting<Partial<CapturePolicy>>("ocr.policy"),
    });
    this.retention = new CaptureRetention(repository, directory);
    this.automatic = new AutomaticCapture(
      repository.database,
      () => this.policy,
      (trigger, valid) => this.captureAutomatic(trigger, valid),
    );
    this.automatic.onChange = () => this.publish();
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
    if (backend === "Electron") {
      if (this.shortcutQuietTimer) clearTimeout(this.shortcutQuietTimer);
      this.shortcutQuietTimer = setTimeout(() => {
        this.shortcutLatched = false;
        if (this.shortcutRepeatBurst) {
          this.recordDiagnostic(
            "RepeatSuppressed",
            this.shortcutRepeatBurst +
              " repeated shortcut callbacks suppressed by the quiet-period guard.",
            null,
            null,
            "Shortcut",
          );
          this.shortcutRepeatBurst = 0;
          this.publish();
        }
      }, 1000);
      if (this.shortcutLatched) {
        this.shortcutRepeatBurst++;
        return;
      }
      this.shortcutLatched = true;
    }
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
    const legacyLast = [...captures]
      .reverse()
      .find((c) => c.screenshot && c.width && c.height);
    const lastSuccessful =
      this.repository.database.getSetting<OcrSnapshot["lastSuccessful"]>(
        "ocr.lastSuccessful",
      ) ??
      (legacyLast
        ? {
            backend: legacyLast.backend ?? "Display",
            width: legacyLast.width!,
            height: legacyLast.height!,
            fallback: legacyLast.fallback ?? false,
            fallbackReason: legacyLast.fallbackReason,
          }
        : undefined);
    return {
      policy: { ...this.policy },
      storage: this.retention.usage(),
      automaticRequests: this.automatic.history().slice(0, 120),
      lastSuccessful,
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
      captures: captures.map((c) => ({
        ...c,
        expiresAt: expiration(c, this.policy),
      })),
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
    for (const [id, done] of this.settleWaiters) {
      const record = this.repository.get(id);
      if (!record || ["Processed", "Failed"].includes(record.status)) {
        this.settleWaiters.delete(id);
        this.captureGuards.delete(id);
        done(record);
      }
    }
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
    this.automatic.recover();
    if (this.policy.cleanupEnabled)
      this.retention.cleanup(this.policy, this.automatic.protectedIds());
    this.cleanupTimer = setInterval(() => {
      if (!this.closing && this.policy.cleanupEnabled) this.cleanup();
    }, 3600000);
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
    if (next.accelerator !== this.settings.accelerator) {
      this.shortcutLatched = false;
      this.shortcutRepeatBurst = 0;
      if (this.shortcutQuietTimer) clearTimeout(this.shortcutQuietTimer);
    }
    this.repository.saveSettings(next);
    this.settings = next;
    this.releaseRecording();
    this.registerShortcut();
    return this.publish();
  }
  configurePolicy(input: unknown) {
    const previous = this.policy;
    this.policy = validatePolicy(input);
    if (
      [
        "autoSource",
        "autoEnabled",
        "maxAttempts",
        "delaySeconds",
        "allowDisplayFallback",
      ].some(
        (key) =>
          previous[key as keyof CapturePolicy] !==
          this.policy[key as keyof CapturePolicy],
      )
    )
      this.automatic.cancel(
        "Automatic capture settings changed; pending requests cancelled.",
      );
    this.repository.database.setSetting("ocr.policy", this.policy);
    this.automatic.policyChanged();
    return this.publish();
  }
  cleanup() {
    this.retention.cleanup(this.policy, this.automatic.protectedIds());
    return this.publish();
  }
  async capture(
    source: "Shortcut" | "Manual" | "Automatic",
    extra?: {
      trigger: CaptureTrigger;
      mode: CaptureMode;
      valid: () => boolean;
    },
  ): Promise<OcrSnapshot> {
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
      settings = { ...this.settings },
      policy = { ...this.policy };
    const record: CaptureRecord = {
      id,
      capturedAt: new Date().toISOString(),
      requestedAt: new Date().toISOString(),
      source,
      requestedSource: extra?.mode ?? policy.source,
      backend:
        (extra?.mode ?? policy.source) === "Display" ? "Display" : "Window",
      fallback: false,
      trigger: extra?.trigger,
      validation: extra ? "Pending" : undefined,
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
    if (extra) this.captureGuards.set(id, extra.valid);
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
        if (extra && !extra.valid())
          throw Error(
            "Automatic capture cancelled before the screen was captured.",
          );
        const captureStartedAt = new Date().toISOString();
        const image = await this.backend.capture(
          id,
          settings.displayId,
          false,
          {
            mode: extra?.mode ?? policy.source,
            allowDisplayFallback: policy.allowDisplayFallback,
          },
        );
        if (extra && !extra.valid()) {
          this.removeFiles(id);
          throw Error(
            "Automatic capture cancelled while capture was in progress.",
          );
        }
        const current = this.repository.get(id);
        if (!current) {
          this.removeFiles(id);
          return;
        }
        this.repository.put({
          ...current,
          capturedAt: captureStartedAt,
          savedAt: new Date().toISOString(),
          backend: image.backend ?? "Display",
          fallback: image.fallback ?? false,
          fallbackReason: image.fallbackReason,
          displayId: image.displayId,
          displayLabel: image.displayLabel,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          status: "Captured",
          error: null,
          screenshot: id + ".png",
        });
        this.repository.database.setSetting("ocr.lastSuccessful", {
          backend: image.backend ?? "Display",
          width: image.width,
          height: image.height,
          fallback: image.fallback ?? false,
          fallbackReason: image.fallbackReason,
        });
        this.lastCapture = {
          at: captureStartedAt,
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
          validation: extra
            ? extra.valid()
              ? "Rejected"
              : "Cancelled"
            : undefined,
          validationMessage: extra ? message : undefined,
          error: message,
          ...(error &&
          typeof error === "object" &&
          "fallback" in error &&
          error.fallback === true
            ? {
                backend: "Display" as const,
                fallback: true,
                fallbackReason:
                  "fallbackReason" in error
                    ? String(error.fallbackReason)
                    : message,
              }
            : {}),
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
    source: "Shortcut" | "Manual" | "Automatic" | null = null,
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
    this.shortcutRepeatBurst = 0;
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
        const imageHash = createHash("sha256").update(image).digest("hex");
        if (
          next.source === "Automatic" &&
          this.repository
            .list()
            .some(
              (c) =>
                c.id !== next.id && c.imageHash === imageHash && c.screenshot,
            )
        ) {
          this.removeFiles(next.id);
          this.repository.put({
            ...next,
            imageHash,
            screenshot: null,
            bytes: 0,
            status: "Failed",
            validation: "Duplicate",
            validationMessage:
              "Unchanged screenshot skipped; no MissionId association was made.",
            error: "Unchanged screenshot skipped.",
          });
          this.publish();
          continue;
        }
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
        const signature = createHash("sha256")
          .update(
            JSON.stringify([
              observation.title.value,
              observation.reward.value,
              observation.company.value,
              observation.objectives.map((o) => [
                o.commodity.value,
                o.pickup.value,
                o.destination.value,
                o.requiredSCU.value,
                o.deliveredSCU.value,
              ]),
            ]),
          )
          .digest("hex");
        let validation: CaptureRecord["validation"],
          validationMessage: string | undefined;
        if (next.source === "Automatic") {
          const valid = this.captureGuards.get(next.id)?.() ?? true;
          const primary =
            /PRIMARY[\s:]*OBJECTIVES/i.test(bounded.text) ||
            (bounded.lines.some((l) => /^PRIMARY:?$/i.test(l.text)) &&
              bounded.lines.some((l) => /^OBJECTIVES:?$/i.test(l.text)));
          const recognizable =
            !!observation.title.value &&
            !!observation.title.evidence?.box &&
            primary &&
            observation.objectives.length > 0;
          validation = !valid
            ? "Cancelled"
            : !recognizable
              ? "Rejected"
              : next.trigger?.expectedTitle &&
                  observation.title.value?.toLowerCase() !==
                    next.trigger.expectedTitle.toLowerCase()
                ? "ReviewUnassociated"
                : "UsableUnassociated";
          validationMessage =
            validation === "Cancelled"
              ? "Automatic request cancelled."
              : validation === "Rejected"
                ? "No plausible contract title and Primary Objectives were recognized."
                : validation === "ReviewUnassociated"
                  ? "A different contract title is visible. Retained for manual review, unrelated to the candidate trigger until verified."
                  : "Recognizable contract screen; candidate trigger is unverified and may refer to a different contract.";
          observation.warnings.push(validationMessage);
          if (["Rejected", "Duplicate", "Cancelled"].includes(validation))
            this.removeFiles(next.id);
        }
        const rejected =
          validation &&
          ["Rejected", "Duplicate", "Cancelled"].includes(validation);
        this.repository.put({
          ...this.repository.get(next.id)!,
          imageHash,
          screenSignature: signature,
          validation,
          validationMessage,
          ...(rejected ? { screenshot: null, bytes: 0 } : {}),
          status: rejected ? "Failed" : "Processed",
          result: bounded,
          observation,
          error: rejected ? validationMessage! : null,
        });
      } catch (error) {
        if (this.closing) return;
        const current = this.repository.get(next.id);
        if (current)
          this.repository.put({
            ...current,
            status: "Failed",
            validation:
              current.source === "Automatic" ? "Rejected" : current.validation,
            validationMessage:
              current.source === "Automatic"
                ? String(error)
                : current.validationMessage,
            error: error instanceof Error ? error.message : String(error),
          });
      }
      this.publish();
    }
  }
  private async captureAutomatic(
    trigger: CaptureTrigger,
    valid: () => boolean,
  ): Promise<AutoOutcome> {
    const state = await this.capture("Automatic", {
      trigger,
      mode: this.policy.autoSource,
      valid,
    });
    const id = state.captures.at(-1)!.id;
    const record = await new Promise<CaptureRecord | null>((resolve) => {
      const current = this.repository.get(id);
      if (!current || ["Processed", "Failed"].includes(current.status))
        resolve(current);
      else this.settleWaiters.set(id, resolve);
    });
    this.captureGuards.delete(id);
    return {
      captureId: id,
      validation:
        record?.validation && record.validation !== "Pending"
          ? record.validation
          : record
            ? "Rejected"
            : "Cancelled",
      message:
        record?.validationMessage ??
        record?.error ??
        "Capture cancelled or removed.",
    };
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
    this.automatic.cancel("Capture collection cleared by the user.");
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
    this.automatic.close();
    try {
      this.repository.saveDiagnostics(this.shortcutDiagnostics);
    } catch {
      /* Diagnostics must not block resource shutdown. */
    }
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.shortcutQuietTimer) clearTimeout(this.shortcutQuietTimer);
    this.closing = true;
    for (const done of this.settleWaiters.values()) done(null);
    this.settleWaiters.clear();
    this.releaseRecording();
    this.shortcut.close();
    this.inputPrototype?.close();
    await this.backend.close();
    await this.provider.close();
    await this.captureTail.catch(() => {});
    if (this.processor) await this.processor.catch(() => {});
  }
}
