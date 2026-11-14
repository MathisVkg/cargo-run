import { describe, it, expect } from "vitest";
import { validatePreferences } from "../src/types/preferences";
import { TrackingService } from "./helpers/beta";
import { CargoDatabase } from "../electron/main/storage/database";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("Adaptive navigation preferences", () => {
  it("validates navigation changes while ignoring undefined optional patches", () => {
    const ids = new Set(["c2"]);
    for (const navigationMode of ["expanded", "compact", "hidden"])
      expect(validatePreferences({ navigationMode }, ids)).toEqual({
        navigationMode,
      });
    for (const navigationMode of ["auto", "overlay", false, 1, {}, null])
      expect(() => validatePreferences({ navigationMode }, ids)).toThrow();
    expect(validatePreferences({ navigationMode: undefined }, ids)).toEqual({});
  });
  it("adds a default to legacy preferences and preserves favorites and selection through restart", () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "cargo-polish-")),
      "test.sqlite",
    );
    let service = new TrackingService(file);
    service.selectShip("hull-c");
    service.database.setSetting("ui.preferences", {
      dashboardView: "contract",
      favoriteShipIds: ["c2"],
      recentShipIds: ["hull-c"],
    });
    service.database.close();
    service = new TrackingService(file);
    expect(service.snapshot().preferences).toEqual({
      navigationMode: "expanded",
      dashboardView: "contract",
      favoriteShipIds: ["c2"],
      recentShipIds: ["hull-c"],
    });
    service.setPreferences({ navigationMode: "hidden" });
    service.database.close();
    service = new TrackingService(file);
    expect(service.snapshot().preferences.navigationMode).toBe("hidden");
    expect(service.snapshot().preferences.favoriteShipIds).toEqual(["c2"]);
    expect(service.snapshot().selectedShipId).toBe("hull-c");
    service.database.close();
    const db = new CargoDatabase(file);
    expect(db.db.prepare("PRAGMA user_version").get()).toMatchObject({
      user_version: 9,
    });
    db.close();
  });
});
