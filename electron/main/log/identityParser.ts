import { createHash } from "node:crypto";
import type { MissionIdentityEvidence } from "../../../src/types/association";
export function parseIdentityEvidence(
  line: string,
): MissionIdentityEvidence | null {
  const timestamp = /^<(\d{4}-\d{2}-\d{2}T[^>]+)>/.exec(line)?.[1];
  const at =
    timestamp && Number.isFinite(Date.parse(timestamp))
      ? new Date(timestamp).toISOString()
      : null;
  let item: Omit<MissionIdentityEvidence, "id"> | null = null;
  if (
    /<CLocalMissionPhaseMarker::CreateMarker> Creating objective marker:/i.test(
      line,
    )
  ) {
    const missionId = /\bmissionId \[([0-9a-f-]{36})\]/i.exec(line)?.[1],
      objectiveId = /\bobjectiveId \[([^\]\r\n]{1,256})\]/i.exec(line)?.[1],
      template = /\bcontract \[([A-Za-z0-9_]{1,512})\]/.exec(line)?.[1],
      definition = /\bcontractDefinitionId\[([0-9a-f-]{36})\]/i.exec(line)?.[1];
    if (
      missionId &&
      objectiveId &&
      template &&
      definition &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(definition) &&
      !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(definition)
    )
      item = {
        kind: "Marker",
        missionId: missionId.toLowerCase(),
        objectiveId,
        template,
        definitionId: definition.toLowerCase(),
        at,
      };
  } else if (
    /<(?:ObjectiveUpserted|ObjectiveComplete)> Received (?:ObjectiveUpserted|ObjectiveComplete) push message for:/i.test(
      line,
    )
  ) {
    const missionId = /\bmission_id ([0-9a-f-]{36})\b/i.exec(line)?.[1],
      objectiveId = /\bobjective_id ([A-Za-z0-9_-]{1,256})\b/i.exec(line)?.[1],
      state = /\bstate (MISSION_OBJECTIVE_STATE_COMPLETED)\b/.exec(line)?.[1];
    if (missionId && objectiveId && state)
      item = {
        kind: "ObjectiveState",
        missionId: missionId.toLowerCase(),
        objectiveId,
        state,
        at,
      };
  }
  if (
    !item ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.missionId) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(item.missionId)
  )
    return null;
  return {
    ...item,
    id: createHash("sha256")
      .update(
        JSON.stringify([
          item.kind,
          item.missionId,
          item.objectiveId,
          item.template,
          item.definitionId,
          item.state,
        ]),
      )
      .digest("hex"),
  };
}
