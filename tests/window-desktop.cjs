// Actual separate-process Windows capture; only the native game-identity metadata is injected in this test.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  ts = require("typescript");
fs.mkdirSync("work", { recursive: true });
const folder = fs.mkdtempSync(path.resolve("work/window-desktop-"));
fs.writeFileSync(
  path.join(folder, "backend.cjs"),
  ts.transpileModule(
    fs.readFileSync("electron/main/ocr/windowCapture.ts", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText,
);
fs.copyFileSync(
  path.resolve("tests/native/WindowCaptureHarness.cjs"),
  path.join(folder, "main.cjs"),
);
fs.copyFileSync(
  path.resolve("tests/native/WindowSurfaceFixture.cjs"),
  path.join(folder, "target.cjs"),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [path.join(folder, "main.cjs")], {
  env,
  stdio: "inherit",
  windowsHide: false,
});
child.on("error", (e) => {
  console.error(e);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode =
    code === 0 && !fs.existsSync(path.join(folder, "result.json"))
      ? 1
      : (code ?? 1);
});
