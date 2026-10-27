const {
    app,
    BrowserWindow,
    desktopCapturer,
    nativeImage,
  } = require("electron"),
  fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process");
const { WindowCaptureBackend } = require("./backend.cjs");
app.setPath("userData", path.join(__dirname, "profile"));
app.whenReady().then(async () => {
  let child,
    overlay,
    code = 0;
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(process.execPath, [path.join(__dirname, "target.cjs")], {
      env,
      stdio: "ignore",
      windowsHide: false,
    });
    for (
      let i = 0;
      !fs.existsSync(path.join(__dirname, "ready.json")) && i < 100;
      i++
    )
      await new Promise((r) => setTimeout(r, 100));
    const target = JSON.parse(
        fs.readFileSync(path.join(__dirname, "ready.json"), "utf8"),
      ),
      b = target.bounds;
    overlay = new BrowserWindow({
      x: b.x + 100,
      y: b.y + 100,
      width: 600,
      height: 600,
      frame: false,
      alwaysOnTop: true,
      webPreferences: { sandbox: true },
    });
    await overlay.loadURL(
      "data:text/html," +
        encodeURIComponent(
          '<body style="margin:0;background:#ff00ff;height:100vh">Overlap test only</body>',
        ),
    );
    overlay.setTitle("Cargo Run overlap fixture");
    await new Promise((r) => setTimeout(r, 1000));
    const display = {
      available: () => ({ available: true, error: null }),
      displays: async () => [],
      capture: async () => {
        throw Error("Unexpected display fallback");
      },
      feedback: async () => {},
      close: async () => {},
    };
    const backend = new WindowCaptureBackend(
      display,
      {
        windows: async () => [
          { ...target, foreground: false, process: "StarCitizen.exe" },
        ],
        sources: async (size) => {
          const sources = await desktopCapturer.getSources({
            types: ["window"],
            thumbnailSize: size,
          });
          return sources;
        },
      },
      __dirname,
    );
    const result = await backend.capture(
      "00000000-0000-4000-8000-000000000001",
      "auto",
      false,
      { mode: "Window", allowDisplayFallback: false },
    );
    assert.equal(result.width, target.width);
    assert.ok(
      result.height >= target.height * 0.85 && result.height <= target.height,
    );
    assert.equal(result.backend, "Window");
    assert.equal(overlay.isVisible(), true);
    const image = nativeImage.createFromPath(
        path.join(__dirname, "00000000-0000-4000-8000-000000000001.png"),
      ),
      pixels = image.toBitmap(),
      x = Math.round(350 * target.scale),
      y = Math.round(350 * target.scale),
      offset = (y * result.width + x) * 4;
    assert.ok(
      pixels[offset] > 60 && pixels[offset + 2] < 50,
      "Target surface must retain blue content behind the magenta overlap",
    );
    fs.writeFileSync(
      path.join(__dirname, "result.json"),
      JSON.stringify(
        {
          ...result,
          overlapExcluded: true,
          identity: "Synthetic HWND injected in test only",
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS actual separate-process Electron window capture " +
        result.width +
        "x" +
        result.height +
        "; visible overlapping window excluded; actual dimensions retained; no fallback/upscaling. Star Citizen identity/Vulkan not tested.",
    );
  } catch (e) {
    console.error(e);
    code = 1;
  } finally {
    fs.writeFileSync(path.join(__dirname, "close"), "close");
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    if (child)
      await new Promise((r) => {
        child.once("exit", r);
        setTimeout(() => {
          child.kill();
          r();
        }, 2000);
      });
    app.exit(code);
  }
});
