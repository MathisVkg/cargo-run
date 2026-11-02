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
      acceptedAt: event.timestamp,
      cargoObjectives: [],
    };
    return {
      contracts: [...contracts, contract],
      resolved: true,
      createdId: id,
    };
  }
  if (!existing) return { contracts, resolved: false };
  if (
    (event.kind === "Completed" || event.kind === "Abandoned") &&
    existing.status !== "Active" &&
    !(
      existing.status === event.kind &&
      (!existing.lifecycle || (!existing.lifecycle.eventAt && event.timestamp))
    )
  )
    return { contracts, resolved: true };
  if (event.kind === "Completed" || event.kind === "Abandoned")
    return {
      resolved: true,
      contracts: contracts.map((c) =>
        c.id !== existing.id
          ? c
          : {
              ...c,
              status: event.kind as "Completed" | "Abandoned",
              completedAt: event.timestamp ?? undefined,
              lifecycle: {
                missionId: event.missionId,
                eventId: event.id,
                kind: event.kind as "Completed" | "Abandoned",
                eventAt: event.timestamp,
                receivedAt: event.receivedAt,
              },
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
    ...previous,
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
