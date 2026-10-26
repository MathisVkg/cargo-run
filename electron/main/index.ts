import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  dialog,
  protocol,
} from "electron";
import { join } from "node:path";
import { TrackingService } from "./trackingService";
import { createOcrQueue, registerCaptureProtocol } from "./ocr/integration";
import type { OcrQueue } from "./ocr/queue";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "cargo-capture",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let ocr: OcrQueue;
let service: TrackingService;
let trackingQueue: Promise<unknown> = Promise.resolve();
let quitting = false;

let mainWindow: BrowserWindow | null = null;
const isTrusted = (event: Electron.IpcMainInvokeEvent): boolean => {
  return (
    !!mainWindow &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame
  );
};
function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: "Cargo Run",
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: "#141820",
    show: false,
    icon: nativeImage.createFromPath(
      app.isPackaged
        ? join(process.resourcesPath, "icon.ico")
        : join(__dirname, "../../resources/icon.ico"),
    ),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  const win = mainWindow;
  win.setMenu(null);
  win.once("ready-to-show", () => win.show());
  win.on("maximize", () => win.webContents.send("window:maximized", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized", false));
  win.on("closed", () => {
    mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
}
app.setName("Cargo Run");
app.setAppUserModelId("com.cargorun.desktop");
if (
  !app.isPackaged &&
  process.env.NODE_ENV === "test" &&
  process.env.CARGO_RUN_TEST_USER_DATA
)
  app.setPath("userData", process.env.CARGO_RUN_TEST_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      service = new TrackingService(
        join(app.getPath("userData"), "cargo-run.sqlite"),
      );
      ocr = createOcrQueue(service.database);
      ocr.onChange = (state) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send("ocr:state", state);
      };
      registerCaptureProtocol(ocr);
      await ocr.initialize();
      service.onChange = (state) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send("cargo:state", state);
      };
      const register = (
        channel: string,
        action: (payload: unknown) => unknown,
        serial = false,
      ): void => {
        ipcMain.handle(channel, (event, payload: unknown) => {
          if (!isTrusted(event)) throw new Error("Untrusted Cargo Run request");
          if (!serial) return action(payload);
          const next = trackingQueue.then(() => action(payload));
          trackingQueue = next.catch(() => {});
          return next;
        });
      };
      register("ocr:state", () => ocr.snapshot());
      register("ocr:configure", (settings) => ocr.configure(settings));
      register("ocr:capture", () => ocr.capture("Manual"));
      register("ocr:retry", (id) => ocr.retry(id));
      register("ocr:delete", (id) => ocr.delete(id));
      register("ocr:clear", () => ocr.clear());
      register("ocr:displays", () => ocr.refreshDisplays());
      register("cargo:getState", () => service.snapshot());
      register("cargo:saveContract", (input) => service.saveContract(input));
      register("cargo:selectShip", (id) => service.selectShip(id));
      register("cargo:abandonContract", (id) => service.abandonContract(id));
      register("cargo:finishRun", () => service.finishRun());
      register("cargo:removeSamples", () => service.removeSamples());
      register("cargo:loadSamples", () => service.loadSamples());
      register(
        "tracking:chooseLog",
        async () => {
          if (!mainWindow) throw new Error("Main window is unavailable");
          const result = await dialog.showOpenDialog(mainWindow, {
            title: "Select Star Citizen Game.log",
            properties: ["openFile"],
            filters: [{ name: "Game.log", extensions: ["log"] }],
          });
          return result.canceled || !result.filePaths[0]
            ? service.snapshot()
            : service.setLogPath(result.filePaths[0]);
        },
        true,
      );
      register("tracking:start", () => service.start(), true);
      register("tracking:stop", () => service.stop(), true);
      register("tracking:import", () => service.importHistory(), true);
      await service.resume();
      ipcMain.handle("window:command", (event, command: unknown) => {
        if (!isTrusted(event) || !mainWindow)
          throw new Error("Untrusted window request");
        switch (command) {
          case "minimize":
            mainWindow.minimize();
            break;
          case "toggleMaximize":
            if (mainWindow.isMaximized()) mainWindow.unmaximize();
            else mainWindow.maximize();
            break;
          case "close":
            mainWindow.close();
            break;
          default:
            throw new Error("Unsupported window command");
        }
      });
      ipcMain.handle("window:isMaximized", (event) => {
        if (!isTrusted(event)) throw new Error("Untrusted window request");
        return mainWindow?.isMaximized() ?? false;
      });
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Cargo Run could not open its database",
        error instanceof Error ? error.message : String(error),
      );
      app.exit(1);
    });
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on("before-quit", (event) => {
  if (quitting || !service) return;
  event.preventDefault();
  quitting = true;
  void trackingQueue
    .then(async () => {
      if (ocr) await ocr.close();
      await service.close();
    })
    .finally(() => app.quit());
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
