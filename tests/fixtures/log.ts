export const missionA = "a50caaaa-aa44-4c3c-9be5-ccff802e525b";
export const missionB = "96db3a01-4210-419d-ad38-45795e26324d";
export const objectiveA = "dropoff_60592172-f98c-42b3-b0fc-a7eacd3971e72_0";
export function notification(
  message: string,
  missionId = missionA,
  objectiveId?: string,
  time = "2026-10-19T15:00:00.000Z",
): string {
  return (
    "<" +
    time +
    '> <SHUDEvent_OnNotification> Added notification "' +
    message +
    ':" ... MissionId: [' +
    missionId +
    "]" +
    (objectiveId ? ", ObjectiveId: [" + objectiveId + "]" : "")
  );
}
export const accepted = () =>
  notification(
    "Contract Accepted: Rookie Rank - Direct Extra Small Cargo Haul",
  );
export const objective = (
  delivered = 0,
  required = 11,
  destination = "NB Int Spaceport",
  id = objectiveA,
) =>
  notification(
    "New Objective: Deliver " +
      delivered +
      "/" +
      required +
      " SCU of Quartz to " +
      destination,
    missionA,
    id,
  );
export const completed = () =>
  notification(
    "Contract Complete: Rookie Rank - Direct Extra Small Cargo Haul",
    missionA,
    undefined,
    "2026-10-19T16:00:00.000Z",
  );
