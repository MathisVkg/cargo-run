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
  PSM: { SPARSE_TEXT: 11, SINGLE_LINE: 7 },
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
  it("recognizes a bounded numeric pixel region separately and restores full-screen page segmentation", async () => {
    const provider = new OfflineTesseract((name) => "/local/" + name);
    const box = { x0: 120, y0: 100, x1: 180, y1: 124 };
    mocks.worker.recognize.mockImplementationOnce(async () => ({
      data: {
        text: "Deliver 0/12 SCU of Tin to Port",
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    text: "Deliver 0/12 SCU of Tin to Port",
                    bbox: { x0: 10, y0: 100, x1: 450, y1: 124 },
                    confidence: 93,
                    words: [{ text: "0/12", bbox: box, confidence: 69 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    mocks.worker.recognize.mockImplementationOnce(async () => ({
      data: { text: "0/12\n", confidence: 96 },
    }));
    const r = await provider.recognize(Buffer.from("owned image"), 1920, 1080);
    expect(r.lines[0].text).toBe("Deliver 0/12 SCU of Tin to Port");
    expect(r.lines[0].quantityCheck).toMatchObject({
      text: "0/12",
      confidence: 96,
    });
    const call = mocks.worker.recognize.mock.calls.at(-1) as unknown[];
    expect(call[1]).toEqual({
      rectangle: { left: 116, top: 96, width: 68, height: 32 },
    });
    expect(mocks.worker.setParameters.mock.calls.at(-1)).toEqual([
      { tessedit_pageseg_mode: 11 },
    ]);
    await provider.close();
  });
});
