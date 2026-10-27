const { app, BrowserWindow, screen } = require("electron"),
  fs = require("fs"),
  path = require("path");
app.setPath("userData", path.join(__dirname, "target-profile"));
app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay(),
    b = d.bounds;
  const w = new BrowserWindow({
    ...b,
    frame: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await w.loadURL(
    "data:text/html," +
      encodeURIComponent(
        '<body style="margin:0;background:#103050;color:white;font:40px Segoe UI"><h1>Synthetic window capture test</h1><p>Window surface behind the overlap</p></body>',
      ),
  );
  w.setTitle("Cargo Run window source fixture");
  fs.writeFileSync(
    path.join(__dirname, "ready.json"),
    JSON.stringify({
      handle: w.getNativeWindowHandle().readBigUInt64LE().toString(),
      pid: process.pid,
      width: Math.round(b.width * d.scaleFactor),
      height: Math.round(b.height * d.scaleFactor),
      bounds: b,
      scale: d.scaleFactor,
    }),
  );
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(__dirname, "close"))) {
      clearInterval(timer);
      app.quit();
    }
  }, 100);
});
