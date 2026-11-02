import { recordedOnboard } from "../../stores/selectors";
import { useMemo, useState } from "react";
import { ChevronDown, Star, Search } from "lucide-react";
import { useCargoStore, cargoStore } from "../../stores/useCargoStore";
import { filterShips, shipCatalog } from "../../data/ships";
import { Overlay } from "../ui/Overlay";
import { number } from "../../utils/format";
export function ShipSelector() {
  const pending = useCargoStore((s) => s.pending);
  const contracts = useCargoStore((s) => s.contracts);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const ships = useCargoStore((s) => s.ships),
    selected = useCargoStore((s) => s.selectedShipId),
    select = useCargoStore((s) => s.selectShip),
    prefs = useCargoStore((s) => s.preferences),
    setPreferences = useCargoStore((s) => s.setPreferences);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [manufacturer, setManufacturer] = useState(""),
    [concepts, setConcepts] = useState(false);
  const ship = ships.find((s) => s.id === selected);
  const manufacturers = useMemo(
    () => [...new Set(ships.map((s) => s.manufacturer))].sort(),
    [ships],
  );
  const matches = useMemo(
    () =>
      filterShips(ships, query, manufacturer, concepts).sort((a, b) => {
        const rank = (id: string) =>
          prefs.favoriteShipIds.includes(id)
            ? 0
            : prefs.recentShipIds.includes(id)
              ? 1
              : 2;
        return (
          rank(a.id) - rank(b.id) ||
          (rank(a.id) === 1
            ? prefs.recentShipIds.indexOf(a.id) -
              prefs.recentShipIds.indexOf(b.id)
            : a.name.localeCompare(b.name))
        );
      }),
    [ships, query, manufacturer, concepts, prefs],
  );
  const eligibleFlightReady = useMemo(
    () => filterShips(ships, query, manufacturer, false).length,
    [ships, query, manufacturer],
  );
  const eligibleAll = useMemo(
    () => filterShips(ships, query, manufacturer, true).length,
    [ships, query, manufacturer],
  );
  return (
    <>
      <button
        className="ship-select-button"
        aria-label="Select ship"
        onClick={() => setOpen(true)}
        title={ship?.name}
      >
        <span>
          {ship?.name ?? "Unavailable saved ship"} —{" "}
          {ship ? number(ship.cargoCapacitySCU) : "Unknown"} SCU
        </span>
        <ChevronDown size={14} />
      </button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        title="Select ship"
        subtitle="OFFLINE FLEET CATALOG"
        side="center"
      >
        <div className="ship-selector-body">
          <div className="ship-filters">
            <label>
              <span>
                <Search size={14} /> Search ships
              </span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, manufacturer or SCU"
              />
            </label>
            <label>
              Manufacturer
              <select
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              >
                <option value="">All manufacturers</option>
                {manufacturers.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={concepts}
              onChange={(e) => setConcepts(e.target.checked)}
            />{" "}
            Include concept and other non-flight-ready ships
          </label>
          <p className="form-note">
            Favorites first, then recently selected. {matches.length} matching
            ships.
          </p>
          <p className="ship-filter-status" role="status">
            {concepts
              ? eligibleAll - eligibleFlightReady > 0
                ? eligibleAll -
                  eligibleFlightReady +
                  " additional non-flight-ready ships match these filters."
                : "No additional non-flight-ready ships match these filters."
              : "Flight-ready and saved custom ships only."}
          </p>
          <div className="ship-results" role="list" aria-label="Ship catalog">
            {matches.map((s) => (
              <div
                className={
                  "ship-result " + (s.id === selected ? "selected" : "")
                }
                role="listitem"
                key={s.id}
              >
                <button
                  className="ship-result-select"
                  aria-pressed={s.id === selected}
                  aria-label={"Select " + s.name}
                  onClick={async () => {
                    if (
                      s.id !== selected &&
                      recordedOnboard(contracts, selected) > 0
                    ) {
                      setSwitchTo(s.id);
                      return;
                    }
                    await select(s.id);
                    if (cargoStore.getState().selectedShipId === s.id)
                      setOpen(false);
                  }}
                >
                  <strong>{s.name}</strong>
                  <small>
                    {s.manufacturer} · {s.availability ?? "Saved custom entry"}
                    {prefs.recentShipIds.includes(s.id) ? " · Recent" : ""}
                  </small>
                  <span className="numeric">
                    {number(s.cargoCapacitySCU)} SCU
                  </span>
                </button>
                <button
                  className="icon-button favorite"
                  disabled={pending > 0}
                  aria-label={"Favorite " + s.name}
                  aria-pressed={prefs.favoriteShipIds.includes(s.id)}
                  onClick={() =>
                    void setPreferences({
                      favoriteShipIds: prefs.favoriteShipIds.includes(s.id)
                        ? prefs.favoriteShipIds.filter((id) => id !== s.id)
                        : [...prefs.favoriteShipIds, s.id],
                    })
                  }
                >
                  <Star
                    size={17}
                    fill={
                      prefs.favoriteShipIds.includes(s.id)
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              </div>
            ))}
          </div>
          {!matches.length && <p>No ships match these filters.</p>}
          <p className="form-note">
            Star Citizen Wiki · {shipCatalog.version} ·{" "}
            {shipCatalog.coverage.flightReady} flight ready /{" "}
            {shipCatalog.coverage.eligible} positive-SCU entries. Cargo capacity
            is a planning reference; recorded cargo stays assigned to its ship
            when switching. Data: CC BY-SA 4.0.
          </p>
        </div>
      </Overlay>
      <Overlay
        open={!!switchTo}
        onClose={() => setSwitchTo(null)}
        title="Keep cargo on its current ship?"
        subtitle="SHIP SELECTION"
        side="center"
      >
        <div className="dialog-body">
          {number(recordedOnboard(contracts, selected))} SCU remains recorded on{" "}
          {ship?.name}. Switching does not transfer cargo. Use Manifest to
          inspect all ship allocations.
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setSwitchTo(null)}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={async () => {
              if (switchTo) {
                await select(switchTo);
                setSwitchTo(null);
                setOpen(false);
              }
            }}
          >
            Switch without transferring cargo
          </button>
        </div>
      </Overlay>
    </>
  );
}
