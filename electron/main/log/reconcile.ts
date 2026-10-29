import { createHash } from "node:crypto";
import type { Contract } from "../../../src/types/models";
import type { MissionEvent } from "../../../src/types/tracking";
export function applyMissionEvent(
  contracts: Contract[],
  event: MissionEvent,
): { contracts: Contract[]; resolved: boolean; createdId?: string } {
  const existing = contracts.find(
    (c) => c.missionId === event.missionId && !c.supersededBy,
  );
  const time = event.timestamp ?? event.receivedAt;
  if (event.kind === "Accepted") {
    if (existing) return { contracts, resolved: true };
    const id = "log-" + event.missionId;
    const contract: Contract = {
      id,
      missionId: event.missionId,
      name: event.title!,
      status: "Active",
      source: "Log",
      dataOrigin: "Log",
      payout: null,
      confirmedEarnings: 0,
      acceptedAt: time,
      cargoObjectives: [],
    };
    return {
      contracts: [...contracts, contract],
      resolved: true,
      createdId: id,
    };
  }
  if (!existing) return { contracts, resolved: false };
  if (event.kind === "Completed")
    return {
      resolved: true,
      contracts: contracts.map((c) =>
        c.id !== existing.id
          ? c
          : {
              ...c,
              status: "Completed",
              completedAt: time,
              confirmedEarnings: c.confirmedEarnings,
            },
      ),
    };
  let externalId =
    event.objectiveId ??
    "fallback-" +
      createHash("sha256")
        .update(
          JSON.stringify([
            event.commodity,
            event.destination,
            event.quantitySCU,
          ]),
        )
        .digest("hex");
  let previous = existing.cargoObjectives.find(
    (o) => o.externalObjectiveId === externalId,
  );
  if (!previous) {
    const candidates = existing.cargoObjectives.filter(
      (o) =>
        o.commodity === event.commodity &&
        o.destination === event.destination &&
        o.quantitySCU === event.quantitySCU &&
        (!event.objectiveId ||
          !o.externalObjectiveId ||
          o.externalObjectiveId?.startsWith("fallback-")),
    );
    if (candidates.length > 1) return { contracts, resolved: false };
    if (candidates.length === 1) {
      previous = candidates[0];
      if (!event.objectiveId)
        externalId = previous.externalObjectiveId ?? externalId;
    }
  }
  // Importing earlier events must never regress a newer objective or resurrect a completed mission.
  const stale =
    !!previous?.lastLogEventAt &&
    !!event.timestamp &&
    previous.lastLogEventAt > event.timestamp;
  if (stale) return { contracts, resolved: true };
  const objective = {
    id: previous?.id ?? existing.id + ":" + externalId,
    externalObjectiveId: externalId,
    contractId: existing.id,
    commodity: event.commodity!,
    destination: event.destination!,
    pickupLocation: previous?.pickupLocation ?? "",
    quantitySCU: event.quantitySCU!,
    deliveredSCU: Math.max(previous?.deliveredSCU ?? 0, event.deliveredSCU!),
    lastLogEventAt: event.timestamp ?? previous?.lastLogEventAt,
  };
  return {
    resolved: true,
    contracts: contracts.map((c) =>
      c.id !== existing.id
        ? c
        : {
            ...c,
            cargoObjectives: previous
              ? c.cargoObjectives.map((o) =>
                  o.id === previous.id ? objective : o,
                )
              : [...c.cargoObjectives, objective],
          },
    ),
  };
}
