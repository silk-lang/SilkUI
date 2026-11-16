// The React side of a ui-js Vite build, beside `@silkui/vite`: JSX through this package,
// the reconciler speed fix, and React Fast Refresh under the dev server.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { transformWithOxc } from "vite";
import { reconcilerPlugin } from "./reconciler.js";

const require = createRequire(import.meta.url);
const IMPORT_SOURCE = "@silkui/react";
const REFRESH = "virtual:silk-refresh";
const REFRESH_ID = "\0" + REFRESH;

/** react-refresh's runtime as an ES module that hooks itself up when it loads. */
function refreshModule() {
  // The package exports only `runtime`, which picks this file when NODE_ENV says so.
  const file = join(dirname(require.resolve("react-refresh/runtime")), "cjs/react-refresh-runtime.development.js");
  const source = readFileSync(file, "utf8")
    .replaceAll("process.env.NODE_ENV", JSON.stringify("development"));
  return `const exports = {};
${source}
exports.injectIntoGlobalHook(globalThis);
globalThis.$RefreshReg$ = () => {};
globalThis.$RefreshSig$ = () => (type) => type;

let scheduled = false;
/** Asks React to re-render with the components registered since the last time. */
export function enqueue() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    exports.performReactRefresh();
  }, 16);
}

/** Whether a module with these exports can be replaced alone: all of them are components. */
export function isBoundary(module) {
  let any = false;
  for (const key in module) {
    if (key === "__esModule") continue;
    any = true;
    if (!exports.isLikelyComponentType(module[key])) return false;
  }
  return any;
}

export const register = exports.register;
export const createSignatureFunctionForTransform = exports.createSignatureFunctionForTransform;
`;
}

const refreshPlugin = {
  name: "silk:react-refresh",
  apply: "serve",
  enforce: "pre",
  // @silkui/vite runs these modules before the entry, so React finds the hook when it loads.
  api: { silkPreload: [REFRESH] },

  resolveId(id) {
    if (id === REFRESH) return REFRESH_ID;
  },

  load(id) {
    if (id === REFRESH_ID) return refreshModule();
  },

  // JSX with the Fast Refresh registrations, which Vite leaves out for environments
  // that are not browsers. A module whose exports are all components accepts its own
  // updates; any other one passes the update on to its importers.
  async transform(code, id) {
    if (this.environment.name !== "silk") return;
    const [file] = id.split("?");
    if (!/\.[jt]sx$/.test(file) || file.includes("/node_modules/")) return;
    const result = await transformWithOxc(code, file, {
      jsx: { runtime: "automatic", importSource: IMPORT_SOURCE, development: false, refresh: true },
    });
    if (!result.code.includes("$RefreshReg$(")) return { code: result.code, map: result.map };
    const name = JSON.stringify(file);
    return {
      code: `import * as __silkRefresh from ${JSON.stringify(REFRESH)};
const __silkReg = globalThis.$RefreshReg$, __silkSig = globalThis.$RefreshSig$;
globalThis.$RefreshReg$ = (type, id) => __silkRefresh.register(type, ${name} + " " + id);
globalThis.$RefreshSig$ = __silkRefresh.createSignatureFunctionForTransform;
${result.code}
globalThis.$RefreshReg$ = __silkReg;
globalThis.$RefreshSig$ = __silkSig;
if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (next && __silkRefresh.isBoundary(next)) __silkRefresh.enqueue();
    else import.meta.hot.invalidate();
  });
}
`,
      map: null,
    };
  },
};

/**
 * @param {object} [options]
 * @param {boolean} [options.refresh] React Fast Refresh under the dev server. Default true.
 */
export default function react(options = {}) {
  const config = {
    name: "silk:react",
    config: () => ({ oxc: { jsx: { runtime: "automatic", importSource: IMPORT_SOURCE } } }),
    // The dev server pre-bundles dependencies before the plugins see them: patch React's
    // reconciler there too.
    configEnvironment(name) {
      if (name === "silk") return { optimizeDeps: { rolldownOptions: { plugins: [reconcilerPlugin()] } } };
    },
  };
  const plugins = [config, reconcilerPlugin()];
  if (options.refresh ?? true) plugins.push(refreshPlugin);
  return plugins;
}
