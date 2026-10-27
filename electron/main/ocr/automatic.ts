import { randomUUID } from "node:crypto";
import type { CargoDatabase } from "../storage/database";
import type { MissionEvent } from "../../../src/types/tracking";
import type {
  AutoRequest,
  CapturePolicy,
  CaptureTrigger,
} from "../../../src/types/capturePolicy";
export interface AutoOutcome {
  captureId?: string;
  validation:
    | "UsableUnassociated"
    | "ReviewUnassociated"
    | "Rejected"
    | "Duplicate"
    | "Cancelled";
  message: string;
}
export class AutomaticCapture {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private monitoring = false;
  private busy = false;
  private closed = false;
  private generation = 0;
  onChange = () => {};
  constructor(
    private db: CargoDatabase,
    private policy: () => CapturePolicy,
    private capture: (
      trigger: CaptureTrigger,
      valid: () => boolean,
    ) => Promise<AutoOutcome>,
  ) {}
  private save(r: AutoRequest) {
    this.db.db
      .prepare(
        "INSERT INTO automatic_captures(id,mission_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(r.id, r.missionId, JSON.stringify(r));
    const terminal = this.history()
      .filter((r) => !["Pending", "Running"].includes(r.status))
      .slice(100);
    for (const r of terminal)
      this.db.db.prepare("DELETE FROM automatic_captures WHERE id=?").run(r.id);
    this.onChange();
  }
  history(): AutoRequest[] {
    return this.db.db
      .prepare("SELECT payload FROM automatic_captures ORDER BY sequence DESC")
      .all()
      .map((r) => JSON.parse(String(r.payload)) as AutoRequest);
  }
  recover() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.generation++;
    for (const r of this.history())
      if (["Pending", "Running"].includes(r.status))
        this.save({
          ...r,
          status: "Expired",
          message:
            "Application restarted; pending capture was not replayed against a potentially different screen.",
        });
  }
  setMonitoring(enabled: boolean) {
    if (this.monitoring === enabled) return;
    this.monitoring = enabled;
    if (!enabled) this.cancel("Monitoring stopped or became unavailable.");
    else this.schedule();
  }
  accept(event: MissionEvent) {
    if (
      this.closed ||
      event.kind !== "Accepted" ||
      !/\b(?:cargo|haul(?:ing)?|freight)\b/i.test(event.title ?? "")
    )
      return;
    if (
      this.db.db
        .prepare("SELECT id FROM automatic_captures WHERE mission_id=?")
        .get(event.missionId)
    )
      return;
    const p = this.policy(),
      now = Date.now(),
      pending = this.history().filter((r) =>
        ["Pending", "Running"].includes(r.status),
      ).length;
    const expired =
      !!event.timestamp && now - Date.parse(event.timestamp) > 120000;
    const skipped = !p.autoEnabled || !this.monitoring || pending >= 20;
    this.save({
      id: randomUUID(),
      missionId: event.missionId,
      eventAt: event.timestamp ?? event.receivedAt,
      receivedAt: event.receivedAt,
      dueAt: new Date(now + p.delaySeconds * 1000).toISOString(),
      deadline: new Date(now + 120000).toISOString(),
      attempts: 0,
      status: expired ? "Expired" : skipped ? "Skipped" : "Pending",
      message: expired
        ? "Acceptance event is too old for a current-screen capture."
        : !p.autoEnabled
          ? "Automatic capture disabled."
          : !this.monitoring
            ? "Monitoring is not active."
            : pending >= 20
              ? "Automatic queue is full (20 pending)."
              : "Live hauling acceptance scheduled; MissionId is an unverified candidate only.",
      captureId: null,
      expectedTitle: event.title,
    } as AutoRequest);
    this.schedule();
  }
  policyChanged() {
    if (!this.policy().autoEnabled)
      this.cancel("Automatic capture disabled in Settings.");
    else this.schedule();
  }
  cancel(message: string) {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const r of this.history())
      if (["Pending", "Running"].includes(r.status))
        this.save({ ...r, status: "Skipped", message });
  }
  protectedIds() {
    return new Set(
      this.history()
        .filter((r) => ["Pending", "Running"].includes(r.status) && r.captureId)
        .map((r) => r.captureId!),
    );
  }
  private schedule() {
    if (
      this.closed ||
      this.busy ||
      !this.monitoring ||
      !this.policy().autoEnabled
    )
      return;
    if (this.timer) clearTimeout(this.timer);
    const next = this.history()
      .filter((r) => r.status === "Pending")
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
    if (!next) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.run(next);
      },
      Math.max(0, Date.parse(next.dueAt) - Date.now()),
    );
  }
  private async run(r: AutoRequest) {
    if (this.closed || !this.monitoring || !this.policy().autoEnabled) return;
    if (Date.now() > Date.parse(r.deadline)) {
      this.save({
        ...r,
        status: "Expired",
        message:
          "Capture request expired before its screen could be inspected.",
      });
      this.schedule();
      return;
    }
    if (
      this.history().find((current) => current.id === r.id)?.status !==
      "Pending"
    ) {
      this.schedule();
      return;
    }
    this.busy = true;
    const generation = this.generation,
      attempt = r.attempts + 1;
    this.save({
      ...r,
      status: "Running",
      attempts: attempt,
      message:
        "Capturing an independent observation; trigger association remains unverified.",
    });
    const valid = () =>
      !this.closed &&
      this.monitoring &&
      this.policy().autoEnabled &&
      generation === this.generation &&
      Date.now() <= Date.parse(r.deadline);
    try {
      const result = await this.capture(
        {
          requestId: r.id,
          candidateMissionId: r.missionId,
          eventAt: r.eventAt,
          eventType: "Accepted",
          delaySeconds: this.policy().delaySeconds,
          attempt,
          association: "Unverified",
          expectedTitle: r.expectedTitle,
        },
        valid,
      );
      if (!valid()) return;
      const success = ["UsableUnassociated", "ReviewUnassociated"].includes(
        result.validation,
      );
      const retry =
        !success &&
        result.validation !== "Duplicate" &&
        result.validation !== "Cancelled" &&
        attempt < this.policy().maxAttempts;
      this.save({
        ...r,
        captureId: result.captureId ?? null,
        attempts: attempt,
        status: success
          ? "Completed"
          : retry
            ? "Pending"
            : ["Duplicate", "Cancelled"].includes(result.validation)
              ? "Skipped"
              : "Failed",
        dueAt: new Date(
          Date.now() + this.policy().delaySeconds * 1000,
        ).toISOString(),
        message:
          result.message +
          (retry
            ? " Retrying after the configured delay."
            : !success && result.validation !== "Duplicate"
              ? " Retry limit reached or request cancelled."
              : ""),
      });
    } catch (error) {
      if (valid())
        this.save({
          ...r,
          attempts: attempt,
          status: attempt < this.policy().maxAttempts ? "Pending" : "Failed",
          dueAt: new Date(
            Date.now() + this.policy().delaySeconds * 1000,
          ).toISOString(),
          message:
            String(error).slice(0, 500) +
            (attempt < this.policy().maxAttempts
              ? " Retrying after the configured delay."
              : " Retry limit reached."),
        });
    } finally {
      if (!valid()) {
        const current = this.history().find((x) => x.id === r.id);
        if (current?.status === "Running")
          this.save({
            ...current,
            status: "Expired",
            message:
              "Capture expired or was cancelled; any retained observation remains unassociated.",
          });
      }
      this.busy = false;
      this.schedule();
    }
  }
  close() {
    this.closed = true;
    try {
      this.cancel(
        "Application shutting down; no pending capture will be replayed.",
      );
    } catch {
      /* Timers/generation are cancelled before persistence; recover unfinished requests at startup. */
    }
  }
}
