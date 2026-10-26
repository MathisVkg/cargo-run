import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  worker: {
    setParameters: vi.fn(async () => ({})),
    recognize: vi.fn(() => new Promise(() => {})),
    terminate: vi.fn(async () => ({})),
  },
}));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(async () => mocks.worker),
  OEM: { LSTM_ONLY: 1 },
  PSM: { SPARSE_TEXT: 11 },
}));
import { OfflineTesseract } from "../electron/main/ocr/provider";
describe("local OCR lifecycle", () => {
  it("cancels pending recognition immediately on shutdown", async () => {
    const provider = new OfflineTesseract((name) => "/local/" + name);
    const outcome = provider
      .recognize(Buffer.from("fixture"), 1920, 1080)
      .catch((e) => e);
    await vi.waitFor(() => expect(mocks.worker.recognize).toHaveBeenCalled());
    const before = Date.now();
    await provider.close();
    expect((await outcome).message).toContain("shutdown");
    expect(Date.now() - before).toBeLessThan(1000);
    expect(mocks.worker.terminate).toHaveBeenCalled();
  });
});
