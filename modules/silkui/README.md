# silkui

The front door of Silk UI. A project defines its app once, in `silk/tasks.silk`, and builds and
runs it with pipelines of steps: `silk task dev` opens it with the development tools, and
`silk task build --release` writes the release program. silkui generates the Silk host for each target,
so the project never assembles hosts, fonts, GPU start-up or bundles by hand.

| Written in | Files the project owns | What silkui generates |
| --- | --- | --- |
| React, Foldkit, plain JS | `silk.toml`, `silk/tasks.silk`, the JavaScript in `js/`, and `package.json` and `vite.config.js` beside `silk.toml` | A generated window entry module, with the bundle embedded in release builds |
| Loom | `silk.toml`, `silk/tasks.silk`, `silk/app.silk` with the model, view and update | An entry module per target that runs the app's `Model`: a window program, or a wasm program and the page that loads it |

One root holds both projects, so `silk` and `npm` commands both run there. The manifest's
`source = "silk"` points Silk at `silk/` (without it, Silk reads `src/`).

Generated modules and bundles are cached build steps. Each compilation uses the application's
manifest and explicit dependencies; its entry module calls into [silkui-window](window) or
the selected Loom host. `silk task plan` publishes compilation requests for editors without
compiling the application.

## The app and the pipelines

```silk
import silkui.app { App, Framework, Target, Window, Built, Running }

effect fn app() -> App ! OutOfMemoryError ? &mut Allocator {
  return run App.make("my-app")
    |> App.framework(Framework.react("."))
    |> App.target(Target.window(Window { title: "My app", width: 900.0, height: 600.0 }))
}

// in TaskSet.perform:
Tasks.Dev { platform, options } => run app()
  |> App.only(String.view(&platform))
  |> App.dev(&options)
  |> Built.launch()
  |> Running.watch()
Tasks.Build { platform, options } => run app()
  |> App.only(String.view(&platform))
  |> App.build(&options)
  |> Built.write("dist")
```

The examples have the whole `tasks.silk`, command line included: [loom](examples/loom),
[react](examples/react), [foldkit](examples/foldkit), [js](examples/js) and [native](examples/native) (JavaScript calling Silk functions).

An app goes through three stages, and each step is scoped under the stage it takes:

| Step | Gives | What it does |
| --- | --- | --- |
| `App.only(id)` | App | Keeps only platform `id` (the `--platform` flag); empty keeps them all |
| `app.compilations(&options)` | Build | Describes the selected hosts as standard compilations, with generated entry modules and release bundles as prerequisites; runs no tools |
| `App.build(&options)` | Built | Compiles the graph without the development tools and assembles browser pages |
| `App.dev(&options)` | Built | The same with the development tools, and it installs the Vite packages the dev server needs |
| `Built.write(dir)` | end | Copies each program to `<dir>/<target>/<project name>`, and each page to `<dir>/<target>/`, and lists them with their sizes and the build time |
| `Built.launch()` | Running | Starts the first target: Vite's dev server for a JavaScript app in `Mode.Dev`, which opens the window; a server for the page of a web target, on `http://127.0.0.1:8090/` (or a free port); otherwise the program |
| `Running.watch()` | end | Runs until the window closes, or serves the page until the task is stopped. Vite replaces edited JavaScript modules in place; a change in the Silk sources of a Loom app rebuilds it and restarts the window, which keeps the model's `pub` fields, the window size, focus and scroll positions, or reloads the page |

`App.tap(fn)`, `Built.tap(fn)` and `Running.tap(fn)` run a function on the value and pass it
on; `App.map` and `Built.map` take an effect closure that makes a new value of the same
stage (`built.without("web-dom")`). A project's own step is a function of the same shape
placed in the chain:

```silk
effect fn sign<'env, E, ?R>(built: once Effect<'env; Built ! E ? R>) -> Built ! E | TaskError | … ? R | … {
  let built = run move built
  // built.artifacts() has each program's target, path and size.
  return move built
}
```

Tasks flatten the standard `silk.build.graph.Options` flags: `--release` selects speed
optimization, `--optimize` selects an optimization mode, `--debug` controls debug information,
and `--target` selects a native target triple. `--platform` selects the UI host. Only
`App.dev` builds include the development tools (reload, the development server, the
inspector); `App.build` without `--release` is `Mode.Debug`, the program unoptimized, as
`silk build` makes it. Development builds optimize the renderer, inspector server and runtime
packages while keeping the application unoptimized.

