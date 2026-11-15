# silkui

The front door of Silk UI. A project defines its app once, in `src/tasks.silk`, and builds and
runs it with pipelines of steps: `silk task dev` opens it with the development tools, and
`silk task build` writes the release program. silkui generates the Silk host for each target,
so the project never assembles hosts, fonts, GPU start-up or bundles by hand.

| Written in | Files the project owns | What silkui generates |
| --- | --- | --- |
| React, Foldkit, plain JS | `silk.toml`, `src/tasks.silk`, a Vite project in `web/` | The window host in `.silk/window/`, with the bundle embedded in release builds |
| Loom | `silk.toml`, `src/tasks.silk`, `src/app.silk` with the model, view and update | The window host in `.silk/window/`, which runs the app's `Model` |

`.silk/` is git-ignored (silkui writes its `.gitignore`) and rewritten on every build. It is
readable: each host is a manifest and a `main.silk` of a few lines that call into
[silkui-window](window).

## The app and the pipelines

```silk
import silkui.app { App, Framework, Target, Window, Mode, Built, Running }

effect fn app() -> App ! OutOfMemoryError ? &mut Allocator {
  return run App.make("my-app")
    |> App.framework(Framework.react("web"))
    |> App.target(Target.window(Window { title: "My app", width: 900.0, height: 600.0 }))
}

// in TaskSet.perform:
Tasks.Dev { target } => run app()
  |> App.only(String.view(&target))
  |> App.build(Mode.Dev)
  |> Built.launch()
  |> Running.watch()
Tasks.Build { target } => run app()
  |> App.only(String.view(&target))
  |> App.build(Mode.Release)
  |> Built.tap(Built.sizes)
  |> Built.write("dist")
```

The examples have the whole `tasks.silk`, command line included: [loom](examples/loom),
[react](examples/react), [foldkit](examples/foldkit) and [js](examples/js).

An app goes through three stages, and each step is scoped under the stage it takes:

| Step | Gives | What it does |
| --- | --- | --- |
| `App.only(id)` | App | Keeps only target `id` (a `--target` flag); empty keeps them all |
| `App.bundle(mode)` | App | Runs `vite build` for a JavaScript app (in `Mode.Dev` on the Engine it only installs packages: the dev server serves the modules) |
| `App.host(mode)` | App | Writes the host of each target into `.silk/<target>/`; `Mode.Dev` hosts have the development tools |
| `App.compile(mode)` | Built | Runs `silk build` on each host |
| `App.build(mode)` | Built | The three above, in order |
| `Built.write(dir)` | end | Copies each program to `<dir>/<target>/<app name>` |
| `Built.launch()` | Running | Starts the first target: Vite's dev server for a JavaScript app in `Mode.Dev`, which opens the window; otherwise the program |
| `Running.watch()` | end | Runs until the window closes. Vite replaces edited JavaScript modules in place; a change under `src/` of a Loom app rebuilds and restarts it |

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

`Mode.Release` builds never include the development tools: no reload, no development server,
no inspector.

## The definition

| Setting | Choices | Notes |
| --- | --- | --- |
| `App.framework` | `Framework.loom("app")`, `Framework.loomWithCommands("app", "Command")`, `Framework.react("web")`, `Framework.foldkit("web")`, `Framework.js("web")` | For Loom, the project module that has `Model` (a `Program<Message, C>`) and `Message`; the project's manifest exports it. For the others, the Vite project, whose config has `@silkui/vite` and bundles to `dist/app.js` |
| `App.runtime` | `Runtime.engine()` (default), `Runtime.node()` | What runs a JavaScript app in a window: the SilkJS Engine, or the full SilkJS runtime with Node's APIs. The runtime has no hot reload yet: `dev` builds the bundle once |
| `App.target` | `Target.window(Window { title, width, height })`, `Target.webCanvas()`, `Target.webDom()` | One or more; `dev` launches the first. silkui builds `window` today; the web targets fail with one line naming the framework and target |
| `App.customHost(dir)` | a package directory | The escape hatch: the project's own host package is built instead of a generated one |

Fonts are the ones installed on the machine.

## The project's manifest

The tasks depend on silkui; the app does not. A JavaScript project has no Silk code of its own:

```toml
[package]
name = "my-app"
version = "0.1.0"
silk-version = "0.1.0-dev.74+205aea3f5b2e"

[profiles.tasks.dependencies]
silkui = { git = "https://github.com/silk-lang/lib-ui.git", rev = "…", path = "modules/silkui", package = "silkui" }
```

A Loom project is a library whose `app` module is the app, so the generated host can import
it:

```toml
[package]
name = "my-app"
version = "0.1.0"
silk-version = "0.1.0-dev.74+205aea3f5b2e"
kind = "library"
main = "app.silk"
exports = ["app"]

[dependencies]
loom = { git = "https://github.com/silk-lang/lib-ui.git", rev = "…", path = "modules/loom", package = "loom" }

[profiles.tasks]
main = "tasks.silk"

[profiles.tasks.dependencies]
silkui = { git = "https://github.com/silk-lang/lib-ui.git", rev = "…", path = "modules/silkui", package = "silkui" }
```

The generated hosts depend on `silkui-window` from the same place as the `silkui` dependency,
so they always match it.

## Limits

- Targets: `window` only. Loom on `web-canvas` and `web-dom`, and JavaScript apps on
  `web-canvas`, come next.
- Starting Vite and the app beside the tasks needs subprocesses, which Silk has on macOS and
  Linux only: `dev` and `launch` fail on Windows.
- The examples install `@silkui/*` from this repository (`file:` dependencies with
  `install-links`) until the packages are on npm.
