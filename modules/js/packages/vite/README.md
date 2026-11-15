# @silkui/vite

Vite plugin for ui-js applications: a library build with one ES module for the host to
evaluate, and a reload of the native window after each rebuild. It knows no UI framework:
a React application adds `react()` from `@silkui/react/vite` for JSX and Fast Refresh.

```js
import { defineConfig } from "vite";
import silk from "@silkui/vite";
import react from "@silkui/react/vite";

export default defineConfig({ plugins: [silk(), react()] });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `entry` | `src/main.jsx` | Entry module, relative to the Vite root |
| `fileName` | `app.js` | Name of the bundle in `build.outDir` |
| `host` | none | `{ command, args, cwd }`: a host binary to start, given `--dev <port>` under the dev server and `--watch <bundle>` in watch mode |
| `port` | any free one | Port the dev server listens on for the host |
| `apis` | `warn` | What to do when the build uses a web or Node API a ui-js runtime does not have: `warn`, `error` or `off` |
| `allow` | none | Names of such APIs the application provides itself |
| `node` | `false` | The host runs the full SilkJS runtime (ui-js-node): `node:fs` and the other Node builtins stay imports, and `apis` reports only what that runtime lacks |

- `vite build` makes the production bundle.
- `vite` serves the modules to the host and replaces the ones an edit touches. A module
  nothing accepts restarts the application; with `@silkui/react/vite`, component files keep
  their state (React Fast Refresh).
- `vite build --watch --mode development` keeps building the bundle and writes
  `<bundle>.stamp` after each successful build; a host that watches it reloads the whole
  application.

See [the ui-js README](../../README.md#silkvite).
