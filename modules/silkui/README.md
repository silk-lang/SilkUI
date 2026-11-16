# silkui

The front door of Silk UI. A project defines its app once, in `src/tasks.silk`, and builds and
runs it with pipelines of steps: `silk task dev` opens it with the development tools, and
`silk task build --release` writes the release program. silkui generates the Silk host for each target,
so the project never assembles hosts, fonts, GPU start-up or bundles by hand.

| Written in | Files the project owns | What silkui generates |
| --- | --- | --- |
| React, Foldkit, plain JS | `silk.toml`, `src/tasks.silk`, a Vite project in `web/` | A generated window entry module, with the bundle embedded in release builds |
| Loom | `silk.toml`, `src/tasks.silk`, `src/app.silk` with the model, view and update | An entry module per target that runs the app's `Model`: a window program, or a wasm program and the page that loads it |

Generated modules and bundles are cached build steps. Each compilation uses the application's
manifest and explicit dependencies; its entry module calls into [silkui-window](window) or
the selected Loom host. `silk task plan` publishes compilation requests for editors without
compiling the application.

## The app and the pipelines

```silk
import silkui.app { App, Framework, Target, Window, Built, Running }

effect fn app() -> App ! OutOfMemoryError ? &mut Allocator {
  return run App.make("my-app")
    |> App.framework(Framework.react("web"))
    |> App.target(Target.window(Window { title: "My app", width: 900.0, height: 600.0 }))
}

// in TaskSet.perform:
Tasks.Dev { platform, options } => run app()
  |> App.only(String.view(&platform))
  |> App.build(&options)
  |> Built.launch()
  |> Running.watch()
Tasks.Build { platform, options } => run app()
  |> App.only(String.view(&platform))
  |> App.build(&options)
  |> Built.tap(Built.sizes)
  |> Built.write("dist")
```

The examples have the whole `tasks.silk`, command line included: [loom](examples/loom),
[react](examples/react), [foldkit](examples/foldkit) and [js](examples/js).

An app goes through three stages, and each step is scoped under the stage it takes:

| Step | Gives | What it does |
| --- | --- | --- |
| `App.only(id)` | App | Keeps only platform `id` (the `--platform` flag); empty keeps them all |
| `app.compilations(&options)` | Build | Describes the selected hosts as standard compilations, with generated entry modules and release bundles as prerequisites; runs no tools |
| `App.build(&options)` | Built | Compiles the graph and assembles browser pages. Development builds also install the Vite packages needed to launch the dev server |
| `Built.write(dir)` | end | Copies each program to `<dir>/<target>/<app name>`, and each page to `<dir>/<target>/` |
| `Built.launch()` | Running | Starts the first target: Vite's dev server for an unoptimized JavaScript app, which opens the window; a server for the page of a web target, on `http://127.0.0.1:8090/` (or a free port); otherwise the program |
| `Running.watch()` | end | Runs until the window closes, or serves the page until the task is stopped. Vite replaces edited JavaScript modules in place; a change under `src/` of a Loom app rebuilds it and restarts the window or reloads the page |

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
and `--target` selects a native target triple. `--platform` selects the UI host. Unoptimized
builds include development tools; optimized builds exclude reload, the development server
and the inspector. Development builds optimize the renderer, inspector server and runtime
packages while keeping the application unoptimized.

## The definition

| Setting | Choices | Notes |
| --- | --- | --- |
| `App.framework` | `Framework.loom("app")`, `Framework.loomWithCommands("app", "Command")`, `Framework.react("web")`, `Framework.foldkit("web")`, `Framework.js("web")` | For Loom, the project module that has `Model` (a `Program<Message, C>`) and `Message`; the project's manifest exports it. For the others, the Vite project, whose config has `@silkui/vite` and bundles to `dist/app.js` |
| `App.runtime` | `Runtime.engine()` (default), `Runtime.node()` | What runs a JavaScript app in a window: the SilkJS Engine, or the full SilkJS runtime with Node's APIs. The runtime has no hot reload yet: `dev` builds the bundle once |
| `App.target` | `Target.window(Window { title, width, height })`, `Target.webCanvas(Page { title })`, `Target.webDom(Page { title })` | One or more; `dev` launches the first. The web targets build Loom apps; for a JavaScript app they fail with one line naming the framework and target |
| `App.customHost(dir)` | a package directory | The escape hatch: the project's own host package is built instead of a generated one (window only) |

Fonts are the ones installed on the machine. A `web-canvas` page has no access to those, so it
gets the tree's own default fonts.

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

## Limits

- JavaScript apps run in a window only: on `web-canvas` they come next, `web-dom` later.
- A Loom app with commands (`Framework.loomWithCommands`) cannot target `web-dom` yet: the page has no shell for them.
- The web targets read the page scripts from Silk's checkouts of silkui, Loom and lib-native, so
  Git dependencies on silkui and loom must be pinned with `rev`.
- Starting Vite and the app beside the tasks, and serving pages, needs subprocesses and sockets
  that silkui uses on macOS and Linux only: `dev` and `launch` fail on Windows.
- The examples install `@silkui/*` from this repository (`file:` dependencies with
  `install-links`) until the packages are on npm.
