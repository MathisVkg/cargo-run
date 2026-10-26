const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
if (process.platform !== "win32")
  throw Error("Raw Input prototype requires Windows x64.");
const directory = path.resolve("resources/native");
execFileSync(
  path.join(
    process.env.SystemRoot || "C:/Windows",
    "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
  ),
  [
    "/nologo",
    "/target:exe",
    "/platform:x64",
    "/optimize+",
    "/reference:System.Windows.Forms.dll",
    "/win32manifest:" + path.join(directory, "capture.manifest"),
    "/out:" + path.join(directory, "CargoRun.RawInputHost.exe"),
    path.join(directory, "RawInputHost.cs"),
  ],
  { windowsHide: true, stdio: "inherit" },
);
if (!fs.existsSync(path.join(directory, "CargoRun.RawInputHost.exe")))
  throw Error("Raw Input build did not produce an executable.");
console.log(
  "Optional development Raw Input prototype compiled. It is not enabled or packaged.",
);
