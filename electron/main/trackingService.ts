import { randomUUID } from "node:crypto";
import { isAbsolute, basename } from "node:path";
import { CargoDatabase } from "./storage/database";
import { readLogChunk, type LogLine } from "./log/reader";
import { parseLogLine } from "./log/parser";
import { applyMissionEvent } from "./log/reconcile";
import { createCargoStore } from "../../src/stores/cargoDomain";
import { ships } from "../../src/data/ships";
import { sampleContracts } from "../../src/data/sample";
import type {
  AppSnapshot,
  DomainSnapshot,
  LogCheckpoint,
  LogSource,
  MonitoringStatus,
  SaveContractRequest,
} from "../../src/types/tracking";
import type { ContractDraft } from "../../src/types/models";

export function assertDraft(
  input: unknown,
): asserts input is SaveContractRequest {
  if (!input || typeof input !== "object")
    throw new Error("Invalid contract request.");
  const { draft, id } = input as SaveContractRequest;
  if (id !== undefined && (typeof id !== "string" || id.length > 256))
    throw new Error("Invalid contract identifier.");
  const text = (value: unknown, max = 2000): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= max;
  const numeric = (value: unknown, min: number, max: number): value is number =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
  if (
    !draft ||
    !text(draft.name) ||
    !numeric(draft.payout, 0, 1e15) ||
    !Array.isArray(draft.objectives) ||
    !draft.objectives.length ||
    draft.objectives.length > 1000
  )
    throw new Error("Invalid manual contract fields.");
  for (const o of draft.objectives)
    if (
      !o ||
      !text(o.commodity) ||
      !text(o.pickupLocation) ||
      !text(o.destination) ||
      !numeric(o.quantitySCU, 0.01, 1e12)
    )
      throw new Error("Invalid delivery objective fields.");
}
export class TrackingService {
  readonly database: CargoDatabase;
  readonly store = createCargoStore([]);
  private savedShips = ships;
  private revision = 0;
  private status: MonitoringStatus = "OFFLINE";
  private error: string | null = null;
  private importing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling: Promise<void> | null = null;
  private running = false;
  private config;
  onChange: (snapshot: AppSnapshot) => void = () => {};
  constructor(databasePath: string) {
    this.database = new CargoDatabase(databasePath);
    const saved = this.database.loadDomain();
    if (saved) {
      this.store.setState(saved);
      this.savedShips = saved.ships.length ? saved.ships : ships;
    } else
      this.database.transaction(() => this.database.saveDomain(this.domain()));
    this.config = this.database.getMonitorConfig();
  }
  domain(): DomainSnapshot {
    const s = this.store.getState();
    return {
      ships: this.savedShips,
      selectedShipId: s.selectedShipId,
      contracts: s.contracts,
      runs: s.runs,
      currentRun: s.currentRun,
      sampleMode: s.sampleMode,
    };
  }
  snapshot(): AppSnapshot {
    return {
      ...this.domain(),
      revision: this.revision,
      databasePath: this.database.path,
      tracking: {
        status: this.status,
        path: this.config.path,
        enabled: this.config.enabled,
        importing: this.importing,
        error: this.error,
        ...this.database.counts(),
        events: this.database.diagnostics(),
      },
    };
  }
  private publish(): AppSnapshot {
    this.revision++;
    const state = this.snapshot();
    this.onChange(state);
    return state;
  }
  private mutate(action: () => void): AppSnapshot {
    const before = this.store.getState();
    try {
      this.database.transaction(() => {
        action();
        this.database.saveDomain(this.domain());
      });
    } catch (e) {
      this.store.setState(before, true);
      throw e;
    }
    return this.publish();
  }
  saveContract(input: unknown): AppSnapshot {
    assertDraft(input);
    return this.mutate(() => {
      this.store
        .getState()
        .saveContract(input.draft as ContractDraft, input.id);
    });
  }
  selectShip(id: unknown): AppSnapshot {
    if (typeof id !== "string" || !this.savedShips.some((s) => s.id === id))
      throw new Error("Unknown ship.");
    return this.mutate(() => this.store.setState({ selectedShipId: id }));
  }
  abandonContract(id: unknown): AppSnapshot {
    if (
      typeof id !== "string" ||
      !this.store
        .getState()
        .contracts.some((c) => c.id === id && c.status === "Active")
    )
      throw new Error("Active contract not found.");
    return this.mutate(() => this.store.getState().abandonContract(id));
  }
  finishRun(): AppSnapshot {
    return this.mutate(() => this.store.getState().finishRun());
  }
  removeSamples(): AppSnapshot {
    return this.mutate(() => this.store.getState().clearSampleData());
  }
  loadSamples(): AppSnapshot {
    if (
      this.running ||
      this.config.enabled ||
      this.importing ||
      this.store.getState().contracts.length ||
      this.database.counts().accepted
    )
      throw new Error(
        "Sample data requires an empty ledger with monitoring stopped and no detected missions.",
      );
    return this.mutate(() => {
      const contracts = sampleContracts();
      this.store.setState({
        contracts,
        sampleMode: true,
        currentRun: {
          id: randomUUID(),
          startedAt: new Date().toISOString(),
          status: "Active",
          contractIds: contracts
            .filter((c) => c.status === "Active")
            .map((c) => c.id),
          contractSnapshots: [],
        },
      });
    });
  }
  private ensureRealMode(): void {
    if (this.store.getState().sampleMode)
      throw new Error(
        "Remove sample contracts in Settings before tracking or importing real missions.",
      );
  }
  async setLogPath(path: string): Promise<AppSnapshot> {
    if (!isAbsolute(path) || basename(path).toLowerCase() !== "game.log")
      throw new Error("Select a file named Game.log.");
    await this.halt();
    // Selection is remembered even if a temporarily inaccessible file cannot be opened later.
    this.config = { path, enabled: false };
    this.database.setSetting("monitor", this.config);
    this.status = "OFFLINE";
    this.error = null;
    return this.publish();
  }
  async start(): Promise<AppSnapshot> {
    this.ensureRealMode();
    if (!this.config.path) throw new Error("Select Game.log first.");
    await this.halt();
    this.config = { ...this.config, enabled: true };
    this.database.setSetting("monitor", this.config);
    this.running = true;
    await this.tick();
    this.schedule();
    return this.snapshot();
  }
  async stop(): Promise<AppSnapshot> {
    await this.halt();
    this.config = { ...this.config, enabled: false };
    this.database.setSetting("monitor", this.config);
    this.status = "OFFLINE";
    this.error = null;
    return this.publish();
  }
  async resume(): Promise<void> {
    if (this.config.enabled) await this.start();
  }
  private async halt(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.polling) await this.polling;
  }
  private schedule(): void {
    if (this.running)
      this.timer = setTimeout(() => {
        void this.tick().finally(() => this.schedule());
      }, 500);
  }
  private tick(): Promise<void> {
    if (this.polling) return this.polling;
    this.polling = this.pollOnce().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }
  private async pollOnce(): Promise<void> {
    if (!this.config.path) return;
    try {
      for (let chunk = 0; chunk < 16 && this.running; chunk++) {
        const previous = this.database.checkpoint(this.config.path);
        const result = await readLogChunk(
          this.config.path,
          previous,
          !previous,
        );
        if (
          !previous ||
          JSON.stringify(previous) !== JSON.stringify(result.checkpoint) ||
          result.lines.length
        )
          this.processLines(
            result.lines,
            {
              path: this.config.path,
              generation: result.checkpoint.generation,
              offset: 0,
              mode: "Live",
            },
            result.checkpoint,
          );
        if (this.status !== "ONLINE" || this.error) {
          this.status = "ONLINE";
          this.error = null;
          this.publish();
        }
        if (!result.hasMore) break;
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not read Game.log.";
      if (this.status !== "ERROR" || this.error !== message) {
        this.status = "ERROR";
        this.error = message;
        this.publish();
      }
    }
  }
  processLines(
    lines: LogLine[],
    source: LogSource,
    checkpoint?: LogCheckpoint,
  ): void {
    const before = this.store.getState();
    let changed = false;
    try {
      this.database.transaction(() => {
        for (const line of lines) {
          const context = { ...source, offset: line.offset };
          const parsed = line.error
            ? { type: "error" as const, error: line.error }
            : parseLogLine(line.text);
          if (parsed.type === "ignore") continue;
          if (parsed.type === "error") {
            this.database.diagnostic("Error", parsed.error, line.text, context);
            changed = true;
            continue;
          }
          const event = parsed.event;
          if (!this.database.recordEvent(event, context)) continue;
          changed = true;
          const apply = (pending: typeof event) => {
            const result = applyMissionEvent(
              this.store.getState().contracts,
              pending,
            );
            this.store.setState({ contracts: result.contracts });
            if (result.createdId) {
              const run = this.store.getState().currentRun;
              this.store.setState({
                currentRun: {
                  ...run,
                  contractIds: [
                    ...new Set([...run.contractIds, result.createdId]),
                  ],
                },
              });
            }
            if (result.resolved) this.database.resolve(pending.id);
          };
          apply(event);
          if (event.kind === "Accepted")
            for (const pending of this.database.pending(event.missionId))
              apply(pending);
          this.database.diagnostic(
            event.kind,
            event.timestamp
              ? "Observed mission notification."
              : "Notification has no supported timestamp; receipt time used.",
            line.text,
            context,
            event,
          );
        }
        if (changed) this.database.saveDomain(this.domain());
        if (checkpoint) this.database.saveCheckpoint(source.path, checkpoint);
      });
    } catch (e) {
      this.store.setState(before, true);
      throw e;
    }
    if (changed) this.publish();
  }
  async importHistory(): Promise<AppSnapshot> {
    this.ensureRealMode();
    const path = this.config.path;
    if (!path) throw new Error("Select Game.log first.");
    const wasRunning = this.running;
    await this.halt();
    this.importing = true;
    let succeeded = false;
    this.error = null;
    this.publish();
    try {
      let point: LogCheckpoint | null = null,
        end: number | undefined;
      for (;;) {
        const result = await readLogChunk(path, point, false, end);
        end ??= result.size;
        point = result.checkpoint;
        this.processLines(result.lines, {
          path,
          generation: point.generation,
          offset: 0,
          mode: "Import",
        });
        if (!result.hasMore) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      if (point.pending)
        this.database.diagnostic(
          "Info",
          "Import stopped at an incomplete final line. Append its newline and import again; no partial event was applied.",
          "",
          {
            path,
            generation: point.generation,
            offset: point.offset,
            mode: "Import",
          },
        );
      succeeded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "History import failed.";
      this.status = "ERROR";
      throw e;
    } finally {
      this.importing = false;
      if (succeeded && !wasRunning) this.status = "OFFLINE";
      if (wasRunning) {
        this.running = true;
        await this.tick();
        this.schedule();
      }
      this.publish();
    }
    return this.snapshot();
  }
  async close(): Promise<void> {
    await this.halt();
    this.database.close();
  }
}
