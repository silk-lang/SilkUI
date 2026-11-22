import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "../src/vite.js";

const sources = fileURLToPath(new URL("../src", import.meta.url));

// An app that points `@silkui/react` at another copy of its sources, as the README's local
// config does: `react-dom` has to come from that copy too, or two renderers load.
test("react-dom resolves beside an aliased @silkui/react", async () => {
  const dir = mkdtempSync(join(tmpdir(), "silk-react-dom-"));
  const copy = join(dir, "copy");
  cpSync(sources, copy, { recursive: true });
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/main.js"), 'import { createRoot } from "react-dom/client";\nimport { createRoot as own } from "@silkui/react";\nglobalThis.same = createRoot === own;\n');
  const loaded = [];
  await build({
    root: dir,
    configFile: false,
    logLevel: "silent",
    resolve: { alias: [{ find: /^@silkui\/react$/, replacement: join(copy, "index.js") }] },
    plugins: [react({ refresh: false }), { name: "record", load(id) { loaded.push(id); } }],
    build: {
      write: false,
      lib: { entry: join(dir, "src/main.js"), formats: ["es"], fileName: "app", cssFileName: "app" },
      rolldownOptions: { external: [/^@silkui\/core/, /^react($|\/)/, /^react-reconciler/, /^scheduler/] },
    },
  });
  const renderers = loaded.filter((id) => /[/\\]index\.js$/.test(id) && (id.startsWith(copy) || id.startsWith(sources)));
  assert.deepEqual(renderers, [join(copy, "index.js")]);
  assert.ok(loaded.includes(join(copy, "dom.js")));
});
