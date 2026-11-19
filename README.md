# xbench

A benchmark of UI frameworks on the same content: Silk UI + React, Silk UI + Loom, Silk UI with
a hand-built tree, Electron, GPUI, Rune and FerroUI.

- SCENES.md: the four scenes (long feed, a wall of visible cells, a growing chat stream, memory
  churn) and their scripts.
- METRICS.md: what is measured, how, and why the GPU suite runs uncapped.
- PROTOCOL.md: the `XB ...` lines an app prints and what the runner does with them.
- LOG.md: what each app does differently. Read it before comparing numbers.

## Two suites

- `--suite cpu` runs with no window, display or GPU. It runs anywhere, including the cloud.
- `--suite gpu` opens real windows and presents frames. It needs a display and a GPU, and it takes
  over the screen while it runs.

## Build

Everything builds from `xbench/`. Linux needs `xvfb` for Electron, and the GPUI build needs
`libxkbcommon-x11-dev`, `libxcb1-dev` and `libfreetype-dev`.

```sh
# React (for Electron and Silk UI + React)
(cd apps/react/web && npm ci)
for s in feed wall stream churn; do (cd apps/react/web && VITE_XB_SCENE=$s npx vite build --config vite.web.config.js); done
(cd apps/electron && npm ci)

# Silk UI apps (SILKUI is the Silk UI checkout; LOOM the Loom checkout for silk-loom)
SILKUI=... apps/silk-react/build.sh
SILKUI=... tools/silk-native-build.sh apps/silk-direct
SILKUI=... LOOM=... tools/silk-native-build.sh apps/silk-loom

# Rust apps (each fetches its framework at a pinned commit; FerroUI comes from crates.io)
apps/rune/fetch.sh && (cd apps/rune && cargo build --release)
apps/gpui/fetch.sh && (cd apps/gpui && cargo build --release)
(cd apps/ferroui && cargo build --release)
```

The Rust apps pin their toolchain with `rust-toolchain.toml`, so rustup installs it on first build.

## Run

```sh
runner/xbench.py run --suite cpu --runs 5                    # every app, every scene
runner/xbench.py run --suite cpu --apps rune,silk-direct --scenes feed
runner/xbench.py start --suite gpu --runs 10                 # start-up only: 1 cold, then warm
runner/xbench.py run --suite gpu --uncapped --runs 3         # the full GPU suite (macOS)
```

- `--cold N`: how many of the first runs start cold (default 1).
- `--label TEXT`: stored with every record, to say what changed ("after the font scan fix").
- `--prime N`: discarded launches per app first (default 1 on macOS, for its first-launch check).
- macOS cold runs need `sudo purge`: set `XB_PURGE_SECRET` to a file that holds the password, or
  allow `purge` without one in sudoers. Without either, results say `cache_dropped: false`.
- GPU runs need the Mac unlocked and nothing in front of the windows.

Every run appends one JSON line to `results/<suite>.jsonl`, with the machine, the date and the
commit of each framework. The comparison page reads those files, so runs from different days
show up as history.
