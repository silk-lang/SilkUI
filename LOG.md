# What each app does differently

Every app runs the same scenes (SCENES.md) from the same corpus, at 1040 x 720 CSS px, and keeps
every item in its tree. This file lists where an app could not do exactly the same thing, and how
each one is driven. Read it before comparing two numbers.

## Silk UI + React (`silk-react`)

- `apps/react/web/src/App.tsx` is the reference for every scene. Items are `memo(ItemView)`,
  wall cells are `memo(Cell)`, and every driver frame is a `flushSync` update.
- Built with `@silkui/vite` and embedded in a Silk host binary, one binary per scene.
- cpu suite: Silk UI's windowless bench (`SILK_UI_BENCH`, `SILK_UI_HEADLESS`). It does style,
  layout, text shaping and the paint list, but no rasterization and no GPU.
- First paint in a window: two `requestAnimationFrame` callbacks and the host's frame counter
  past zero.
- On macOS in dark mode, Silk lays the page out a second time before its first frame. Its early
  layout assumes the light appearance, and the first real frame restyles. Julia's startup report
  (2026-11-19) measured 67 ms on 1,000 messages. Results record the appearance.

## Silk UI + Loom (`silk-loom`)

- A Loom app: a model, a view of the whole page on every render, and Loom's diff. Items and cells
  are `ui.lazyKeyed` regions with a hash of their version, the equivalent of React's `memo`.
- Same node and fragment counts as React and direct on every scene (`silk_first_frame`).
- Loom builds the view of all 1,000 lazy items on every frame, even when only the scroll offset
  changes. On `feed` scroll this is about 3.8 ms of tick a frame. This is a cost of Loom as it is
  today, and it is left in on purpose.
- First paint: Loom's window host passes on no presentation, so the app says it at its second
  frame message.

## Silk UI direct (`silk-direct`)

- No JavaScript, no framework and no diff: the app makes every node itself and sends only the
  mutations each frame needs. It is the floor under the other two Silk apps.
- First paint: the host's `presented` callback.

## Electron (`electron`)

- Electron 45 loading the React DOM build of the same `App.tsx`. `<box>` becomes a `div`, and the
  stylesheet is the same `bench.css`.
- cpu suite: offscreen rendering with `--disable-gpu`. Chromium still rasterizes, in software,
  which no other app does in the cpu suite, and it paces frames at 120 a second (240 uncapped).
  Compare `cpu_ms_per_frame` for Electron in the cpu suite, not `frame_ms`.
- Memory is the whole process tree: browser, renderer, GPU and utility processes.
- First paint: two `requestAnimationFrame` callbacks after the first render. It can be checked
  against Chromium's first contentful paint from `--trace-startup` (PROTOCOL.md).
- Cold runs delete its GPU, shader and code caches.

## Rune (`rune`)

- Rune at `d170ff6` (`apps/rune/fetch.sh`), retained mode. Each item and each wall cell is a
  `memo` keyed by its version, so a frame rebuilds only what changed.
- cpu suite: a `rune::Runtime` driven directly, as Rune's own tests do: view, commit, Taffy layout,
  Parley shaping, and the paint pass that makes GPU instances (glyph masks rasterized on the
  CPU). No window, no GPU.
- The app reads the content and scroller heights with `on_layout_tx` and `tx.live_only()`, so a
  layout report does not run the view again (a plain `on_layout` inside a scroller fires on every
  scroll frame and reruns the whole view).
- In the cpu suite the loop calls `Runtime::frame` only when state changed, the script asks for
  frames or motion is running, as Rune's window host does, so idle steps draw nothing.
- Scrolling is expensive in Rune here (about 40 ms a frame on `feed` on the cloud machine): most
  of it is Rune's paint pass building instances, which walks the whole retained tree each frame.
  Rune's own answer is `virtual_list`, which the scenes forbid.
- Tables: Rune's grid has equal columns only, so a table is a wrapping row of cells at `2fr 1fr
  1fr` widths. Table cells truncate instead of wrapping.
- Windowed: Rune presents at the display's pace and has no uncapped mode, so its gpu frame times
  are floored at the refresh interval. Compare CPU per frame and the interval tail.
- First paint: Rune passes on no presentation, so the app says it at its second frame.

## GPUI (`gpui`)

- GPUI from Zed v1.29.2 (`apps/gpui/fetch.sh`, a sparse checkout).
- GPUI is immediate mode. Every frame builds the whole element tree and lays all of it out again
  with Taffy, and there is no memo for a subtree of one view. With 61,000 nodes and nothing
  virtualized, each frame costs far more than in the retained frameworks, and a `feed` run takes
  many minutes. Zed itself avoids this with `uniform_list` and `list`, which only build visible
  rows. The scenes forbid that (SCENES.md), so this is the cost of GPUI without it.
- cpu suite: `HeadlessAppContext` runs a real `App` and `Window` on GPUI's test platform with the
  platform's text system (cosmic-text on Linux, Core Text on macOS). A frame is drawn only when
  the scene changed or asks for frames, as the retained apps do. Idle steps draw nothing.
- Text runs have no per-run font size, so inline `code` has the paragraph's size, not 12.5 px.
- Tables are flex rows with relative widths. The wall is `grid_cols(16)`.
- Windowed: frames at the display's pace (no uncapped mode). First paint at the second frame.

## FerroUI (`ferroui`)

- FerroUI 0.5.0 from crates.io, a Rust port of Avalonia, on its declarative layer
  `ferroui-view`. The page is a `#[component(rerender)]` that runs again on every tick; items and
  cells are memoized components with comparable parameters, and the reconciler patches what
  changed into the controls.
- Fluent theme. Inline marks are `Run`s in a `TextBlock`'s inlines; tables are a `Grid` with
  `2*,*,*` columns; the wall is a 16-column `UniformGrid`; the scroller is a `ScrollViewer`.
- cpu suite: FerroUI's headless platform with Skia drawing into an offscreen raster framebuffer.
  The headless drawing stub measures text with a stub font, so the real font manager and Skia are
  used. Like Electron, it rasterizes on the CPU, which the Silk bench does not.
- Brushes are shared per colour, as an Avalonia app keeps them in resources.
- First paint in a window: the second `request_animation_frame` callback.

## Fake clocks

Silk's windowless bench and the three Rust apps' cpu mode move their clock 1/120 s a frame and run
frames back to back, so their idle CPU is not meaningful in the cpu suite (marked
`"meaningful": false`). Electron's offscreen mode runs on its real clock.
