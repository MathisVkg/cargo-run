// This mode intentionally does not validate native desktop/window capture.
const { execFileSync } = require("node:child_process");
for (const file of [
  "redesign-desktop.cjs",
  "redesign-ocr-desktop.cjs",
  "automatic-desktop.cjs",
  "tracking-desktop.cjs",
]) {
  console.log(
    "ISOLATED synthetic capture adapter: " + file + " (no game access)",
  );
  execFileSync(process.execPath, ["tests/" + file], {
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_RUN_SYNTHETIC_CAPTURE: "1",
      CARGO_RUN_INPUT_PROTOTYPE: "0",
    },
  });
}
