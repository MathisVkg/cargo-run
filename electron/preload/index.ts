import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../../src/types/desktop";
import type { AppSnapshot } from "../../src/types/tracking";
const bridge: DesktopBridge = {
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
