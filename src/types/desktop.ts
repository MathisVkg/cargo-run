import type { AppSnapshot, SaveContractRequest } from "./tracking";
export interface DesktopBridge {
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
