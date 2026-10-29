import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  DomainSnapshot,
  LogCheckpoint,
  MissionEvent,
  DiagnosticEvent,
  MonitorConfig,
  LogSource,
} from "../../../src/types/tracking";
import type {
  Contract,
  CargoObjective,
  CargoRun,
  Ship,
} from "../../../src/types/models";
type Row = Record<string, unknown>;
export class CargoDatabase {
  readonly db: DatabaseSync;
  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    const version = Number(
      (this.db.prepare("PRAGMA user_version").get() as Row).user_version,
    );
    if (version > 4) {
      this.db.close();
      throw new Error(
        "This database was created by a newer Cargo Run version. No data was changed.",
      );
    }
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    if (version === 0)
      this.transaction(() => {
        this.db.exec(`
        CREATE TABLE ships (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE contracts (id TEXT PRIMARY KEY, mission_id TEXT UNIQUE, origin TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE cargo_objectives (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE, external_id TEXT, payload TEXT NOT NULL, UNIQUE(contract_id, external_id));
        CREATE TABLE cargo_runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE read_checkpoints (path TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE mission_events (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, kind TEXT NOT NULL, event_at TEXT, received_at TEXT NOT NULL, source_path TEXT NOT NULL, generation TEXT NOT NULL, byte_offset INTEGER NOT NULL, mode TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL);
        CREATE INDEX pending_missions ON mission_events(mission_id, resolved);
        CREATE TABLE diagnostics (id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, event_at TEXT, kind TEXT NOT NULL, mission_id TEXT, message TEXT NOT NULL, raw TEXT NOT NULL, source_path TEXT NOT NULL, mode TEXT NOT NULL, event_id TEXT);
        PRAGMA user_version=1;
      `);
      });
    if (version < 2)
      this.transaction(() => {
        this.db.exec(
          "CREATE TABLE ocr_captures (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); PRAGMA user_version=2;",
        );
      });
    if (version < 3)
      this.transaction(() => {
        this.db.exec(
          "CREATE TABLE IF NOT EXISTS automatic_captures (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, mission_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); PRAGMA user_version=3;",
        );
      });
    if (version < 4)
      this.transaction(() => {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS capture_contract_links (capture_id TEXT PRIMARY KEY,contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,attached INTEGER NOT NULL DEFAULT 1,associated_at TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS contract_capture_evidence ON capture_contract_links(contract_id,attached);
      CREATE TABLE IF NOT EXISTS ocr_review_audit (id TEXT PRIMARY KEY,capture_id TEXT NOT NULL,contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,at TEXT NOT NULL,submission_hash TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(capture_id,submission_hash));
      PRAGMA user_version=4;
    `);
      });
  }
  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  getSetting<T>(key: string): T | null {
    const row = this.db
      .prepare("SELECT payload FROM settings WHERE key=?")
      .get(key) as Row | undefined;
    return row ? (JSON.parse(String(row.payload)) as T) : null;
  }
  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO settings(key,payload) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
      )
      .run(key, JSON.stringify(value));
  }
  loadDomain(): DomainSnapshot | null {
    const meta =
      this.getSetting<
        Pick<DomainSnapshot, "selectedShipId" | "sampleMode" | "currentRun">
      >("domain");
    if (!meta) return null;
    const objectives = (
      this.db
        .prepare("SELECT payload FROM cargo_objectives ORDER BY rowid")
        .all() as Row[]
    ).map((r) => JSON.parse(String(r.payload)) as CargoObjective);
    const contracts = (
      this.db
        .prepare("SELECT payload FROM contracts ORDER BY rowid")
        .all() as Row[]
    ).map((r) => {
      const c = JSON.parse(String(r.payload)) as Contract;
      return {
        ...c,
        cargoObjectives: objectives.filter((o) => o.contractId === c.id),
      };
    });
    const runs = (
      this.db
        .prepare(
          "SELECT payload FROM cargo_runs WHERE status='Finished' ORDER BY rowid DESC",
        )
        .all() as Row[]
    ).map((r) => JSON.parse(String(r.payload)) as CargoRun);
    const ships = (
      this.db.prepare("SELECT payload FROM ships ORDER BY rowid").all() as Row[]
    ).map((r) => JSON.parse(String(r.payload)) as Ship);
    return { ...meta, contracts, runs, ships };
  }
  saveDomain(state: DomainSnapshot): void {
    this.db.exec(
      "DELETE FROM cargo_objectives; DELETE FROM cargo_runs; DELETE FROM ships;",
    );
    const retained = new Set(state.contracts.map((c) => c.id));
    for (const row of this.db.prepare("SELECT id FROM contracts").all())
      if (!retained.has(String(row.id)))
        this.db.prepare("DELETE FROM contracts WHERE id=?").run(String(row.id));
    const shipInsert = this.db.prepare("INSERT INTO ships VALUES(?,?)");
    state.ships.forEach((s) => shipInsert.run(s.id, JSON.stringify(s)));
    const insert = this.db.prepare(
      "INSERT INTO contracts VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET mission_id=excluded.mission_id,origin=excluded.origin,payload=excluded.payload",
    );
    const objectiveInsert = this.db.prepare(
      "INSERT INTO cargo_objectives VALUES(?,?,?,?)",
    );
    for (const c of state.contracts) {
      insert.run(
        c.id,
        c.missionId ?? null,
        c.dataOrigin,
        JSON.stringify({ ...c, cargoObjectives: [] }),
      );
      for (const o of c.cargoObjectives)
        objectiveInsert.run(
          o.id,
          c.id,
          o.externalObjectiveId ?? null,
          JSON.stringify(o),
        );
    }
    const runInsert = this.db.prepare("INSERT INTO cargo_runs VALUES(?,?,?)");
    for (const run of [...state.runs].reverse())
      runInsert.run(run.id, run.status, JSON.stringify(run));
    runInsert.run(
      state.currentRun.id,
      state.currentRun.status,
      JSON.stringify(state.currentRun),
    );
    this.setSetting("domain", {
      selectedShipId: state.selectedShipId,
      sampleMode: state.sampleMode,
      currentRun: state.currentRun,
    });
  }
  getMonitorConfig(): MonitorConfig {
    return (
      this.getSetting<MonitorConfig>("monitor") ?? {
        path: null,
        enabled: false,
      }
    );
  }
  checkpoint(path: string): LogCheckpoint | null {
    const row = this.db
      .prepare("SELECT payload FROM read_checkpoints WHERE path=?")
      .get(path) as Row | undefined;
    return row ? (JSON.parse(String(row.payload)) as LogCheckpoint) : null;
  }
  saveCheckpoint(path: string, point: LogCheckpoint): void {
    this.db
      .prepare(
        "INSERT INTO read_checkpoints VALUES(?,?) ON CONFLICT(path) DO UPDATE SET payload=excluded.payload",
      )
      .run(path, JSON.stringify(point));
  }
  recordEvent(event: MissionEvent, source: LogSource): boolean {
    if (event.kind === "Objective") {
      const equivalent = (
        this.db
          .prepare(
            "SELECT payload FROM mission_events WHERE mission_id=? AND kind='Objective'",
          )
          .all(event.missionId) as Row[]
      )
        .map((r) => JSON.parse(String(r.payload)) as MissionEvent)
        .filter(
          (old) =>
            old.commodity === event.commodity &&
            old.destination === event.destination &&
            old.quantitySCU === event.quantitySCU &&
            old.deliveredSCU === event.deliveredSCU &&
            (old.objectiveId === event.objectiveId ||
              !old.objectiveId ||
              !event.objectiveId),
        );
      if (equivalent.length === 1) {
        const old = equivalent[0];
        event.id = old.id;
        if (!old.objectiveId && event.objectiveId) {
          this.db
            .prepare("UPDATE mission_events SET payload=? WHERE id=?")
            .run(JSON.stringify(event), old.id);
          return true;
        }
        return false;
      }
    }
    const result = this.db
      .prepare(
        "INSERT OR IGNORE INTO mission_events VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        event.id,
        event.missionId,
        event.kind,
        event.timestamp,
        event.receivedAt,
        source.path,
        source.generation,
        source.offset,
        source.mode,
        0,
        JSON.stringify(event),
      );
    return Number(result.changes) > 0;
  }
  pending(missionId: string): MissionEvent[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM mission_events WHERE mission_id=? AND resolved=0 ORDER BY rowid",
        )
        .all(missionId) as Row[]
    ).map((r) => JSON.parse(String(r.payload)) as MissionEvent);
  }
  resolve(id: string): void {
    this.db.prepare("UPDATE mission_events SET resolved=1 WHERE id=?").run(id);
  }
  diagnostic(
    kind: string,
    message: string,
    raw: string,
    source: LogSource,
    event?: MissionEvent,
  ): void {
    this.db
      .prepare(
        "INSERT INTO diagnostics(received_at,event_at,kind,mission_id,message,raw,source_path,mode,event_id) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        event?.receivedAt ?? new Date().toISOString(),
        event?.timestamp ?? null,
        kind,
        event?.missionId ?? null,
        message,
        raw.slice(0, 16384),
        source.path,
        source.mode,
        event?.id ?? null,
      );
    this.db.exec(
      "DELETE FROM diagnostics WHERE id NOT IN (SELECT id FROM diagnostics ORDER BY id DESC LIMIT 200)",
    );
    if (kind === "Error")
      this.setSetting(
        "parsingErrors",
        (this.getSetting<number>("parsingErrors") ?? 0) + 1,
      );
  }
  diagnostics(): DiagnosticEvent[] {
    return (
      this.db
        .prepare(
          "SELECT d.*, COALESCE(e.resolved,1) AS resolved FROM diagnostics d LEFT JOIN mission_events e ON e.id=d.event_id ORDER BY d.id DESC LIMIT 200",
        )
        .all() as Row[]
    ).map((r) => ({
      id: Number(r.id),
      receivedAt: String(r.received_at),
      eventAt: r.event_at === null ? null : String(r.event_at),
      kind: String(r.kind),
      missionId: r.mission_id === null ? null : String(r.mission_id),
      message: String(r.message),
      raw: String(r.raw),
      sourcePath: String(r.source_path),
      mode: r.mode as "Live" | "Import",
      unresolved: Number(r.resolved) === 0,
    }));
  }
  counts(): {
    accepted: number;
    objectives: number;
    completed: number;
    unresolved: number;
    parsingErrors: number;
    lastEventAt: string | null;
  } {
    const rows = this.db
      .prepare("SELECT kind,COUNT(*) AS n FROM mission_events GROUP BY kind")
      .all() as Row[];
    const count = (kind: string) =>
      Number(rows.find((r) => r.kind === kind)?.n ?? 0);
    const last = this.db
      .prepare(
        "SELECT received_at FROM mission_events ORDER BY rowid DESC LIMIT 1",
      )
      .get() as Row | undefined;
    return {
      accepted: count("Accepted"),
      objectives: count("Objective"),
      completed: count("Completed"),
      unresolved: Number(
        (
          this.db
            .prepare(
              "SELECT COUNT(*) AS n FROM mission_events WHERE resolved=0",
            )
            .get() as Row
        ).n,
      ),
      parsingErrors: this.getSetting<number>("parsingErrors") ?? 0,
      lastEventAt: last ? String(last.received_at) : null,
    };
  }
  close(): void {
    this.db.close();
  }
}
