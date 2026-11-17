# Get started

A Silk UI app starts from a template. One command makes the project, a second opens it in a window, and from then on an edit shows up while it runs.

## Make an app

You need [Silk](https://github.com/silk-lang/silk), and for the JavaScript templates also Node and npm.

```sh
silk init my-app -t ui-react
cd my-app
silk task dev
```

The first `dev` installs the npm packages and builds the window, which takes a few minutes. After that it starts in seconds. Edit `web/src/App.tsx` while the window is open: Vite replaces the modules you changed, and the counter keeps its count.

On Linux the window system's headers have to be installed first:

```sh
sudo apt-get install libx11-dev libxkbcommon-dev libwayland-dev wayland-protocols
```

## Pick a template

The template decides what you write the app in. Each one is a hello-world you can run right away.

| Template | You write the app in | Runs on |
| --- | --- | --- |
| `ui-react` | React and TypeScript, in `web/` | `window` |
| `ui-foldkit` | Foldkit, in `web/` | `window` |
| `ui-js` | Plain TypeScript with `@silkui/core`, in `web/` | `window` |
| `ui-loom` | [Loom](/core/), Silk's own framework, in `src/app.silk` | `window`, `web-dom`, `web-canvas` |

JavaScript apps run in the window on the SilkJS Engine, embedded in the program: there is no browser inside. The [Products](/products/) page says what each name means.

## What is in the project

A JavaScript template has three parts:

| Path | What it is |
| --- | --- |
| `silk.toml` | The manifest. Its one dependency, `silkui`, is for the tasks |
| `src/tasks.silk` | The app definition, and the `dev` and `build` tasks |
| `web/` | A Vite project with `@silkui/vite` in its config. This is the app |

A Loom template has `src/app.silk` in place of `web/`, and depends on `loom` as well.

In a Loom app, `dev` rebuilds and restarts the window when you save a file in `src/`, and the model comes back as it was. Fields are matched by name: a field you add starts with its `init` value, and one whose type you changed starts over, which the terminal reports. Only `pub` fields are kept, and enums start over. The window keeps its size, focus and scroll positions too. Each new `silk task dev` starts from `init`.

The app definition is a few lines at the top of `src/tasks.silk`:

```silk title="src/tasks.silk"
effect fn app() -> App ! OutOfMemoryError ? &mut Allocator {
  return run App.make("my-app")
    |> App.framework(Framework.react("web"))
    |> App.target(Target.window(Window { title: "My app", width: 1040.0, height: 720.0 }))
}
```

Below it, `dev` and `build` are pipelines of steps, written out so you can read and change them. silkui generates the program that opens the window into `.silk/`, so there is no host code in the project.

## Build it

```sh
silk task build
```

`dist/window/my-app` is the release program, with the bundle inside and no development tools. Copy it anywhere and run it.

## Add a target

A target is where the app runs, and it is one line in `app()`. A Loom app can also run in a browser page:

```silk
    |> App.target(Target.webDom(Page { title: "My app" }))
    |> App.target(Target.webCanvas(Page { title: "My app" }))
```

`silk task dev --target web-dom` serves the page on `http://127.0.0.1:8090/` and reloads it when `src/` changes. `silk task build` writes each page to `dist/<target>/` as a static site. JavaScript apps run in a window for now; the web canvas comes next.

## Next

- Write a Loom app: [your first program](/core/first-program/), then the [tutorial](/core/tutorial/).
- See what a window app is made of underneath: [your first window](/native/).
- Give a JavaScript app Node's APIs: add `|> App.runtime(Runtime.node())` to `app()`.
