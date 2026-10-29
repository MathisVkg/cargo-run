import type { AppSnapshot, SaveContractRequest } from "./tracking";
import type { OcrSnapshot, CaptureSettings } from "./ocr";
export interface DesktopBridge {
  prepareOcr(
    input: import("./review").PrepareReview,
  ): Promise<import("./review").OcrReview>;
  confirmOcr(
    input: import("./review").ConfirmReview,
  ): Promise<import("./review").ReviewResult>;
  contractEvidence(id: string): Promise<import("./review").EvidenceLink[]>;
  unlinkEvidence(input: {
    contractId: string;
    captureId: string;
  }): Promise<AppSnapshot>;
  completeContract(id: string): Promise<AppSnapshot>;
  ocrBeginRecording(): Promise<OcrSnapshot>;
  ocrEndRecording(): Promise<OcrSnapshot>;
  ocrProbeShortcut(): Promise<OcrSnapshot>;
  ocrResetShortcutDiagnostics(): Promise<OcrSnapshot>;
  ocrReparse(id: string): Promise<OcrSnapshot>;
  ocrConfigurePolicy(
    policy: import("./capturePolicy").CapturePolicy,
  ): Promise<OcrSnapshot>;
  ocrCleanup(): Promise<OcrSnapshot>;
  ocrState(): Promise<OcrSnapshot>;
  ocrConfigure(settings: CaptureSettings): Promise<OcrSnapshot>;
  ocrCapture(): Promise<OcrSnapshot>;
  ocrRetry(id: string): Promise<OcrSnapshot>;
  ocrDelete(id: string): Promise<OcrSnapshot>;
  ocrClear(): Promise<OcrSnapshot>;
  ocrDisplays(): Promise<OcrSnapshot>;
  onOcrState(callback: (state: OcrSnapshot) => void): () => void;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximized(callback: (maximized: boolean) => void): () => void;
  getState(): Promise<AppSnapshot>;
  saveContract(request: SaveContractRequest): Promise<AppSnapshot>;
  selectShip(id: string): Promise<AppSnapshot>;
  abandonContract(id: string): Promise<AppSnapshot>;
  finishRun(): Promise<AppSnapshot>;
  removeSamples(): Promise<AppSnapshot>;
  loadSamples(): Promise<AppSnapshot>;
  chooseLog(): Promise<AppSnapshot>;
  startMonitoring(): Promise<AppSnapshot>;
  stopMonitoring(): Promise<AppSnapshot>;
  importHistory(): Promise<AppSnapshot>;
  onState(callback: (state: AppSnapshot) => void): () => void;
}
declare global {
  interface Window {
    cargoRun: DesktopBridge;
  }
}
