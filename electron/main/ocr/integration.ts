import { app, globalShortcut, nativeImage, protocol, net } from "electron";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { CargoDatabase } from "../storage/database";
import { CaptureRepository } from "./repository";
import { WindowsCaptureHost } from "./nativeHost";
import { OfflineTesseract } from "./provider";
import { OcrQueue } from "./queue";
export function createOcrQueue(database: CargoDatabase) {
  const directory = join(app.getPath("userData"), "captures");
  const resources = app.isPackaged
    ? join(process.resourcesPath, "native")
    : join(__dirname, "../../resources/native");
  const resolver = createRequire(join(app.getAppPath(), "package.json"));
  const local = (name: string) => {
    const file = resolver.resolve(name);
    return app.isPackaged
      ? file.replace(/app\.asar([\\/])/, "app.asar.unpacked$1")
      : file;
  };
  const provider = new OfflineTesseract(local);
  return new OcrQueue(
    new CaptureRepository(database),
    new WindowsCaptureHost(resources, directory),
    provider,
    globalShortcut,
    directory,
    async (file) => {
      const info = await stat(file);
      if (info.size > 32 * 1024 * 1024)
        throw Error("Screenshot exceeds the processing limit.");
      const original = nativeImage.createFromBuffer(await readFile(file));
      if (original.isEmpty())
        throw Error(
          "Screenshot is missing or corrupted. Capture the screen again.",
        );
      const size = original.getSize();
      if (size.width * size.height > 33177600)
        throw Error(
          "Screenshot resolution exceeds the supported 33 megapixels.",
        );
      const normalized =
        Math.max(size.width, size.height) > 3200
          ? original.resize(
              size.width >= size.height
                ? { width: 3200, quality: "best" }
                : { height: 3200, quality: "best" },
            )
          : original;
      const dimensions = normalized.getSize();
      return {
        image: normalized.toPNG(),
        width: dimensions.width,
        height: dimensions.height,
      };
    },
  );
}
export function registerCaptureProtocol(queue: OcrQueue) {
  protocol.handle("cargo-capture", (request) => {
    try {
      const url = new URL(request.url);
      if (
        !["image", "thumb"].includes(url.hostname) ||
        url.search ||
        url.username ||
        url.password
      )
        return new Response("Unavailable", { status: 404 });
      const file = queue.imagePath(
        url.pathname.slice(1),
        url.hostname === "thumb",
      );
      if (!file) return new Response("Screenshot unavailable", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("Screenshot unavailable", { status: 404 });
    }
  });
}
