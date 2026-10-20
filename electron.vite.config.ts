import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve("electron/main/index.ts") } },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve("electron/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve("index.html") } },
  },
});
