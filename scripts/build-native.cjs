const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
if (process.platform !== "win32")
  throw Error("Cargo Run capture host requires Windows 10/11 x64.");
const directory = path.resolve("resources/native"),
  source = path.join(directory, "CaptureHost.cs"),
  manifest = path.join(directory, "capture.manifest"),
  output = path.join(directory, "CargoRun.CaptureHost.exe");
const compiler = path.join(
  process.env.SystemRoot || "C:/Windows",
  "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
);
if (!fs.existsSync(compiler))
  throw Error(
    "Windows .NET Framework 4.x compiler is missing. Enable/install .NET Framework 4.8, then run npm run native:build.",
  );
if (
  !fs.existsSync(output) ||
  fs.statSync(source).mtimeMs > fs.statSync(output).mtimeMs ||
  fs.statSync(manifest).mtimeMs > fs.statSync(output).mtimeMs
)
  execFileSync(
    compiler,
    [
      "/nologo",
      "/target:exe",
      "/platform:x64",
      "/optimize+",
      "/reference:System.Drawing.dll",
      "/reference:System.Web.Extensions.dll",
      "/win32manifest:" + manifest,
      "/out:" + output,
      source,
    ],
    { stdio: "inherit", windowsHide: true },
  );
function tone(name, notes) {
  const rate = 22050,
    total = notes.reduce((s, n) => s + n[1], 0),
    count = Math.round((rate * total) / 1000),
    pcm = Buffer.alloc(count * 2);
  let index = 0;
  for (const [frequency, ms] of notes) {
    const n = Math.round((rate * ms) / 1000);
    for (let i = 0; i < n && index < count; i++, index++) {
      const fade = Math.min(1, i / (rate * 0.008), (n - i) / (rate * 0.012));
      pcm.writeInt16LE(
        Math.round(
          Math.sin((2 * Math.PI * frequency * i) / rate) *
            2500 *
            Math.max(0, fade),
        ),
        index * 2,
      );
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(
    path.join(directory, name + ".wav"),
    Buffer.concat([header, pcm]),
  );
}
tone("capture-success", [[1050, 90]]);
tone("capture-warning", [
  [380, 100],
  [0, 45],
  [270, 130],
]);
console.log("Windows capture host and confirmation sounds ready.");