## The definition

| Setting | Choices | Notes |
| --- | --- | --- |
| `App.framework` | `Framework.loom("app")`, `Framework.loomWithCommands("app", "Command")`, `Framework.react(".")`, `Framework.foldkit(".")`, `Framework.js(".")` | For Loom, the project module that has `Model` (a `Program<Message, C>`) and `Message`; the project's manifest exports it. For the others, the Vite project's directory (`.` for the project root), whose config has `@silkui/vite`; silkui has it bundle into `.silk/bundle/` |
| `App.runtimeStylesheets()` | Optional | Includes the CSS text compiler in a release native or canvas host; development hosts always include it |
| `App.stylesheet(path)` | A CSS file relative to the project root | Repeatable; declaration order is adoption order. Native and canvas hosts embed compiled bytes; DOM pages link copied CSS files |
| `App.runtime` | `Runtime.engine()` (default), `Runtime.node()` | What runs a JavaScript app in a window: the SilkJS Engine, or the full SilkJS runtime with Node's APIs. The runtime has no JavaScript hot reload yet: `dev` builds the bundle once |
| `App.target` | `Target.window(Window { title, width, height })`, `Target.webCanvas(Page { title })`, `Target.webDom(Page { title })` | One or more; `dev` launches the first. The web targets build Loom apps; for a JavaScript app they fail with one line naming the framework and target |
| `Target.titleBar` | `TitleBar.standard()` (default), `TitleBar.transparent(height)`, `.buttons(left, top)` | On a window target. `buttons` moves the window buttons' top-left corner (0 keeps it centred). Transparent: on macOS the app fills the window under the controls and draws its own bar in the top `height` pixels, where a press moves the window and the app gets no clicks. Other systems keep their bar |
| `Target.metalHud` | `true` or `false` (default) | On a window target. Shows the Metal Performance HUD over the window on macOS 13 and later: frames presented per second, frame times and GPU time. Other systems show nothing. `SILK_UI_METAL_HUD=1` does the same for one run |
| `App.customHost(dir)` | a package directory | The escape hatch: the project's own host package is built instead of a generated one (window only) |

Fonts are the ones installed on the machine. A `web-canvas` page has no access to those, so it
gets the tree's own default fonts.

## Stylesheets

Add one or more files after the framework declaration:

```silk
    |> App.stylesheet("styles/app.css")
    |> App.stylesheet("styles/theme.css")
```

The build compiles each file with `css-style`, reports unsupported constructs, and embeds
compiled bytes in native and canvas hosts. Sheets are adopted before the application's
first layout, including later windows. The embedded inspector has its own styles.
DOM pages copy the CSS and link the files in the same order before mounting the app.
Local `@font-face` files are embedded as data URLs in both outputs. Relative font paths
start at the original CSS file; paths beginning with `/` start at the app root. Remote
URLs remain host requests. Changes to a local font also trigger stylesheet hot replacement.
Keep fonts outside `src/` to avoid also triggering the application source rebuild watcher.
The [Loom counter](examples/loom) uses this path on all three targets.
JavaScript release builds also pick up `dist/app.sheet` from `@silkui/vite`, validate its
format, and embed it after the explicitly configured CSS files.

A CSS processor such as Tailwind runs before `App.host` (or `App.build`) and writes ordinary
CSS to the configured path. The optional [`ui-tailwind` package](../tailwind) supplies a
project CLI or checksum-pinned standalone CLI, with build and watch steps. Custom hosts adopt their compiled sheets directly. On `window`,
`web-canvas`, and `web-dom`, `dev` replaces changed stylesheets without restarting the application or
resetting its state. Native hosts validate an atomically published set of compiled sheets
before updating their application roots. A missing or invalid update leaves the active styles
intact until a valid update is available. Release hosts do not watch stylesheet files.
Canvas updates fetch the same compiled bundles; development polling is omitted from release pages.

