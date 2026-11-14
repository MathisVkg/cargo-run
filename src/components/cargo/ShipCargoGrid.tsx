import { number } from "../../utils/format";
export function ShipCargoGrid({
  capacity,
  planned,
  ship,
}: {
  capacity: number;
  planned: number;
  ship: string;
}) {
  const cells = 48,
    filled =
      capacity > 0
        ? Math.min(cells, Math.ceil((planned / capacity) * cells))
        : 0;
  return (
    <section
      className="panel ship-schematic"
      aria-label="Ship cargo capacity schematic"
    >
      <h2>{ship}</h2>
      <p>Capacity schematic</p>
      <div
        className="schematic-grid"
        role="img"
        aria-label={
          number(planned) +
          " SCU planned against " +
          number(capacity) +
          " SCU capacity. Symbolic grid, not ship geometry or loaded cargo."
        }
      >
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className={i < filled ? "planned" : ""} />
        ))}
      </div>
      <strong>{number(capacity)} SCU capacity</strong>
      <p className="muted">
        Symbolic 2D grid. Geometry unavailable; cells are proportional capacity,
        not container positions or physically loaded cargo.
      </p>
    </section>
  );
}
