import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../../src/types/desktop";
import type { AppSnapshot } from "../../src/types/tracking";
import type { OcrSnapshot } from "../../src/types/ocr";
const bridge: DesktopBridge = {
  scanIssue: (input) => ipcRenderer.invoke("ocr:issue", input),
  resolveScan: (input) => ipcRenderer.invoke("ocr:resolveIssue", input),
  prepareOcr: (input) => ipcRenderer.invoke("ocr:prepareReview", input),
  confirmOcr: (input) => ipcRenderer.invoke("ocr:confirmReview", input),
  contractEvidence: (id) => ipcRenderer.invoke("ocr:evidence", id),
  unlinkEvidence: (input) => ipcRenderer.invoke("ocr:unlink", input),
  completeContract: (id) => ipcRenderer.invoke("cargo:completeContract", id),
  ocrBeginRecording: () => ipcRenderer.invoke("ocr:beginRecording"),
  ocrEndRecording: () => ipcRenderer.invoke("ocr:endRecording"),
  ocrProbeShortcut: () => ipcRenderer.invoke("ocr:probeShortcut"),
  ocrResetShortcutDiagnostics: () =>
    ipcRenderer.invoke("ocr:resetShortcutDiagnostics"),
  ocrReparse: (id) => ipcRenderer.invoke("ocr:reparse", id),
  ocrConfigurePolicy: (policy) => ipcRenderer.invoke("ocr:policy", policy),
  ocrCleanup: () => ipcRenderer.invoke("ocr:cleanup"),
  ocrState: () => ipcRenderer.invoke("ocr:state"),
  ocrConfigure: (settings) => ipcRenderer.invoke("ocr:configure", settings),
  ocrCapture: () => ipcRenderer.invoke("ocr:capture"),
  ocrRetry: (id) => ipcRenderer.invoke("ocr:retry", id),
  ocrDelete: (id) => ipcRenderer.invoke("ocr:delete", id),
  ocrClear: () => ipcRenderer.invoke("ocr:clear"),
  ocrDisplays: () => ipcRenderer.invoke("ocr:displays"),
  onOcrState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: OcrSnapshot,
    ): void => callback(state);
    ipcRenderer.on("ocr:state", listener);
    return () => ipcRenderer.removeListener("ocr:state", listener);
  },
  minimize: () => ipcRenderer.invoke("window:command", "minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:command", "toggleMaximize"),
  close: () => ipcRenderer.invoke("window:command", "close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximized: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: boolean,
    ): void => callback(value);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
  getState: () => ipcRenderer.invoke("cargo:getState"),
  saveContract: (request) => ipcRenderer.invoke("cargo:saveContract", request),
  selectShip: (id) => ipcRenderer.invoke("cargo:selectShip", id),
  abandonContract: (id) => ipcRenderer.invoke("cargo:abandonContract", id),
  finishRun: () => ipcRenderer.invoke("cargo:finishRun"),
  removeSamples: () => ipcRenderer.invoke("cargo:removeSamples"),
  loadSamples: () => ipcRenderer.invoke("cargo:loadSamples"),
  chooseLog: () => ipcRenderer.invoke("tracking:chooseLog"),
  startMonitoring: () => ipcRenderer.invoke("tracking:start"),
  stopMonitoring: () => ipcRenderer.invoke("tracking:stop"),
  importHistory: () => ipcRenderer.invoke("tracking:import"),
  onState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: AppSnapshot,
    ): void => callback(state);
    ipcRenderer.on("cargo:state", listener);
    return () => ipcRenderer.removeListener("cargo:state", listener);
  },
};
contextBridge.exposeInMainWorld("cargoRun", bridge);
