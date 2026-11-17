#!/bin/sh
# Writes plans.tailwind.css from plans.tailwind.input.css. Run it after changing the classes in
# src/core/plans_tailwind.silk: the output is committed, so the docs build needs no Tailwind.
set -e
cd "$(dirname "$0")"
tools="${TMPDIR:-/tmp}/silkui-docs-tailwind"
mkdir -p "$tools"
npm install --silent --prefix "$tools" --no-audit --no-fund tailwindcss@4.3.5 @tailwindcss/cli@4.3.5
NODE_PATH="$tools/node_modules" "$tools/node_modules/.bin/tailwindcss" -i plans.tailwind.input.css -o plans.tailwind.css
python3 sync.py
