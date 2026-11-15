# @silkui/react

A React renderer for the Silk UI tree, for applications that run on the embedded SilkJS
engine. See [ui-js](../../README.md) for the props and an example.

The package ships TypeScript types for the tree's elements. With `"jsx": "react-jsx"` and
`"jsxImportSource": "@silkui/react"` in `tsconfig.json`, `<box>`, `<input>`, `<richinput>`,
`<image>`, `<icon>` and `<canvas>` are checked against their props and events, and refs are
the `@silkui/core` node classes. Install `@types/react` beside it.

For a Vite build, add `react()` from `@silkui/react/vite` beside `@silkui/vite`'s `silk()`:
JSX through this package, a fix for the reconciler's quadratic sibling walk, and React Fast
Refresh under the dev server (`react({ refresh: false })` turns it off).
