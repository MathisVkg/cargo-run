import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { CaptureSettings, OcrSnapshot } from "../types/ocr";
interface OcrState {
  state: OcrSnapshot | null;
  error: string | null;
  busy: boolean;
  beginRecording(): Promise<void>;
  endRecording(): Promise<void>;
  probeShortcut(): Promise<void>;
  resetShortcutDiagnostics(): Promise<void>;
  reparse(id: string): Promise<void>;
  configurePolicy(
    policy: import("../types/capturePolicy").CapturePolicy,
  ): Promise<void>;
  cleanup(): Promise<void>;
  refresh(): Promise<void>;
  configure(settings: CaptureSettings): Promise<void>;
  capture(): Promise<void>;
  retry(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  displays(): Promise<void>;
}
function receive(state: OcrSnapshot) {
  if (
    !ocrStore.getState().state ||
    state.revision >= ocrStore.getState().state!.revision
  )
    ocrStore.setState({ state });
}
async function action(run: () => Promise<OcrSnapshot>) {
  ocrStore.setState({ busy: true, error: null });
  try {
    receive(await run());
  } catch (error) {
    ocrStore.setState({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    ocrStore.setState({ busy: false });
  }
}
export const ocrStore = createStore<OcrState>(() => ({
  beginRecording: () => action(() => window.cargoRun.ocrBeginRecording()),
  endRecording: () => action(() => window.cargoRun.ocrEndRecording()),
  probeShortcut: () => action(() => window.cargoRun.ocrProbeShortcut()),
  resetShortcutDiagnostics: () =>
    action(() => window.cargoRun.ocrResetShortcutDiagnostics()),
  reparse: (id) => action(() => window.cargoRun.ocrReparse(id)),
  configurePolicy: (policy) =>
    action(() => window.cargoRun.ocrConfigurePolicy(policy)),
  cleanup: () => action(() => window.cargoRun.ocrCleanup()),
  state: null,
  error: null,
  busy: false,
  refresh: () => action(() => window.cargoRun.ocrState()),
  configure: (settings) => action(() => window.cargoRun.ocrConfigure(settings)),
  capture: () => action(() => window.cargoRun.ocrCapture()),
  retry: (id) => action(() => window.cargoRun.ocrRetry(id)),
  remove: (id) => action(() => window.cargoRun.ocrDelete(id)),
  clear: () => action(() => window.cargoRun.ocrClear()),
  displays: () => action(() => window.cargoRun.ocrDisplays()),
}));
export function initializeOcrStore() {
  const dispose = window.cargoRun.onOcrState(receive);
  void ocrStore.getState().refresh();
  return dispose;
}
export function useOcrStore<T>(selector: (state: OcrState) => T) {
  return useStore(ocrStore, selector);
}
export const captureImage = (id: string, thumbnail = false) =>
  "cargo-capture://" + (thumbnail ? "thumb" : "image") + "/" + id;
