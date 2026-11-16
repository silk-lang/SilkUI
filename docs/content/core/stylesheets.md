# Stylesheets

A stylesheet is another way to give a tree its CSS. Keep using `h.style` for values computed from your model, and use classes when you want shared rules, themes, or a CSS processor such as Tailwind. Both paths feed the same property resolver.

## Load CSS at build time

In `src/tasks.silk`, add files to the app definition in cascade order:

```silk
App.make("my-app")
  |> App.framework(Framework.loom("app"))
  |> App.stylesheet("styles/app.css")
  |> App.stylesheet("styles/theme.css")
```

The pipeline accepts ordinary CSS. It compiles and embeds sheets for native windows and WebGPU canvas apps, and links the original CSS for DOM pages. Compiled sheets are adopted before the first layout. Release hosts decode compiled sheets instead of parsing stylesheet text at startup.

In the view, use a literal class string:

```silk
h.box(
  &[h.class("card"), h.id("summary"), h.attribute("data-state", "ready")],
  &[h.text("Ready")],
)
```

```css
@layer components {
  .card {
    --card-gap: 12px;
    padding: var(--card-gap);
    border-radius: 8px;
    background-color: oklch(96% 0.02 250);
  }
  .card:hover { background-color: color-mix(in oklab, white 80%, blue); }
  .card[data-state="ready"] { border: 1px solid currentColor; }
}
```

`silk task dev` watches configured sheets and replaces their rules without resetting application state. A missing or invalid update keeps the previous sheet until a valid replacement arrives. Editing Silk code still rebuilds the application.

## Classes and inline styles

Sheet declarations follow CSS specificity, source order, layers and `!important`. The node's style object has the place of an inline style: it overrides normal sheet declarations, while important sheet declarations override normal inline values. State looks and state selectors read the same interaction state.

Custom properties inherit through the tree and can be written on either side. `h.customProperty("--card-gap", "16px")` sets an inline variable; a declaration using `var(--card-gap)` can read a value from a sheet or an ancestor. `@property` supplies registered defaults and inheritance behavior. Values such as `var()`, `calc()`, `oklch()` and `color-mix()` share the resolver used by style objects.

Selectors read element tags, IDs, classes, named attributes and state. `data-*` and literal `aria-*` attributes can be matched. Literal ARIA relation values name element IDs within the same root; typed protocol relations continue to use node numbers. Numeric `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` values also update native accessibility while retaining their literal spelling for selectors. Native `ValueRange` attributes expose the corresponding selector attributes. Explicit native roles and tab indices can be matched with `[role]` and `[tabindex]`; implicit defaults leave those attributes absent.

## Tailwind

Tailwind runs before the UI pipeline. Silk UI itself has no Tailwind dependency and can consume CSS from other processors too.

For a Loom app, use the optional `ui-tailwind` tasks package. Its `Tailwind.make("styles/input.css", "styles/app.css")` step builds the output before `App.build`; `processor.watching(...)` keeps its scanner running around a development task. The helper uses the project's installed CLI or the standalone version and SHA-256 pinned in `tailwind.lock.json`. A standalone build needs no Node installation.

```css
@import "tailwindcss" source(none);
@source "../src/**/*.silk";
```

```silk
h.box(&[h.class("flex gap-3 p-4")], children)
```

Class strings must be literal so Tailwind can find them. Classes assembled at runtime need an explicit source declaration in the Tailwind input.

