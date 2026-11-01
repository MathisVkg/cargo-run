import { backup, DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  lstatSync,
  existsSync,
  copyFileSync,
  unlinkSync,
  writeFileSync,
  constants,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import type { TrackingService } from "../trackingService";
import type { DomainSnapshot } from "../../../src/types/tracking";
import type { CaptureRecord } from "../../../src/types/ocr";
import type {
  CleanupMode,
  CleanupPreview,
  CleanupResult,
  LocalDataStats,
} from "../../../src/types/maintenance";
const owned =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\.thumb)?\.png(?:\.tmp)?$/i;
export interface MaintenanceRuntime {
  pause(): Promise<void>;
  resume(): Promise<void>;
}
export class LocalDataManager {
  private previews = new Map<
    string,
    { mode: CleanupMode; fingerprint: string; at: number }
  >();
  busy = false;
  constructor(
    readonly service: TrackingService,
    readonly captures: string,
    private runtime: MaintenanceRuntime,
    private makeBackup: (
      db: DatabaseSync,
      path: string,
    ) => Promise<unknown> = backup,
    private removeFile: (file: string) => void = unlinkSync,
  ) {}
  private count(table: string) {
    return Number(
      this.service.database.db
        .prepare("SELECT COUNT(*) AS n FROM " + table)
        .get()!.n,
    );
  }
  private capturesList() {
    return this.service.database.db
      .prepare("SELECT id,payload FROM ocr_captures ORDER BY sequence")
      .all()
      .map((r) => ({
        id: String(r.id),
        record: JSON.parse(String(r.payload)) as CaptureRecord,
      }));
  }
  private files() {
    const folder = resolve(this.captures);
    if (!existsSync(folder)) return [];
    if (lstatSync(folder).isSymbolicLink())
      throw Error("Capture directory is a filesystem link; cleanup refused.");
    return readdirSync(folder)
      .filter((n) => owned.test(n))
      .map((n) => {
        const file = resolve(folder, n);
        if (dirname(file) !== folder) throw Error("Unsafe capture path.");
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink())
          throw Error("Linked or unexpected capture entry; cleanup refused.");
        return { file, name: n, bytes: stat.size };
      });
  }
  stats(): LocalDataStats {
    const d = this.service.domain(),
      cs = d.contracts.filter((c) => !c.supersededBy);
    let trackingBytes = 0;
    for (const file of [
      this.service.database.path,
      this.service.database.path + "-wal",
      this.service.database.path + "-shm",
    ])
      try {
        trackingBytes += lstatSync(file).size;
      } catch {
        /* Database sidecar may not exist. */
      }
    try {
      trackingBytes += this.files().reduce((n, f) => n + f.bytes, 0);
    } catch {
      /* Preview/backup surfaces unsafe paths; counts remain usable. */
    }
    return {
      total: d.contracts.length,
      active: cs.filter((c) => c.status === "Active").length,
      completed: cs.filter((c) => c.status === "Completed").length,
      abandoned: cs.filter((c) => c.status === "Abandoned").length,
      finishedRuns: d.runs.length,
      captures: this.count("ocr_captures"),
      pendingMissions: this.service.database
        .pendingMissions()
        .filter(
          (c) =>
            c.status === "Active" &&
            !d.contracts.some((t) => t.missionId === c.missionId),
        ).length,
      trackingBytes,
      lastBackup: this.service.database.getSetting<string>(
        "maintenance.lastBackup",
      ),
    };
  }
  private removed(mode: CleanupMode) {
    const cs = this.service.domain().contracts,
      ids = new Set(
        cs
          .filter((c) => mode === "reset" || c.status !== "Active")
          .map((c) => c.id),
      );
    for (let i = 0; i < cs.length; i++) {
      let changed = false;
      for (const c of cs)
        if (c.supersededBy && ids.has(c.supersededBy) && !ids.has(c.id)) {
          ids.add(c.id);
          changed = true;
        }
      if (!changed) break;
    }
    return ids;
  }
  private fingerprint() {
    const db = this.service.database;
    return createHash("sha256")
      .update(
        JSON.stringify([
          this.service.domain(),
          this.capturesList(),
          db.pendingMissions(true),
          db.db
            .prepare("SELECT path,payload FROM read_checkpoints ORDER BY path")
            .all(),
          db.db
            .prepare(
              "SELECT COUNT(*) AS n,MAX(rowid) AS last FROM mission_events",
            )
            .get(),
        ]),
      )
      .digest("hex");
  }
  preview(input: unknown): CleanupPreview {
    if (!["closed", "history", "reset"].includes(input as string))
      throw Error("Invalid cleanup option.");
    const mode = input as CleanupMode,
      d = this.service.domain(),
      ids = this.removed(mode),
      token = randomUUID(),
      links = this.service.database.db
        .prepare("SELECT capture_id,contract_id FROM capture_contract_links")
        .all(),
      audits = this.service.database.db
        .prepare("SELECT contract_id FROM ocr_review_audit")
        .all();
    this.previews.set(token, {
      mode,
      fingerprint: this.fingerprint(),
      at: Date.now(),
    });
    if (this.previews.size > 20)
      this.previews.delete(this.previews.keys().next().value!);
    return {
      token,
      mode,
      contracts: ids.size,
      runs:
        mode === "closed"
          ? d.runs.filter(
              (r) =>
                r.contractIds.some((id) => ids.has(id)) ||
                r.contractSnapshots.some((c) => ids.has(c.id)),
            ).length
          : d.runs.length + (mode === "reset" ? 1 : 0),
      captures:
        mode === "reset"
          ? this.count("ocr_captures")
          : links.filter((l) => ids.has(String(l.contract_id))).length,
      links:
        mode === "reset"
          ? links.length
          : links.filter((l) => ids.has(String(l.contract_id))).length,
      audits:
        mode === "reset"
          ? audits.length
          : audits.filter((l) => ids.has(String(l.contract_id))).length,
      runReferences: [d.currentRun, ...d.runs].reduce(
        (n, r) => n + r.contractIds.filter((id) => ids.has(id)).length,
        0,
      ),
      automaticRequests: this.count("automatic_captures"),
      preservesActive: mode !== "reset",
      stopsMonitoring: mode === "reset",
      description:
        mode === "closed"
          ? "Remove closed records and their links/audits; prune closed references/snapshots from retained runs. Capture records/images become unlinked and are retained."
          : mode === "history"
            ? "Remove closed contracts, their links/audits and all finished runs. Active contracts/current run remain; capture records/images are retained unlinked."
            : "Remove all tracking records, checkpoints, requests and managed images. Create a fresh empty current run. Keep configuration, ships and preferences; monitoring stays stopped.",
    };
  }
  private async backupData() {
    const root = resolve(dirname(this.service.database.path), "backups");
    if (
      root === resolve(this.captures) ||
      root.startsWith(resolve(this.captures) + requireSeparator())
    )
      throw Error("Unsafe backup path.");
    mkdirSync(root, { recursive: true });
    if (lstatSync(root).isSymbolicLink())
      throw Error("Backup directory is a filesystem link.");
    const folder = join(
      root,
      new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID(),
    );
    mkdirSync(folder);
    try {
      await this.makeBackup(
        this.service.database.db,
        join(folder, "cargo-run.sqlite"),
      );
      const files = this.files();
      mkdirSync(join(folder, "captures"));
      for (const f of files)
        copyFileSync(
          f.file,
          join(folder, "captures", f.name),
          constants.COPYFILE_EXCL,
        );
      const verify = new DatabaseSync(join(folder, "cargo-run.sqlite"), {
        readOnly: true,
      });
      try {
        if (
          String(
            verify.prepare("PRAGMA integrity_check").get()!.integrity_check,
          ) !== "ok" ||
          verify.prepare("PRAGMA foreign_key_check").all().length
        )
          throw Error("Backup integrity validation failed.");
      } finally {
        verify.close();
      }
      writeFileSync(
        join(folder, "manifest.json"),
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            schema: 5,
            evidenceFiles: files.map((f) => ({ name: f.name, bytes: f.bytes })),
            restore:
              "Close Cargo Run. Restore cargo-run.sqlite and captures from this folder together; preserve a copy of current data and remove stale WAL/SHM only while the app is closed.",
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
      return folder;
    } catch (e) {
      throw Error(
        "Backup failed; no cleanup was performed. Partial backup retained at " +
          folder +
          ". " +
          String(e),
        { cause: e },
      );
    }
  }
  async execute(input: unknown): Promise<CleanupResult> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw Error("Invalid cleanup request.");
    const r = input as {
      token?: unknown;
      confirmed?: unknown;
      resetText?: unknown;
    };
    if (
      Object.keys(r).some(
        (k) => !["token", "confirmed", "resetText"].includes(k),
      ) ||
      typeof r.token !== "string" ||
      r.confirmed !== true
    )
      throw Error("Explicit cleanup confirmation is required.");
    const preview = this.previews.get(r.token);
    if (!preview || Date.now() - preview.at > 600000)
      throw Error("Preview expired; review cleanup again.");
    if (preview.mode === "reset" && r.resetText !== "RESET")
      throw Error("Type RESET to confirm.");
    if (this.busy) throw Error("Data maintenance is already in progress.");
    if (preview.fingerprint !== this.fingerprint())
      throw Error("Tracking data changed. Review a fresh cleanup preview.");
    this.previews.delete(r.token);
    this.busy = true;
    let wasRunning = false,
      paused = false,
      committed = false,
      backupPath = "";
    const warnings: string[] = [];
    try {
      wasRunning = await this.service.pauseForMaintenance();
      paused = true;
      await this.runtime.pause();
      if (preview.fingerprint !== this.fingerprint())
        throw Error(
          "Tracking data changed while pausing. Review a fresh cleanup preview.",
        );
      backupPath = await this.backupData();
      const mode = preview.mode,
        ids = this.removed(mode),
        before = this.service.domain(),
        db = this.service.database;
      let after: DomainSnapshot;
      db.transaction(() => {
        const links = db.db
          .prepare("SELECT capture_id,contract_id FROM capture_contract_links")
          .all();
        const affected = new Set(
          links
            .filter((l) => ids.has(String(l.contract_id)))
            .map((l) => String(l.capture_id)),
        );
        if (mode === "reset") {
          db.db.exec(
            "DELETE FROM ocr_review_audit; DELETE FROM capture_contract_links; DELETE FROM cargo_objectives; DELETE FROM contracts; DELETE FROM cargo_runs; DELETE FROM ocr_captures; DELETE FROM pending_log_missions; DELETE FROM mission_events; DELETE FROM diagnostics; DELETE FROM automatic_captures; DELETE FROM read_checkpoints;",
          );
          for (const key of [
            "parsingErrors",
            "ocr.shortcutDiagnostics",
            "ocr.lastSuccessful",
            "tracking.archivedMissions",
          ])
            db.db.prepare("DELETE FROM settings WHERE key=?").run(key);
          db.setSetting("tracking.resumeBlocked", true);
          after = {
            ...before,
            contracts: [],
            runs: [],
            sampleMode: false,
            currentRun: {
              id: randomUUID(),
              startedAt: new Date().toISOString(),
              status: "Active",
              contractIds: [],
              contractSnapshots: [],
            },
          };
        } else {
          const archived = new Set(
            db.getSetting<string[]>("tracking.archivedMissions") ?? [],
          );
          for (const c of before.contracts)
            if (ids.has(c.id) && c.missionId) archived.add(c.missionId);
          db.setSetting("tracking.archivedMissions", [...archived]);
          for (const id of ids) {
            db.db
              .prepare("DELETE FROM ocr_review_audit WHERE contract_id=?")
              .run(id);
            db.db
              .prepare("DELETE FROM capture_contract_links WHERE contract_id=?")
              .run(id);
          }
          for (const { id, record } of this.capturesList())
            if (affected.has(id))
              db.db
                .prepare("UPDATE ocr_captures SET payload=? WHERE id=?")
                .run(
                  JSON.stringify({
                    ...record,
                    historyRemoved: true,
                    importResult: {
                      status: "Pending corrections",
                      message:
                        "Closed history was cleared; explicitly confirm a separate accepted instance to reuse.",
                      candidateIds: [],
                      processedHash: "history-cleared",
                    },
                  }),
                  id,
                );
          const prune = (r: DomainSnapshot["currentRun"]) => ({
            ...r,
            contractIds: r.contractIds.filter((id) => !ids.has(id)),
            contractSnapshots: r.contractSnapshots.filter(
              (c) => !ids.has(c.id),
            ),
          });
          after = {
            ...before,
            contracts: before.contracts.filter((c) => !ids.has(c.id)),
            currentRun: prune(before.currentRun),
            runs: mode === "history" ? [] : before.runs.map(prune),
          };
        }
        db.saveDomain(after!);
        db.setSetting("maintenance.lastBackup", backupPath);
        if (db.db.prepare("PRAGMA foreign_key_check").all().length)
          throw Error("Foreign-key integrity check failed.");
      });
      committed = true;
      this.service.applyMaintenance(after!, mode === "reset");
      if (mode === "reset")
        try {
          for (const f of this.files())
            try {
              this.removeFile(f.file);
            } catch (e) {
              if (warnings.length < 20)
                warnings.push("Could not remove " + f.name + ": " + String(e));
            }
        } catch (e) {
          warnings.push(
            "Tracking records were reset, but capture files need manual review: " +
              String(e),
          );
        }
      return {
        backupPath,
        message: "Local tracking data cleanup completed.",
        warnings,
        stats: this.stats(),
      };
    } catch (e) {
      throw Error(
        String(e) + (backupPath ? " Consistent backup: " + backupPath : ""),
        { cause: e },
      );
    } finally {
      try {
        if (paused) {
          await this.runtime.resume();
          if (wasRunning && !(committed && preview.mode === "reset"))
            await this.service.start();
        }
      } catch (e) {
        warnings.push(
          "A service could not resume. Reopen Cargo Run. " + String(e),
        );
        this.service.maintenanceRecoveryError(String(e));
      } finally {
        this.busy = false;
      }
    }
  }
}
function requireSeparator() {
  return process.platform === "win32" ? "\\" : "/";
}
