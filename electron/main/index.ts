import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  dialog,
  protocol,
} from "electron";
import { LocalDataManager } from "./storage/maintenance";
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
let maintenance: LocalDataManager;
let maintenanceEpoch = 0;

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
    minWidth: 480,
    minHeight: 560,
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
  win.on("blur", () => {
    if (ocr) ocr.endShortcutRecording();
  });
  win.webContents.on("did-start-loading", () => {
    if (ocr) ocr.endShortcutRecording();
  });
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
      const connectOcr = () => {
        ocr.onRecognized = (id) => service.processScan(id);
        ocr.onChange = (state) => {
          if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send("ocr:state", state);
        };
      };
      connectOcr();
      service.onLiveAcceptance = (event) => ocr.automatic.accept(event);
      service.onMonitoringChange = (running) =>
        ocr.automatic.setMonitoring(running);
      registerCaptureProtocol(() => ocr);
      let ocrRevision = 0;
      maintenance = new LocalDataManager(
        service,
        join(app.getPath("userData"), "captures"),
        {
          pause: async () => {
            await ocr.close();
            ocrRevision = ocr.snapshot().revision;
          },
          resume: async () => {
            ocr = createOcrQueue(service.database);
            ocr.continueRevision(ocrRevision);
            connectOcr();
            await ocr.initialize(true);
          },
        },
      );
      await ocr.initialize();
      service.onChange = (state) => {
        ocr.refreshEvidence();
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
          if (
            maintenance.busy &&
            !["cargo:getState", "ocr:state", "data:stats"].includes(channel)
          )
            throw Error("Local data maintenance is in progress.");
          const epoch = maintenanceEpoch;
          if (!serial) return action(payload);
          const next = trackingQueue.then(() => {
            if (epoch !== maintenanceEpoch || maintenance.busy)
              throw Error("This request predates data maintenance; retry it.");
            return action(payload);
          });
          trackingQueue = next.catch(() => {});
          return next;
        });
      };
      register("data:stats", () => maintenance.stats());
      register("data:preview", (mode) => maintenance.preview(mode));
      register(
        "data:execute",
        (input) => {
          maintenanceEpoch++;
          return maintenance.execute(input);
        },
        true,
      );
      register("ocr:beginRecording", () => ocr.beginShortcutRecording());
      register("ocr:endRecording", () => ocr.endShortcutRecording());
      register("ocr:probeShortcut", () => ocr.probeShortcut());
      register("ocr:resetShortcutDiagnostics", () =>
        ocr.resetShortcutDiagnostics(),
      );
      register("ocr:reparse", (id) => ocr.reparse(id));
      register("ocr:reprocess", (id) => ocr.reprocess(id));
      register("ocr:reprocessEditor", (id) => ocr.reprocess(id, true));
      register("ocr:policy", (input) => ocr.configurePolicy(input));
      register("ocr:cleanup", () => ocr.cleanup());
      register("ocr:issue", (input) => service.scanIssue(input), true);
      register(
        "ocr:resolveIssue",
        (input) => {
          const r = service.resolveScan(input);
          ocr.refreshEvidence();
          return r;
        },
        true,
      );
      register("ocr:prepareReview", (input) => service.prepareOcr(input), true);
      register(
        "ocr:confirmReview",
        (input) => {
          const result = service.confirmOcr(input);
          ocr.refreshEvidence();
          return result;
        },
        true,
      );
      register("ocr:evidence", (id) =>
        service.contractEvidence(id).map((link) => {
          let imageAvailable = false;
          try {
            imageAvailable = !!ocr.imagePath(link.captureId);
          } catch {
            /* Expired capture keeps minimal evidence. */
          }
          return { ...link, imageAvailable };
        }),
      );
      register(
        "ocr:unlink",
        (input) => {
          const state = service.unlinkEvidence(input);
          ocr.refreshEvidence();
          return state;
        },
        true,
      );
      register(
        "cargo:completeContract",
        (id) => service.completeContract(id),
        true,
      );
      register("ocr:state", () => ocr.snapshot());
      register("ocr:configure", (settings) => ocr.configure(settings));
      register("ocr:capture", () => ocr.capture("Manual"));
      register("ocr:captureEditor", () => ocr.captureEditor());
      register("ocr:retry", (id) => ocr.retry(id));
      register("ocr:delete", (id) => ocr.delete(id));
      register("ocr:clear", () => ocr.clear());
      register("ocr:displays", () => ocr.refreshDisplays());
      register("cargo:getState", () => service.snapshot());
      register(
        "lifecycle:resolve",
        (input) => service.resolveLifecycle(input),
        true,
      );
      register("lifecycle:history", (id) => service.lifecycleHistory(id));
      register("cargo:workflow", (input) => service.setWorkflow(input), true);
      register("cargo:checklist", (input) => service.checklist(input), true);
      register("cargo:progress", (input) => service.cargoProgress(input), true);
      register("cargo:activity", (id) => service.cargoActivity(id));
      register("cargo:saveContract", (input) => service.saveContract(input));
      register("cargo:selectShip", (id) => service.selectShip(id));
      register("cargo:preferences", (patch) => service.setPreferences(patch));
      register("cargo:abandonContract", (id) => service.abandonContract(id));
      register("cargo:finishRun", (input) => service.finishRun(input), true);
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
