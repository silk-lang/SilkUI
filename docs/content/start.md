# Get started

A Silk UI app starts from a template. One command makes the project, a second opens it in a window, and from then on an edit shows up while it runs.

## Make an app

You need [Silk](https://github.com/silk-lang/silk), and for the JavaScript templates also Node and npm.

```sh
silk init my-app -t ui-react
cd my-app
silk task dev
```

`silk run` does the same in the JavaScript templates. The first `dev` installs the npm packages and builds the window, which takes a few minutes. After that it starts in seconds. Edit `js/App.tsx` while the window is open: Vite replaces the modules you changed, and the counter keeps its count.

On Linux the window system's headers have to be installed first:

```sh
sudo apt-get install libx11-dev libxkbcommon-dev libwayland-dev wayland-protocols
```

## Pick a template

The template decides what you write the app in. Each one is a hello-world you can run right away.

| Template | You write the app in | Runs on |
| --- | --- | --- |
| `ui-react` | React and TypeScript, in `js/` | `window` |
| `ui-foldkit` | Foldkit, in `js/` | `window` |
| `ui-js` | Plain TypeScript with `@silkui/core`, in `js/` | `window` |
| `ui-loom` | [Loom](/core/), Silk's own framework, in `silk/app.silk` | `window`, `web-dom`, `web-canvas` |

JavaScript apps run in the window on the SilkJS Engine, embedded in the program: there is no browser inside. The [Products](/products/) page says what each name means.

## What is in the project

The project root holds both the Silk and the npm side, so `silk task dev` and `npm install` both run there:

| Path | What it is |
| --- | --- |
| `silk.toml` | The manifest. `source = "silk"` points Silk at `silk/`. Its one dependency, `silkui`, is for the tasks |
| `silk/tasks.silk` | The app definition, and the `dev` and `build` tasks |
| `js/` | The app |
| `package.json`, `vite.config.js` | The npm packages, and Vite with `@silkui/vite` in its config |

A Loom template has `silk/app.silk` in place of `js/` and the npm files, and depends on `loom` as well.

In a Loom app, `dev` rebuilds and restarts the window when you save a file in `silk/`, and the model comes back as it was. Fields are matched by name: a field you add starts with its `init` value, and one whose type you changed starts over, which the terminal reports. Only `pub` fields are kept, and enums start over. The window keeps its size, focus and scroll positions too. Each new `silk task dev` starts from `init`.

The app definition is a few lines at the top of `silk/tasks.silk`:

```silk title="silk/tasks.silk"
effect fn app() -> App ! OutOfMemoryError ? &mut Allocator {
  return run App.make("my-app")
    |> App.framework(Framework.react("."))
    |> App.target(Target.window(Window { title: "My app", width: 1040.0, height: 720.0 }))
}
```

Below it, `dev` and `build` are pipelines of steps, written out so you can read and change them. silkui generates the program that opens the window into `.silk/`, so there is no host code in the project.

## Build it

```sh
silk task build --release
```

`dist/window/my-app` is the release program, with the bundle inside and no development tools. Copy it anywhere and run it. Without `--release` the task writes the same program unoptimized, which builds faster.

## Add a target

A target is where the app runs, and it is one line in `app()`. A Loom app can also run in a browser page:

```silk
    |> App.target(Target.webDom(Page { title: "My app" }))
    |> App.target(Target.webCanvas(Page { title: "My app" }))
```

`silk task dev --target web-dom` serves the page on `http://127.0.0.1:8090/` and reloads it when `silk/` changes. `silk task build` writes each page to `dist/<target>/` as a static site. JavaScript apps run in a window for now; the web canvas comes next.

## Draw the title bar

On macOS the app can fill the whole window, with the window controls floating over its top:

```silk
    |> App.target(Target.window(Window { title: "My app", width: 1040.0, height: 720.0 })
      .titleBar(TitleBar.transparent(56.0)))
```

The app draws its own bar in those top 56 pixels and leaves room on the left for the controls, which are centred in it. A press there moves the window and a double click zooms it, so the app gets no clicks in that strip. Import `TitleBar` from `silkui.app` beside `Window`. Windows and Linux keep the system's bar above the app.

## Next

- Write a Loom app: [your first program](/core/first-program/), then the [tutorial](/core/tutorial/).
- See what a window app is made of underneath: [your first window](/native/).
- Give a JavaScript app Node's APIs: add `|> App.runtime(Runtime.node())` to `app()`.