The `ui-loom-tailwind`, `ui-react-tailwind`, `ui-foldkit-tailwind` and `ui-js-tailwind` templates show the complete setup. The original templates keep their style-object defaults. See the [Tailwind helper](https://github.com/silk-lang/SilkUI/tree/feat/stylesheets-tailwind/modules/tailwind) for build and watch examples and platform support.

## JavaScript apps

Import CSS from the Vite entry. With Tailwind, add `@tailwindcss/vite` before the Silk plugin:

```js
import tailwind from "@tailwindcss/vite";
import silk from "@silkui/vite";

export default { plugins: [tailwind(), silk({ entry: "src/main.ts" })] };
```

```js
import "./app.css";
```

`@silkui/vite` compiles Vite's processed CSS into `dist/app.sheet`; the app pipeline embeds it. Development CSS updates replace sheets in the running tree. React uses `className`, Foldkit uses `h.Class`, and core nodes expose `className`, `classList`, `id` and named attribute methods.

To construct a sheet dynamically, enable `App.runtimeStylesheets()` for a release host. Development hosts already include the text compiler. After mounting a root:

```js
import { CSSStyleSheet, root } from "@silkui/core";

const sheet = new CSSStyleSheet();
sheet.replaceSync(".card { padding: 20px; }");
root().adoptedStyleSheets = [sheet];
```

`replace(text)` returns a promise. `CSSStyleSheet.fromCompiled(bytes)` and `replaceCompiled(bytes)` need no text compiler. Replacing a sheet preserves its place in the adoption order.

## Runtime sources

Custom Silk hosts can load CSS text with `StyleSheet.load(&mut tree, run StyleSource.text(bytes))`, or a URL with `tree.loadStyleSheet(root, run StyleSource.url(url))`. Install the runtime compiler on the host loader, or use `App.runtimeStylesheets()` with a generated host. A compiled-only host rejects text loads before starting network I/O.

A handle exposes loading, ready or failed state, and methods to replace or remove the sheet. Loads reserve their cascade position immediately. A failed replacement preserves the old rules; a completion arriving after removal or another replacement is discarded.

Native file and HTTP reads run on workers. Canvas fetches follow browser URL and CORS rules; local files must be served over HTTP. DOM uses browser stylesheets and needs no Silk compiler option.

## Browser differences and current limits

On `web-dom`, the browser implements CSS. Window and canvas targets use the tree's CSS implementation:

- There is no HTML document stylesheet collection or HTML user-agent stylesheet. Nodes without an explicit tag match as `div`; tags such as `h1` do not bring browser default styles. Sheets belong to a tree root.
- Class, attribute, structural, combinator, state and `:has()` selectors, layers, nesting, custom properties, `@property`, `@media` and `@supports` are supported. Shadow DOM selectors match nothing.
- Media queries use the root's viewport and scale. Canvas also receives browser preference and pointer changes. Native windows supply appearance and desktop pointer capabilities; native reduced-motion and forced-colors preferences are not exposed by the platform API yet.
- CSS transitions and `@starting-style` rules use the existing motion engine, including custom properties, cascade priority, and entry after `display: none`. Starting styles inherit the parent’s normal after-change style, as in the browser. Inspector overrides apply after motion.
- Sheet `@keyframes` use the same animation engine as inline keyframe definitions. Names are scoped to the root, with layer, adoption and media-condition ordering. Keyframe values resolve variables per node; replacing the sheet preserves the animation's clock. Important declarations override animated values. Animating custom properties themselves is not implemented and produces a build warning.
- `::before` and `::after` on box nodes support string and `attr()` content, including empty strings. Generated boxes participate in layout, paint, motion, and accessible names; pointer actions target their originating node. Counters, quote controls, and image content remain unsupported.
- `::selection` on inputs supports foreground and background colors, with a separate highlight inheritance chain, custom properties, origin states, and container queries. Transparent foregrounds replace selected ink; rich-text runs share the input highlight. Selection text shadows and decoration overrides remain incomplete. Selectors for unavailable parts such as `::marker`, `::backdrop`, and `::file-selector-button` produce build diagnostics.
- `::placeholder` supports fonts, foreground and background colors, opacity, text spacing, and text decorations. It has its own font metrics and container-unit dependencies, without changing typed text or rich runs. Its line height remains `normal`; layout, writing-mode, and text-shadow overrides, and part transitions and animations, are not implemented.
- `::-webkit-scrollbar`, `::-webkit-scrollbar-thumb`, and `::-webkit-scrollbar-track` style the existing overlay scrollbars. Solid backgrounds, borders, corner radii, visibility, and scrollbar width and height are supported; painting and dragging share the styled dimensions. Origin states, container queries, and relative units work. Standard `scrollbar-width: thin` or `none` takes precedence over vendor part rules. The native overlay does not reserve a layout gutter, retains its native minimum thumb size and default appearance, and has no buttons or corner part. Part states (such as `::-webkit-scrollbar-thumb:hover`), gradients, shadows, and part motion remain unsupported.
- Size container queries support `container-name`, `container-type: size` and `inline-size`, physical and logical dimensions, ranges, boolean conditions, and query lists. The six container units (`cqw`, `cqh`, `cqi`, `cqb`, `cqmin`, `cqmax`) also work in style objects, grid tracks, transforms, paint effects, and keyframes. Layout settles within the same frame while preserving motion. Missing unit axes fall back to the viewport. Style and scroll-state queries remain unsupported.
- Use the app's font-loading API for fonts. Sheet `@font-face` loading and nested `@import` loading are not implemented on tree targets. Ordinary lengths, transforms, grid tracks, and paint effects use measured font bases for `ch`, `ex`, `cap`, `lh` and their root-relative forms. Relative font sizes use parent metrics; other lengths use the resolved element font and line height. The same bases apply to starting styles, keyframes, and rich-text runs; font-size animations update dependent lengths in the same frame. Some compound value grammars remain incomplete.
- Unknown properties, vendor selectors and other dropped features produce compiler diagnostics. Vite's `strictStylesheets: true` option can turn diagnostics into a build failure. Tailwind preflight includes browser-specific form-control rules that the tree drops.
- Local class and pointer-state changes restyle the affected subtree when selector dependencies allow it. Ancestor and sibling dependencies, custom-property inputs, display changes, and other mutations conservatively restyle the root. Identical variable scopes, including registered defaults, survive partial passes; inline custom properties or scope-cache pressure require a full reset. Repeated cascade results are shared within each pass. Per-node resolved storage and matching caches are still being developed. Style-object-only roots retain their existing path.

The tree's property coverage suite checks the supported declarations through both style objects and compiled sheets. A stylesheet does not add rendering support for a property the tree does not yet implement.

Next: [Images and fonts](/core/images-and-fonts/).
