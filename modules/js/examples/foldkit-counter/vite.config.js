import { defineConfig } from "vite";
import silk from "@silkui/vite";
import { provided } from "@silkui/foldkit/apis";

// `npm run build` writes dist/app.js. `npm run watch` rebuilds the bundle on every change and
// reloads the application in the host that SILK_UI_HOST names.
const host = process.env.SILK_UI_HOST;

export default defineConfig({
  plugins: [
    silk({
      entry: "src/entry.ts",
      jsx: false,
      // The document and the DOM classes are there at run time.
      allow: provided,
      host: host ? { command: host, cwd: new URL("../../../..", import.meta.url).pathname } : undefined,
    }),
  ],
});
