import { describe, it, expect } from "vitest";
import { parseLogLine } from "../electron/main/log/parser";
import {
  accepted,
  objective,
  completed,
  missionA,
  objectiveA,
  notification,
} from "./fixtures/log";
describe("observed notification parser", () => {
  it("extracts acceptance title, MissionId and the log timestamp independently", () => {
    const r = parseLogLine(accepted());
    expect(r.type).toBe("event");
    if (r.type === "event")
      expect(r.event).toMatchObject({
        kind: "Accepted",
        missionId: missionA,
        title: "Rookie Rank - Direct Extra Small Cargo Haul",
        timestamp: "2026-10-19T15:00:00.000Z",
      });
  });
  it("preserves punctuation, quotes and interior colons in titles", () => {
    const title = 'Cargo: "A: B" / West - urgent!';
    const r = parseLogLine(notification("Contract Accepted: " + title));
    if (r.type !== "event") throw Error("Expected event");
    expect(r.event.title).toBe(title);
  });
  it("extracts required/delivered SCU, commodity, destination and ObjectiveId", () => {
    const r = parseLogLine(objective(3));
    if (r.type !== "event") throw Error("Expected event");
    expect(r.event).toMatchObject({
      kind: "Objective",
      missionId: missionA,
      objectiveId: objectiveA,
      quantitySCU: 11,
      deliveredSCU: 3,
      commodity: "Quartz",
      destination: "NB Int Spaceport",
    });
  });
  it("supports optional ObjectiveId without inventing a pickup or payout", () => {
    const r = parseLogLine(
      notification(
        "New Objective: Deliver 0/11 SCU of Quartz to NB Int Spaceport",
      ),
    );
    if (r.type !== "event") throw Error("Expected event");
    expect(r.event.objectiveId).toBeNull();
    expect(r.event).not.toHaveProperty("pickupLocation");
    expect(r.event).not.toHaveProperty("payout");
  });
  it("recognizes completion by MissionId", () => {
    const r = parseLogLine(completed());
    if (r.type !== "event") throw Error("Expected event");
    expect(r.event).toMatchObject({
      kind: "Completed",
      missionId: missionA,
      timestamp: "2026-10-19T16:00:00.000Z",
    });
  });
  it("deduplicates presentation and timestamp differences with a semantic identifier", () => {
    const first = parseLogLine(accepted()),
      second = parseLogLine(
        accepted()
          .replace("15:00:00", "15:00:01")
          .replace("<SHUDEvent_OnNotification>", "<DisplayedText>"),
      );
    if (first.type !== "event" || second.type !== "event")
      throw Error("Expected events");
    expect(first.event.id).toBe(second.event.id);
  });
  it("ignores unrelated and unassociated displayed text, and reports malformed relevant notifications", () => {
    expect(parseLogLine("engine unrelated")).toEqual({ type: "ignore" });
    expect(parseLogLine("Displayed text Contract Accepted: Test")).toEqual({
      type: "ignore",
    });
    expect(
      parseLogLine(
        '<SHUDEvent_OnNotification> Added notification "Contract Accepted: bad:" MissionId: [bad]',
      ),
    ).toMatchObject({ type: "error" });
    expect(parseLogLine(objective(12))).toMatchObject({ type: "error" });
    expect(
      parseLogLine(notification("New Objective: Collect an unsupported thing")),
    ).toMatchObject({ type: "error" });
  });
  it("retains a missing timestamp explicitly and uses receipt time only as a fallback", () => {
    const r = parseLogLine(
      accepted().replace(/<2026[^>]+>/, ""),
      "2026-10-19T20:00:00.000Z",
    );
    if (r.type !== "event") throw Error("Expected event");
    expect(r.event.timestamp).toBeNull();
    expect(r.event.receivedAt).toBe("2026-10-19T20:00:00.000Z");
  });
});
