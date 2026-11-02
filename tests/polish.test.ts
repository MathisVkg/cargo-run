import { describe, it, expect } from "vitest";
import { navigationModeForWidth } from "../src/utils/navigation";
import {
  validatePreferences,
  defaultPreferences,
} from "../src/types/preferences";
import { TrackingService } from "../electron/main/trackingService";
import { CargoDatabase } from "../electron/main/storage/database";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("Adaptive navigation preferences", () => {
  it("constrains the effective layout without changing the wide preference", () => {
    for (const preference of ["expanded", "compact", "hidden"] as const) {
      expect(navigationModeForWidth(1099, preference)).toBe("hidden");
      expect(navigationModeForWidth(1100, preference)).toBe("hidden");
      expect(navigationModeForWidth(1100, preference, true)).toBe("compact");
      expect(navigationModeForWidth(1200, preference)).toBe(
        preference === "hidden" ? "hidden" : "compact",
      );
      expect(navigationModeForWidth(1399, preference)).toBe(
        preference === "hidden" ? "hidden" : "compact",
      );
      expect(navigationModeForWidth(1400, preference)).toBe(preference);
      expect(navigationModeForWidth(1440, preference)).toBe(preference);
    }
    expect(defaultPreferences().navigationMode).toBe("expanded");
  });
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
      user_version: 7,
    });
    db.close();
  });
});
