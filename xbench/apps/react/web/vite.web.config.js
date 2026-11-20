import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// The scenes on React DOM, for Electron: `<box>` is a div (browser/jsx-runtime.js).
const browser = (path) => fileURLToPath(new URL("browser/" + path, import.meta.url));
// `xb-scene.css` (src/main.tsx): style/chat.css in the chat build, bench.css otherwise (vite.config.js).
const sceneCss = fileURLToPath(new URL(`../../../style/${(process.env.VITE_XB_SCENE ?? "feed").split("-")[0] === "chat" ? "chat" : "bench"}.css`, import.meta.url));

export default defineConfig({
  root: browser(""),
  base: "./",
  resolve: {
    alias: [
      { find: /^xb-scene\.css$/, replacement: sceneCss },
      { find: /^@silkui\/core$/, replacement: browser("silkui-core.js") },
      { find: /^@silkui\/react$/, replacement: browser("silkui-react.js") },
      { find: /^silk-web\/jsx(-dev)?-runtime$/, replacement: browser("jsx-runtime.js") },
    ],
  },
  oxc: { jsx: { runtime: "automatic", importSource: "silk-web" } },
  build: {
    outDir: fileURLToPath(new URL(`dist-web/${process.env.VITE_XB_SCENE ?? "feed"}`, import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 8000,
  },
});
