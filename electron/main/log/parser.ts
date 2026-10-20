import { createHash } from "node:crypto";
import type { MissionEvent, ParseResult } from "../../../src/types/tracking";
const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const missionPattern =
  /MissionId:\s*\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;
export function parseLogLine(
  line: string,
  receivedAt = new Date().toISOString(),
): ParseResult {
  const kindMatch =
    /Contract Accepted:|New Objective:|Contract Complete:/i.exec(line);
  if (!kindMatch) return { type: "ignore" };
  // Display-only duplicates often have no association metadata. They cannot create missions.
  const mission = missionPattern.exec(line);
  if (!mission)
    return /Added notification/i.test(line)
      ? {
          type: "error",
          error:
            "Recognized notification has no valid MissionId; no contract was changed.",
        }
      : { type: "ignore" };
  const metadataStart = line
    .toLowerCase()
    .indexOf("missionid:", kindMatch.index);
  if (metadataStart < 0)
    return {
      type: "error",
      error: "Mission metadata occurs before notification text.",
    };
  const prefix = line.slice(0, kindMatch.index);
  const timestampText =
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/.exec(
      prefix,
    )?.[0];
  const timestamp =
    timestampText && Number.isFinite(Date.parse(timestampText))
      ? new Date(timestampText).toISOString()
      : null;
  const closeQuote = line.lastIndexOf('"', metadataStart);
  const end = closeQuote > kindMatch.index ? closeQuote : metadataStart;
  let message = line.slice(kindMatch.index, end).trim();
  if (closeQuote <= kindMatch.index)
    message = message
      .replace(/(?:\s*[,\]]?\s*\.\.\.)?\s*$/, "")
      .replace(/[,\s]+$/, "");
  if (message.endsWith(":")) message = message.slice(0, -1).trimEnd();
  const missionId = mission[1].toLowerCase();
  const base = { missionId, timestamp, receivedAt, objectiveId: null };
  let event: Omit<MissionEvent, "id">;
  if (/^Contract Accepted:/i.test(message)) {
    const title = message.replace(/^Contract Accepted:\s*/i, "").trim();
    if (!title)
      return { type: "error", error: "Accepted contract has an empty title." };
    event = { ...base, kind: "Accepted", title };
  } else if (/^Contract Complete:/i.test(message)) {
    event = {
      ...base,
      kind: "Completed",
      title: message.replace(/^Contract Complete:\s*/i, "").trim(),
    };
  } else {
    const objective =
      /^New Objective:\s*Deliver\s+(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s+SCU\s+of\s+(.+)\s+to\s+(.+)$/i.exec(
        message,
      );
    if (!objective)
      return {
        type: "error",
        error:
          "Unrecognized New Objective delivery format; retained for inspection.",
      };
    const deliveredSCU = Number(objective[1]),
      quantitySCU = Number(objective[2]);
    if (
      !Number.isFinite(quantitySCU) ||
      !Number.isFinite(deliveredSCU) ||
      quantitySCU <= 0 ||
      deliveredSCU > quantitySCU
    )
      return { type: "error", error: "Delivery quantities are invalid." };
    const objectiveId =
      /ObjectiveId:\s*\[([^\]\r\n]{1,256})\]/i.exec(line)?.[1] ?? null;
    event = {
      ...base,
      kind: "Objective",
      objectiveId,
      deliveredSCU,
      quantitySCU,
      commodity: objective[3].trim(),
      destination: objective[4].trim(),
    };
  }
  const objectiveIdentity =
    event.objectiveId ??
    hash(
      JSON.stringify([event.commodity, event.destination, event.quantitySCU]),
    );
  // Semantic identifiers ignore presentation, receipt time and timestamp differences in duplicate notifications.
  const id = hash(
    JSON.stringify([
      event.kind,
      missionId,
      event.kind === "Objective"
        ? [
            objectiveIdentity,
            event.deliveredSCU,
            event.quantitySCU,
            event.commodity,
            event.destination,
          ]
        : null,
    ]),
  );
  return { type: "event", event: { ...event, id } };
}
