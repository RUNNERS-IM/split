import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // The window module is a compiled .node file; it is loaded at run time, not bundled.
        external: [/\.node$/],
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    build: {
      // Why: package.json says "type": "module", so a CommonJS preload needs the .cjs name.
      rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          settings: resolve("src/renderer/settings.html"),
          overlay: resolve("src/renderer/overlay.html"),
          sheet: resolve("src/renderer/sheet.html"),
          about: resolve("src/renderer/about.html"),
          update: resolve("src/renderer/update.html"),
          layout: resolve("src/renderer/layout.html"),
          guide: resolve("src/renderer/guide.html"),
          panel: resolve("src/renderer/panel.html"),
        },
      },
    },
  },
});
