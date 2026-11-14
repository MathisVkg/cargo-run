/** Opt-in, bounded startup timings. No user paths, records or screenshots are logged. */
const enabled = process.env.CARGO_RUN_STARTUP_METRICS === "1";
let remaining = 40;
export function startupMark(stage: string, started?: number): void {
  if (!enabled || remaining-- <= 0) return;
  console.info(
    "[startup] " +
      JSON.stringify({
        stage,
        elapsedMs: Math.round(process.uptime() * 1000),
        ...(started === undefined
          ? {}
          : { durationMs: Math.round(performance.now() - started) }),
      }),
  );
}
