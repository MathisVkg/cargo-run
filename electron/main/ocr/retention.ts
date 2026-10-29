import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import type { CaptureRecord } from "../../../src/types/ocr";
import type {
  CapturePolicy,
  CaptureStorage,
} from "../../../src/types/capturePolicy";
import type { CaptureRepository } from "./repository";
const day = 86400000;
const owned =
  /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\.thumb)?\.png(?:\.tmp)?$/i;
export function expiration(c: CaptureRecord, p: CapturePolicy): string | null {
  if (c.evidenceLink) {
    if (c.evidenceLink.status === "Active") return null;
    if (
      !c.evidenceLink.closedAt ||
      !Number.isFinite(Date.parse(c.evidenceLink.closedAt))
    )
      return null;
    return new Date(
      Date.parse(c.evidenceLink.closedAt) + 30 * day,
    ).toISOString();
  }
  const time = Date.parse(c.capturedAt);
  return Number.isFinite(time)
    ? new Date(time + p.unlinkedDays * day).toISOString()
    : null;
}
export class CaptureRetention {
  state: CaptureStorage = {
    bytes: 0,
    count: 0,
    lastCleanupAt: null,
    deleted: 0,
    errors: [],
  };
  constructor(
    private repository: CaptureRepository,
    private directory: string,
    private remove: (path: string) => void = unlinkSync,
  ) {}
  usage() {
    let bytes = 0;
    try {
      for (const name of readdirSync(this.directory)) {
        if (!owned.test(name)) continue;
        try {
          const stat = lstatSync(join(this.directory, name));
          if (stat.isFile() && !stat.isSymbolicLink()) bytes += stat.size;
        } catch {
          /* missing files are harmless */
        }
      }
    } catch {
      this.state.errors = [
        "Capture storage directory is unavailable.",
        ...this.state.errors,
      ].slice(0, 10);
    }
    this.state.bytes = bytes;
    this.state.count = this.repository.list().length;
    return { ...this.state, errors: [...this.state.errors] };
  }
  cleanup(policy: CapturePolicy, protectedIds: Set<string>, now = Date.now()) {
    let deleted = 0;
    const errors: string[] = [];
    try {
      if (lstatSync(this.directory).isSymbolicLink())
        throw Error("Capture folder is a filesystem link.");
    } catch (error) {
      this.state.errors = ["Cleanup refused: " + String(error)];
      return this.usage();
    }
    const removeOwned = (id: string) => {
      if (!owned.test(id + ".png")) {
        errors.push("Invalid owned capture identifier; record retained.");
        return false;
      }
      let failed = false;
      for (const suffix of [".png", ".thumb.png", ".png.tmp"]) {
        const file = resolve(this.directory, id + suffix);
        if (dirname(file) !== resolve(this.directory)) {
          errors.push("Unsafe capture path refused.");
          return false;
        }
        try {
          let stat;
          try {
            stat = lstatSync(file);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
            throw error;
          }
          if (stat.isSymbolicLink() || !stat.isFile())
            throw Error("Unexpected linked/non-file capture entry.");
          this.remove(file);
        } catch (error) {
          failed = true;
          errors.push(id.slice(0, 8) + ": " + String(error).slice(0, 180));
        }
      }
      return !failed;
    };
    for (const record of this.repository.list()) {
      const expires = expiration(record, policy);
      if (
        !expires ||
        Date.parse(expires) > now ||
        protectedIds.has(record.id) ||
        ["Captured", "Processing"].includes(record.status)
      )
        continue;
      if (removeOwned(record.id)) {
        try {
          this.repository.remove(record.id);
          deleted++;
        } catch (error) {
          errors.push(
            record.id.slice(0, 8) +
              ": capture metadata cleanup failed: " +
              String(error).slice(0, 160),
          );
        }
      }
    }
    // Old crash leftovers in the owned UUID namespace follow the same unlinked policy.
    const known = new Set(this.repository.list().map((c) => c.id)),
      orphans = new Map<string, string[]>();
    // A surviving evidence link still protects an orphaned image if capture metadata is missing.
    for (const row of this.repository.database.db
      .prepare(
        "SELECT l.capture_id,c.payload FROM capture_contract_links l JOIN contracts c ON c.id=l.contract_id WHERE l.attached=1",
      )
      .all()) {
      const c = JSON.parse(
        String(row.payload),
      ) as import("../../../src/types/models").Contract;
      const until = c.completedAt
        ? Date.parse(c.completedAt) + 30 * day
        : Infinity;
      if (c.status === "Active" || !Number.isFinite(until) || until > now)
        known.add(String(row.capture_id));
    }
    try {
      for (const name of readdirSync(this.directory)) {
        const match = owned.exec(name);
        if (!match || known.has(match[1]) || protectedIds.has(match[1]))
          continue;
        orphans.set(match[1], [...(orphans.get(match[1]) ?? []), name]);
      }
    } catch (error) {
      errors.push("Could not enumerate leftover captures: " + String(error));
    }
    for (const [id, names] of orphans) {
      try {
        if (
          names.every((name) => {
            const stat = lstatSync(join(this.directory, name));
            return (
              !stat.isSymbolicLink() &&
              stat.isFile() &&
              stat.mtimeMs + policy.unlinkedDays * day < now
            );
          }) &&
          removeOwned(id)
        )
          deleted++;
      } catch (error) {
        errors.push("Could not inspect leftover capture: " + String(error));
      }
    }
    this.state = {
      ...this.state,
      lastCleanupAt: new Date(now).toISOString(),
      deleted,
      errors: errors.slice(0, 10),
    };
    return this.usage();
  }
}
