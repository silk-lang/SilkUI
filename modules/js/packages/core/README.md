# @silkui/core

The node and event API of a [Silk UI](https://github.com/silk-lang/SilkUI) tree, for
JavaScript apps that run on the SilkJS engine embedded in a Silk UI program. Its nodes are
the tree's own (box, text, input, rich input, image, canvas) and inline svg. Its methods and its
event flow are the DOM's: `appendChild`, `addEventListener`, capture and bubble,
`preventDefault`.

`@silkui/react` and `@silkui/foldkit` are built on it. Use it directly for a plain
JavaScript or TypeScript app, or to draw on nodes from inside a framework app.

## Install

The quickest start is a template, which sets up the Silk host, Vite and this package:

```sh
silk init my-app -t ui-js   # plain TypeScript; ui-react and ui-foldkit use this package too
cd my-app
silk task dev
```

See [Get started](https://silk-ui-docs.juliaortiz-js.workers.dev/start/). To add it to an
existing Silk UI web project:

```sh
npm install @silkui/core
```

The package runs inside a Silk UI host (the native window, or the web canvas), which provides
the native functions it calls. It does not run in Node or in a plain browser page by itself.

## Usage

```ts
import { createBox, createText, mount } from "@silkui/core";

const label = createText("Clicked 0 times");
const button = createBox(
  { paddingTop: 12, paddingBottom: 12, paddingLeft: 20, paddingRight: 20, borderRadius: 10, backgroundColor: "rgb(37, 99, 235)", color: "white" },
  label,
);
button.tabIndex = 0;
button.look("hover").set({ backgroundColor: "rgb(59, 130, 246)" });

let clicks = 0;
button.addEventListener("click", () => {
  clicks += 1;
  label.data = `Clicked ${clicks} times`;
});

mount(createBox({ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }, button));
```

## API

### Nodes

| Export | What it does |
| --- | --- |
| `createBox(style?, ...children)` | A box with `style` as its base look. Strings among the children become text nodes |
| `createText(data?)` | A text node. It takes its look from its parent |
| `createInput(style?)` | An editable text field. `value`, `selectionStart`, `selectionEnd`, `selectionDirection`, `setSelectionRange`, `select` and `setRangeText` work as on an `<input>`, in UTF-16 string indices |
| `createRichInput(style?)` | A text field with marks and inline atoms (see below) |
| `createImage(src, style?)` | An image, as an `<img>`: `src` is a `data:` URL, a file or an `http(s):` address. An SVG file draws as an inline `<svg>` |
| `createSvgElement(tag)` | `document.createElementNS` for SVG: an `Svg` root for `"svg"`, else an `SvgElement` (`path`, `g`, ...) to append inside one |
| `createNode(kind)` | A node of any kind: `"box"`, `"text"`, `"input"`, `"richinput"`, `"image"` (or `"img"`), `"canvas"`, `"svg"` |
| `mount(node)` / `root()` | Makes a node the root of the window's tree, or returns it |
| `nodeById(id)` | The node with a tree id, for hosts and tools |

An `Svg` is one node whose markup its `SvgElement` and text children make, as an inline
`<svg>` is on a page. Class, look, events and ARIA attributes are the node's; `viewBox`,
`fill`, `width` and every other attribute are markup, and React's spellings (`strokeWidth`)
work too. Changes are drawn once, before the host applies the batch (`flushSvg()` draws them
now). Without a CSS size it takes the `<svg>`'s `width` and `height`, else a square of the
font size. Elements inside it hear no events: listen on the `Svg`.

A node has `append`, `appendChild`, `insertBefore`, `removeChild`, `remove`, `contains`,
`parentNode`, `childNodes`, `firstChild`, `lastChild` and the sibling getters, as in the DOM.
A removed node keeps its state and can be inserted again. `destroy()` frees a node and its
subtree for good. `focus()` and `scrollTo(x, y)` do what their names say.

### Style and looks

```ts
node.style.set({ width: 120, flexGrow: 1, fontFamily: "Noto Sans, sans-serif" });
node.style = { height: 40 };             // replaces the base look
node.look("hover").set({ opacity: 0.8 }); // also "active", "focus", "focusVisible"
node.look("starting").set({ opacity: 0 }); // what transitions start from, as @starting-style
```

- Properties use their camel case names, typed from `csstype`. Numbers are CSS pixels,
  except for unitless properties such as `opacity`, `flexGrow`, `zIndex` and `lineHeight`.
  `null` takes a property out.
- Layout is CSS: flex, grid (`gridTemplateColumns: "auto 1fr"`, `repeat()`, `minmax()`,
  named lines, `gridTemplateAreas`, `gridArea`, `gridColumn: "span 2"`) and positioning.
  Grid properties apply from the base look only.
- `fontFamily` takes CSS `font-family` text, resolved in the host's fonts.
- `transition` and `animation` work as in CSS. `defineKeyframes(name, { from: {...}, "50%": {...}, to: {...} })`
  defines `@keyframes` for them.

### Events

```ts
node.addEventListener("pointerdown", (event) => event.preventDefault(), { capture: true });
```

An event runs the capture phase from the root down, the target, then bubbles, with
`stopPropagation`, `stopImmediatePropagation`, `preventDefault` and `composedPath`, as on the
web. Listeners run before the tree's default action, so `preventDefault()` on a
`pointerdown` keeps the focus where it is. `dispatchEvent(event)` runs an `Event` you made
through the tree.

| Events | Members |
| --- | --- |
| `pointerdown`, `pointerup`, `click` | `clientX`, `clientY`, `button`, `detail` (2 for a double click), modifier keys |
| `pointermove`, `pointerenter`, `pointerleave`, `pointercancel` | `clientX`, `clientY`, modifier keys |
| `wheel` | `deltaX`, `deltaY` |
| `keydown`, `keyup` | `key`, `code`, `repeat`, modifier keys |
| `focus`, `blur`, `load`, `error`, `gotpointercapture`, `lostpointercapture` | |
| `input` | `value`, `inputType`, and `document` on a rich input |
| `selectionchange` | `selectionStart`, `selectionEnd` |
| `scroll` | `scrollLeft`, `scrollTop` |
| `layout` | `bounds`: where layout put the node, in window pixels |
| `transitionrun`, `transitionstart`, `transitionend`, `transitioncancel` | `propertyName`, `elapsedTime` |
| `animationstart`, `animationiteration`, `animationend`, `animationcancel` | `animationName`, `elapsedTime` |
| `dragenter`, `dragover`, `dragleave`, `drop` | `clientX`, `clientY`, `dataTransfer` (files dragged in from other apps) |

A listener that throws does not stop the dispatch. `setErrorHandler(handler)` receives the
exception; without one the host reports it.

### The desktop

Files dragged in from other apps fire `dragenter`, `dragover`, `dragleave` and `drop` on the
node under them, and bubble, as on the web. `event.dataTransfer.types` is `["Files"]` while
they are over the window, and `drop` lists them in `dataTransfer.files`, each with its `name`
and its `path` on disk.

```ts
zone.addEventListener("drop", (event) => open(event.dataTransfer.files[0].path));
```

`Notification` is the web's: `new Notification("Built", { body: "In 2 s" })`, with `onclick`.
Permission is always granted. Two things the web has no API for come from the package:

```ts
import { setTray, registerShortcut } from "@silkui/core";

setTray({
  icon: { width: 32, height: 32, data: pixels }, // RGBA, as an ImageData
  tooltip: "Builds",
  menu: [{ label: "Build now", click: build }, { type: "separator" }, { label: "Quit", click: quit }],
});
registerShortcut("Mod+Shift+B", build); // Mod is Command on macOS, Control elsewhere
```

`setTray` and `registerShortcut` resolve to whether the system took them. A shortcut works
whichever app has focus; another app may hold it, and Wayland has none. `removeTray()` and
`unregisterShortcut(accelerator)` undo them.

`memoryUsage()` is the app's memory as the system shows it to users, to put next to an
Electron app's in Activity Monitor or Task Manager. It is synchronous and allocates almost
nothing, so it can run every second.

```ts
import { memoryUsage } from "@silkui/core";

const { footprint, processes } = memoryUsage(); // bytes, and how many processes they cover
```

`footprint` is `phys_footprint` on macOS (Activity Monitor's "Memory", `/usr/bin/footprint`),
`Pss` from `/proc/self/smaps_rollup` on Linux and `PrivateUsage` on Windows. `processes` is 1:
the host runs the app, its tree and its JavaScript in one process. In a web-canvas build it
is the wasm tree's memory only, without the page's JavaScript heap. It is `null` when the
host cannot say.

`frameStats()` says what reached the screen since its last call: frames presented, presents
per second, painted frames the GPU never drew, and the milliseconds between presents. Count
frames with it rather than with `requestAnimationFrame`, which runs once per frame the app
paints, not per frame the display shows.

```ts
import { frameStats } from "@silkui/core";

setInterval(() => {
  const { fps, dropped, p95 } = frameStats();
}, 1000);
```

Intervals are taken where the render thread presents, and a gap over a second (an idle
window) is left out of the percentiles. It is `null` in a browser build.

### Attributes and accessibility

`setAttribute(name, value)` sets the tree's attributes: `tabIndex`, `disabled`, `label`,
`testId`, `placeholder`, `multiline`, `readOnly`, `checked`, `selected`, `expanded`,
`focusTrap`, `inert`, `href`, `cursor` and `transition`, plus `id`. A name the tree does not
have throws a `TypeError`. `tabIndex` and `disabled` are also properties.

- `role` and the ARIA attributes work as in the DOM, spelled `aria-label` or `ariaLabel`.
  `aria-labelledby`, `aria-describedby`, `aria-controls` and `aria-activedescendant` name
  other nodes by their `id`.
- `announce(message, { politeness })` has screen readers say a message nothing on screen shows.
- `inert` puts a subtree out of reach of focus, pointers and screen readers, as in HTML.
- A node with an `href` is a link: a click on it that no listener prevented opens the address.

### Rich inputs

A rich input edits a document of styled text and inline atoms (mentions, chips):

```ts
import { createRichInput, OBJECT } from "@silkui/core";

const field = createRichInput({ width: 400 });
field.defineMark("bold", { fontWeight: 700 });
field.defineAtom("mention", { backgroundColor: "rgb(219, 234, 254)", borderRadius: 4 });
field.document = { text: `Hi ${OBJECT}`, marks: [], atoms: [{ kind: "mention", label: "@ada", data: "user-1" }] };
field.addEventListener("input", (event) => save(event.document));
```

- An atom sits in `text` as one `OBJECT` character (U+FFFC), so the caret steps over it and
  Backspace deletes it whole. Offsets are string indices.
- `format(name, on)` and `toggleMark(name)` mark the selection, or the text typed next at a
  caret. `activeMarks` holds the marks typed text gets.
- `insertAtom(start, end, atom)` replaces a range with an atom, such as a `@` trigger
  turning into a mention. Listen for `selectionchange` to open a picker.
- Undo, IME and copy work as in a plain input.

### Markdown

`parseMarkdown(text, options?)` returns the syntax tree of Markdown text in the shape of
[mdast](https://github.com/syntax-tree/mdast), the tree remark gives, so renderers written
for remark work on it and the app needs no Markdown parser in its bundle. It is CommonMark
with GitHub's tables, strikethrough, task lists and autolinks (`gfm: false` turns them off,
or set `tables`, `strikethrough`, `taskLists` and `autolinkLiterals` one by one).
`footnotes`, `frontmatter` and `alerts` (`> [!NOTE]`) turn on more. Nodes have no
`position`.

## TypeScript

The package ships its types. Every node class, event and style property is typed, and
`addEventListener` gives each listener the event of its type. `parseMarkdown` returns the
`mdast` `Root` type.

## More

- [The ui-js reference](https://github.com/silk-lang/SilkUI/blob/main/modules/js/README.md):
  every package, the host, and the web globals a realm has.
- [Templates](https://github.com/silk-lang/examples) and
  [Get started](https://silk-ui-docs.juliaortiz-js.workers.dev/start/).
- [Source](https://github.com/silk-lang/SilkUI/tree/main/modules/js/packages/core). MIT license.


## Stylesheets

CSS imports built with `@silkui/vite` are adopted before the first frame and replaced in
place during development. For application-managed themes, adopt constructed sheets on the
node passed to `mount`:

```js
import { CSSStyleSheet, createBox, mount } from "@silkui/core";

const theme = new CSSStyleSheet();
theme.replaceSync(".card { padding: 12px; color: rebeccapurple }");
const app = createBox();
app.className = "card";
app.adoptedStyleSheets = [theme];
mount(app);
await theme.replace(".card { padding: 18px; color: teal }");
```

JavaScript development hosts include the text compiler. Release hosts require
`App.runtimeStylesheets()` in their Silk task pipeline. Without that option they accept
compiled sheets and reject text compilation. The compiler is linked only when enabled.

`adoptedStyleSheets` is an ordered mutable array. Assignment, `push`, `splice`, reordering,
and shrinking `length` update the active root. Entries must be constructed `CSSStyleSheet`
objects; deleting an indexed property or creating holes is invalid. The same sheet can
appear multiple times, and replacing it updates each adoption. Invalid compiled bytes leave
the current sheet intact. Replacing the mounted root switches to that node's adopted list.

`CSSStyleSheet.fromCompiled(bytes)` creates a sheet from `Uint8Array`, `ArrayBuffer`, or
Base64-encoded compiled bytes; `sheet.replaceCompiled(bytes)` updates it. The format is
versioned and must match the host. Build-time sheets come first, followed by imported CSS
and the root's constructed sheets. There is no `document`, `<style>`, or `<link>` node;
`cssRules`, `insertRule`, and `deleteRule` are not part of this API.
