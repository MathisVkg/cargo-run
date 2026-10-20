import { open } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { LogCheckpoint } from "../../../src/types/tracking";
export const MAX_LINE_BYTES = 256 * 1024;
export const CHUNK_BYTES = 64 * 1024;
export interface LogLine {
  text: string;
  offset: number;
  error?: string;
}
export interface ReadResult {
  checkpoint: LogCheckpoint;
  lines: LogLine[];
  hasMore: boolean;
  size: number;
}
async function fingerprint(
  handle: Awaited<ReturnType<typeof open>>,
  offset: number,
): Promise<string> {
  const n = Math.min(64, offset);
  if (!n) return "";
  const buffer = Buffer.alloc(n);
  const result = await handle.read(buffer, 0, n, offset - n);
  return createHash("sha256")
    .update(buffer.subarray(0, result.bytesRead))
    .digest("hex");
}
export async function readLogChunk(
  path: string,
  previous: LogCheckpoint | null,
  startAtEnd = false,
  endLimit?: number,
): Promise<ReadResult> {
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile())
      throw new Error("Selected Game.log is not a regular file.");
    const fileKey = [stat.dev, stat.ino, stat.birthtimeMs].join(":");
    let point: LogCheckpoint;
    if (!previous) {
      const offset = startAtEnd ? stat.size : 0;
      const lastByte = Buffer.alloc(1);
      if (offset) await handle.read(lastByte, 0, 1, offset - 1);
      point = {
        fileKey,
        generation: randomUUID(),
        offset,
        pending: "",
        dropping: offset > 0 && lastByte[0] !== 10,
        anchor: "",
      };
    } else {
      const replaced =
        previous.fileKey !== fileKey ||
        stat.size < previous.offset ||
        (previous.anchor &&
          previous.anchor !== (await fingerprint(handle, previous.offset)));
      if (replaced && endLimit !== undefined)
        throw new Error(
          "Game.log changed during history import. Import again to continue safely.",
        );
      point = replaced
        ? {
            fileKey,
            generation: randomUUID(),
            offset: 0,
            pending: "",
            dropping: false,
            anchor: "",
          }
        : { ...previous };
    }
    const end = Math.min(stat.size, endLimit ?? stat.size);
    const length = Math.min(CHUNK_BYTES, Math.max(0, end - point.offset));
    const buffer = Buffer.alloc(length);
    const { bytesRead } = length
      ? await handle.read(buffer, 0, length, point.offset)
      : { bytesRead: 0 };
    const previousPending = Buffer.from(point.pending, "base64");
    const combined = Buffer.concat([
      previousPending,
      buffer.subarray(0, bytesRead),
    ]);
    const baseOffset = point.offset - previousPending.length;
    const lines: LogLine[] = [];
    let cursor = 0,
      dropping = point.dropping;
    while (cursor < combined.length) {
      const newline = combined.indexOf(10, cursor);
      if (newline < 0) break;
      if (!dropping) {
        const bytes = combined.subarray(cursor, newline);
        if (bytes.length > MAX_LINE_BYTES)
          lines.push({
            text: "",
            offset: baseOffset + cursor,
            error:
              "Notification line exceeded the 256 KiB parser limit and was skipped.",
          });
        else
          lines.push({
            text: bytes.toString("utf8").replace(/\r$/, ""),
            offset: baseOffset + cursor,
          });
      }
      dropping = false;
      cursor = newline + 1;
    }
    let pending = combined.subarray(cursor);
    if (pending.length > MAX_LINE_BYTES) {
      if (!dropping)
        lines.push({
          text: "",
          offset: baseOffset + cursor,
          error:
            "Unterminated line exceeded the 256 KiB parser limit; waiting for a newline.",
        });
      dropping = true;
    }
    if (dropping) pending = Buffer.alloc(0);
    point = {
      ...point,
      offset: point.offset + bytesRead,
      pending: pending.toString("base64"),
      dropping,
      anchor: await fingerprint(handle, point.offset + bytesRead),
    };
    return {
      checkpoint: point,
      lines,
      hasMore: point.offset < end,
      size: stat.size,
    };
  } finally {
    await handle.close();
  }
}
