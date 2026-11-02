import { createHash } from "node:crypto";
import type { MissionEvent, ParseResult } from "../../../src/types/tracking";
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const terminalId = (kind: string, missionId: string) =>
  digest([kind, missionId.toLowerCase(), null]);
export function lifecycleLine(
  line: string,
  receivedAt: string,
): ParseResult | null {
  const date =
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/.exec(
      line,
    )?.[0];
  const timestamp =
    date && Number.isFinite(Date.parse(date))
      ? new Date(date).toISOString()
      : null;
  const award = /\bAwarded\s+([\d,]+(?:\.\d+)?)\s+aUEC\b/i.exec(line);
  if (award && /Added notification/i.test(line)) {
    const amount = Number(award[1].replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount < 0)
      return { type: "error", error: "Invalid award notification." };
    return {
      type: "reward",
      id: digest(["Reward", line]),
      timestamp,
      receivedAt,
      amount,
    };
  }
  const ended = /\bMissionEnded\b/i.test(line),
    end = /\bEndMission\b/i.test(line);
  if (!ended && !end) return null;
  // A concrete identity and an explicit supported terminal state are both required.
  const mission =
    /(?:\bMissionId|\bmission_id)\s*[:=]?\s*\[([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\]/i.exec(
      line,
    );
  const state = ended
    ? /\bmission_state\s*(?:[:=]\s*)?\[?(MISSION_STATE_COMPLETED|MISSION_STATE_ABANDONED)\b/i.exec(
        line,
      )?.[1]
    : /\bCompletionType\[(Complete|Abandon|Abandoned)\]/i.exec(line)?.[1];
  if (!state) return null;
  if (end && !/\bReason\[Mission Ended\]/i.test(line)) return null;
  if (!mission)
    return {
      type: "error",
      error:
        "Supported terminal record has no valid MissionId; no contract was changed.",
    };
  const kind: MissionEvent["kind"] = /COMPLETED|^Complete$/i.test(state)
      ? "Completed"
      : "Abandoned",
    missionId = mission[1].toLowerCase();
  return {
    type: "event",
    event: {
      id: terminalId(kind, missionId),
      kind,
      missionId,
      objectiveId: null,
      timestamp,
      receivedAt,
    },
  };
}
