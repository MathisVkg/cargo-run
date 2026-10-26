import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OcrResult } from "../../../src/types/ocr";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
export interface OcrProvider {
  name: string;
  available(): { available: boolean; error: string | null };
  recognize(image: Buffer, width: number, height: number): Promise<OcrResult>;
  close(): Promise<void>;
}
export class OfflineTesseract implements OcrProvider {
  readonly name = "Tesseract 7 · offline English";
  private worker: Worker | null = null;
  private starting: Promise<Worker> | null = null;
  private closed = false;
  private epoch = 0;
  private cancelActive: (() => void) | null = null;
  private languagePath: string;
  private workerPath: string;
  constructor(resolve: (name: string) => string) {
    this.languagePath = join(
      dirname(resolve("@tesseract.js-data/eng/package.json")),
      "4.0.0_best_int",
    );
    this.workerPath = resolve("tesseract.js/src/worker-script/node/index.js");
  }
  available() {
    const good =
      existsSync(join(this.languagePath, "eng.traineddata.gz")) &&
      existsSync(this.workerPath);
    return {
      available: good,
      error: good
        ? null
        : "Bundled OCR worker or English trained data is missing. Run npm ci and rebuild Cargo Run; no online download is attempted.",
    };
  }
  private async getWorker(): Promise<Worker> {
    if (this.closed) throw Error("OCR provider is shutting down.");
    if (this.worker) return this.worker;
    if (!this.available().available) throw Error(this.available().error!);
    const epoch = this.epoch;
    this.starting ??= createWorker("eng", OEM.LSTM_ONLY, {
      langPath: this.languagePath,
      workerPath: this.workerPath,
      cacheMethod: "none",
      gzip: true,
      errorHandler: () => {},
    })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
        });
        if (this.closed || epoch !== this.epoch) {
          await worker.terminate();
          throw Error("OCR provider stopped.");
        }
        this.worker = worker;
        return worker;
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }
  async recognize(
    image: Buffer,
    width: number,
    height: number,
  ): Promise<OcrResult> {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const run = async () => {
        const worker = await this.getWorker();
        const result = await worker.recognize(
          image,
          {},
          { text: true, blocks: true },
        );
        const lines = (result.data.blocks ?? [])
          .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
          .map((l, i) => ({
            id: "line-" + i,
            text: l.text.trim(),
            box: {
              x: l.bbox.x0,
              y: l.bbox.y0,
              width: l.bbox.x1 - l.bbox.x0,
              height: l.bbox.y1 - l.bbox.y0,
            },
            confidence:
              Number.isFinite(l.confidence) &&
              l.confidence >= 0 &&
              l.confidence <= 100
                ? l.confidence
                : null,
          }));
        return {
          provider: this.name,
          language: "eng",
          text: result.data.text,
          lines,
          width,
          height,
          durationMs: Date.now() - started,
        };
      };
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          this.cancelActive = () =>
            reject(
              Error(
                "OCR interrupted by application shutdown; queued metadata is retained.",
              ),
            );
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error(
                  "Local OCR exceeded 90 seconds. Retry with a clearer, smaller capture.",
                ),
              ),
            90000,
          );
        }),
      ]);
    } catch (error) {
      this.epoch++;
      const worker = this.worker;
      this.worker = null;
      if (worker) await worker.terminate().catch(() => {});
      throw error;
    } finally {
      this.cancelActive = null;
      if (timer) clearTimeout(timer);
    }
  }
  async close() {
    this.closed = true;
    this.epoch++;
    this.cancelActive?.();
    this.cancelActive = null;
    if (this.worker) {
      const worker = this.worker;
      this.worker = null;
      await worker.terminate().catch(() => {});
    }
    if (this.starting) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.starting.catch(() => {}),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 3000);
        }),
      ]);
      if (timer) clearTimeout(timer);
    }
  }
}