Runtime CSS text is optional in release: add `App.runtimeStylesheets()` to enable it.
Silk code can use `StyleSheet.load(&mut tree, run StyleSource.text(bytes))`, or
`tree.loadStyleSheet(root, run StyleSource.url("https://example.com/theme.css"))`.
`StyleSource.url` accepts the same relative, `file:`, HTTP(S), and `data:` sources as
images and fonts. Native file and HTTP reads run on workers; canvas URLs use browser fetch
and its CORS rules. Local files on canvas must be served by the app's web server.
Custom hosts configure `Loader.setStylesheetCompiler(ui_tree.style_runtime.runtime())`;
the loader defaults to disabled and does not fetch CSS when disabled.

A load reserves its adoption position immediately. Its handle exposes loading, ready,
or failed state; `replace` keeps the previous sheet until the replacement succeeds.
Removal, another replacement, or closing the root discards stale completions. Failed
initial loads leave an empty slot that can be replaced or removed. Compiled sheet adoption
never requires the text compiler. The DOM backend uses the browser's CSS parser and needs
no compiler option.

Media queries use each root's viewport and scale. Window hosts supply system light/dark
appearance and desktop pointer capabilities. Canvas hosts read the browser's appearance,
reduced-motion, forced-colors, hover, and primary/secondary pointer preferences, and respond when they
change. A root is restyled only when a media condition changes its result. Native
reduced-motion and forced-colors preferences are not exposed by the window platform API yet.

The browser integration test runs the real dev task in a temporary project and checks
replacement order, preserved state, missing-file recovery, and a subsequent code rebuild:
`node modules/silkui/tests/stylesheets-browser.mjs` from the repository root. It needs
`silk` and `chromium` on PATH (or the `SILK` and `CHROMIUM` environment variables).
The native file-update test is `silk test --manifest-path modules/tree/window/tests/silk.toml --root src/stylesheet_updates.silk`; it checks complete-set validation, recovery, adoption
order, repaint scheduling, and isolation between application and inspector roots.

## The web targets

A Loom app on `web-canvas` runs the tree compiled to wasm and draws it with WebGPU on a canvas
that fills the page (Chrome or Edge 137 and later: the page waits on the GPU through JSPI). On
`web-dom` the same `Model` drives the page's own elements through the protocol, and the browser
does layout and text.

`build` writes a static site to `dist/<target>/`: `index.html`, `app.wasm` and the scripts that
load it, which any static file server can serve. `dev --platform web-canvas` (or `web-dom`) serves
it from `build/pages/<target>/site/`, rebuilds when `src/` changes, and the open page reloads itself.
A `web-canvas` rebuild links the whole tree to wasm, which takes a minute or two; `web-dom`
takes seconds.

## The project's manifest

The manifest names every package the tasks and generated hosts use. Start from the complete
[JavaScript example](examples/js/silk.toml) or [Loom example](examples/loom/silk.toml),
and preserve the dependency aliases when adapting it. No dependencies are inferred from a
repository layout.

A JavaScript project's entry point is `tasks.silk`. It lists `silkui`, the window hosts,
`ui_tree`, `ui_inspect_server`, `silkjs` and `node_runtime`. A Loom project is a library
with `main = "app.silk"` and `exports = ["app"]`; it also lists the Loom window and web hosts
and their platform dependencies. The examples pin compatible Git revisions so each package
has one identity throughout the graph.

A JavaScript project that imports Silk functions (`import { add } from "../silk/math.silk"`)
is a library in the same way: its `exports` are the modules JavaScript can import. silkui
describes them into `.silk/natives/` before it runs Vite, and the host depends on the project
and hands the bridge their dispatcher. [examples/native](examples/native) is one.

## Limits

- JavaScript apps run in a window only: on `web-canvas` they come next, `web-dom` later.
- A Loom app with commands (`Framework.loomWithCommands`) cannot target `web-dom` yet: the page has no shell for them.
- The web targets read the page scripts from Silk's checkouts of silkui, Loom and lib-native, so
  Git dependencies on silkui and loom must be pinned with `rev`.
- Under `silk task dev`, an edit to the Silk modules a JavaScript app imports rebuilds the host
  and starts it again, so the app's JavaScript state starts over, as after a page reload.
- Starting Vite and the app beside the tasks, and serving pages, needs subprocesses and sockets
  that silkui uses on macOS and Linux only: `dev` and `launch` fail on Windows.
- The examples install `@silkui/*` from this repository (`file:` dependencies with
  `install-links`) until the packages are on npm.
