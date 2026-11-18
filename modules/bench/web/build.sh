#!/bin/sh
# Builds the entry into the js-framework-benchmark checkout at $1 (frameworks/keyed/silk-ui).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
target="${1:?usage: build.sh <js-framework-benchmark checkout>}/frameworks/keyed/silk-ui"
optimization="${OPTIMIZATION:-speed}"

# The linker's default stack is 1 MiB, which a page holds from the start whether it uses it or
# not. The entry runs in 64 KiB (10,000 rows), so 256 KiB leaves room.
cd "$root"
silk build --manifest-path "$here/silk.toml" \
  --target wasm32-unknown-unknown --optimization "$optimization" --debug false

# With PRERENDER=1 the same program, built for this machine, draws the first view, which goes
# into index.html. It is off by default: the entries the benchmark compares this one with
# render from script, so a first paint measured with it on is not theirs to compare.
prerender="${PRERENDER:-0}"
if [ "$prerender" = 1 ]; then
  silk build --manifest-path "$here/silk.toml"
  silk plan --manifest-path "$here/silk.toml"
  native="$(python3 "$root/tools/request-output.py" "$root/build/requests" ui-bench-web)"
fi

profile=release
[ "$optimization" = "size" ] && profile=size
mkdir -p "$target/dist"
cp "$here/page/package.json" "$here/page/package-lock.json" "$target/"
# index.html up to the marker, then the first view with nothing around it (white space would
# be nodes the program did not make) or nothing at all, and the rest.
before="$(sed '/<!--shell-->/,$d' "$here/page/index.html")"
after="$(sed '1,/<!--shell-->/d' "$here/page/index.html")"
{
  printf '%s' "$before"
  if [ "$prerender" = 1 ]; then "$native" shell; fi
  printf '%s\n' "$after"
} > "$target/index.html"
cp "$root/build/wasm32-unknown-unknown/$profile/ui-bench-web.wasm" "$target/dist/bench.wasm"
dom="$(silk package-path --manifest "$here/silk.toml" --dependency loom_dom --path js/silk-ui-dom.js | python3 -c 'import json,sys; print(json.load(sys.stdin))')"
cp "$dom" "$target/dist/silk-ui-dom.js"
echo "Built $target"
