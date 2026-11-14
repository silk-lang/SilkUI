# @silk/ui-react

A React renderer for the Silk UI tree, for applications that run on the embedded SilkJS
engine. See [ui-js](../../README.md) for the props and an example.

The package ships TypeScript types for the tree's elements. With `"jsx": "react-jsx"` and
`"jsxImportSource": "@silk/ui-react"` in `tsconfig.json`, `<box>`, `<input>`, `<richinput>`,
`<image>`, `<icon>` and `<canvas>` are checked against their props and events, and refs are
the `@silk/ui` node classes. Install `@types/react` beside it.
