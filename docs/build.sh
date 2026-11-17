#!/bin/sh
# Builds the docs into docs/dist: the program, the host script, the fonts, the pictures, and a page for
# every route, drawn ahead of time and hydrated by the program when it loads.
#
#   docs/build.sh                 a site at the root of its origin
#   docs/build.sh --base /docs    a site under /docs
#   docs/build.sh serve           builds, then serves it on http://localhost:8017
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$here/dist"
base=""
serve=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="${2%/}"; shift ;;
    serve) serve=1 ;;
  esac
  shift
done

cd "$root"
request_output() {
  silk plan --manifest-path "$1"
  python3 "$root/tools/request-output.py" "$root/build/requests" "$2"
}
# The program is downloaded by every reader, so it is built for size, without debug information.
silk build --manifest-path docs/silk.toml \
  --target wasm32-unknown-unknown --optimization size --debug false
# The window examples for a WebGPU canvas: the pages run them where a browser can.
silk build --manifest-path docs/live/silk.toml \
  --target wasm32-unknown-unknown --optimization size --debug false
# The same program for this machine draws the pages.
silk build --manifest-path docs/silk.toml
host="$(request_output docs/silk.toml ui-docs-site)"
# The pictures: the example programs, run with no window and drawn on the CPU.
silk build --manifest-path docs/shots/silk.toml
shots="$(request_output docs/shots/silk.toml ui-docs-shots)"
silk build --manifest-path docs/examples/apps/tree-hello/silk.toml
tree="$(request_output docs/examples/apps/tree-hello/silk.toml tree-hello)"

rm -rf "$out"
mkdir -p "$out"
dom="$(silk package-path --manifest "$here/silk.toml" --dependency loom_dom --path js/silk-ui-dom.js | python3 -c 'import json,sys; print(json.load(sys.stdin))')"
cp "$dom" "$out/silk-ui-dom.js"
cp "$here/web/favicon.svg" "$out/favicon.svg"
cp -R "$here/web/fonts" "$out/fonts"
# The sheet of the stylesheet demo, linked by the page as any site links its CSS.
mkdir -p "$out/styles"
cp "$here/styles/plans.css" "$out/styles/plans.css"
cp "$here/styles/inbox.tailwind.page.css" "$out/styles/inbox.tailwind.page.css"
# The album's photos, icons and fonts, at the root as its relative URLs name them.
cp -R "$here/examples/apps/album/assets/photos" "$out/photos"
cp -R "$here/examples/apps/album/assets/icons" "$out/icons"
cp "$here/examples/apps/album/assets/fonts/"*.ttf "$out/fonts/"
cp "$root/build/wasm32-unknown-unknown/size/ui-docs-site.wasm" "$out/site.wasm"
mkdir -p "$out/shots"
"$shots" "$out/shots"
(cd "$out/shots" && "$tree" && mv hello.png tree-hello.png)

# The running examples: the module, the canvas host of ui-tree-window, and the window and WebGPU
# hosts of lib-native it imports. A static server gives a .ts file the wrong type, and the
# imports name paths from a development server's root, so both are rewritten on the way.
windows="$(silk package-path --manifest "$here/live/silk.toml" --dependency window --path browser | python3 -c 'import json,sys; print(json.load(sys.stdin))')"
webgpu="$(silk package-path --manifest "$here/live/silk.toml" --dependency webgpu --path browser | python3 -c 'import json,sys; print(json.load(sys.stdin))')"
mkdir -p "$out/live/window" "$out/live/webgpu"
cp "$here/web/live.html" "$out/live/index.html"
cp "$root/build/wasm32-unknown-unknown/size/ui-docs-live.wasm" "$out/live/app.wasm"
sed -e "s|'/native/platform/window/browser/window-host.js'|'./window/window-host.js'|" \
  -e "s|'/native/gpu/webgpu/browser/host.ts'|'./webgpu/host.js'|" \
  "$root/modules/tree/window/browser/app-host.js" > "$out/live/app-host.js"
for file in window-host imports keys; do
  cp "$windows/$file.js" "$out/live/window/$file.js"
done
for file in host generated_schema; do
  sed -e "s|\./generated_schema\.ts|./generated_schema.js|" \
    "$webgpu/$file.ts" > "$out/live/webgpu/$file.js"
done

"$host" "$here/web/index.html" "$out" "$base"
echo "Built $out"

if [ -n "$serve" ]; then
  cd "$out"
  exec python3 -m http.server 8017
fi
