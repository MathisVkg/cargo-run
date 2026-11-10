import { numericConfidenceFloor } from "./quantity";
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
        const lines: OcrResult["lines"] = (result.data.blocks ?? [])
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
            words: l.words.map((w) => ({
              text: w.text,
              box: {
                x: w.bbox.x0,
                y: w.bbox.y0,
                width: w.bbox.x1 - w.bbox.x0,
                height: w.bbox.y1 - w.bbox.y0,
              },
              confidence:
                Number.isFinite(w.confidence) &&
                w.confidence >= 0 &&
                w.confidence <= 100
                  ? w.confidence
                  : null,
            })),
            confidence:
              Number.isFinite(l.confidence) &&
              l.confidence >= 0 &&
              l.confidence <= 100
                ? l.confidence
                : null,
          }));
        // Re-read a bounded numeric region from pixels, rather than counting two
        // representations of the same low-confidence token as independent evidence.
        let checked = 0;
        for (const line of lines) {
          if (!/\bDeliver\b/i.test(line.text) || !/\bSCU\b/i.test(line.text))
            continue;
          const word = line.words?.find(
            (w) =>
              /^\d+(?:,\d{3})*(?:\.\d+)?[/⁄／]\d+(?:,\d{3})*(?:\.\d+)?$/.test(
                w.text,
              ) &&
              w.confidence !== null &&
              w.confidence < numericConfidenceFloor,
          );
          if (!word || checked++ >= 8) continue;
          const padding = Math.max(2, Math.round(word.box.height * 0.15));
          const box = {
            x: Math.max(0, word.box.x - padding),
            y: Math.max(0, word.box.y - padding),
            width: Math.min(
              width - Math.max(0, word.box.x - padding),
              word.box.width + padding * 2,
            ),
            height: Math.min(
              height - Math.max(0, word.box.y - padding),
              word.box.height + padding * 2,
            ),
          };
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_LINE,
          });
          try {
            const check = await worker.recognize(
              image,
              {
                rectangle: {
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                },
              },
              { text: true },
            );
            line.quantityCheck = {
              text: check.data.text.trim(),
              confidence: check.data.confidence,
              box,
            };
          } catch (e) {
            line.quantityCheck = {
              text: "",
              confidence: 0,
              box,
              error: String(e).slice(0, 200),
            };
          } finally {
            await worker.setParameters({
              tessedit_pageseg_mode: PSM.SPARSE_TEXT,
            });
          }
        }
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
