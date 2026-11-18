/** A constructed stylesheet. Text loading requires runtime stylesheet compilation in the host. */
export class CSSStyleSheet {
  static fromCompiled(bytes: Uint8Array | ArrayBuffer | string): CSSStyleSheet;
  replaceCompiled(bytes: Uint8Array | ArrayBuffer | string): void;
  replaceSync(text: string): void;
  replace(text: string): Promise<CSSStyleSheet>;
}
/** Used by build tools to replace or remove a compiled CSS import without restarting the app. */
export function updateStyleSheet(id: string, compiled: Uint8Array | ArrayBuffer | string | null): void;

import type * as CSS from "csstype";

/** The node kinds of the tree. `richinput` is an `input` with marks and atoms. */
export type NodeKind = "box" | "text" | "input" | "richinput" | "image" | "canvas" | "svg";

/** The looks a state lays over the base look: `:hover`, `:active`, `:focus`, `:focus-visible`, `@starting-style`. */
export type LookState = "base" | "hover" | "active" | "focus" | "focusVisible" | "starting";

/**
 * Style properties by their camel case names. Numbers are CSS pixels except for unitless
 * properties (`opacity`, `flexGrow`, `zIndex`, `fontWeight`, `lineHeight` and the like).
 * `null`, `undefined` and `""` take a property out.
 */
export type Style = {
  [K in keyof CSS.Properties<string | number>]?: CSS.Properties<string | number>[K] | null;
};

/** The declarations of one look of a node. */
export interface Look {
  /** Sets properties over the ones the look has. */
  set(properties: Style): void;
  /** Replaces the whole look. */
  replace(properties: Style): void;
  /** A property as the tree got it, in CSS text (`"120px"`). */
  get(name: keyof Style): string | undefined;
  readonly cssText: string;
}

export type Listener<E extends Event = Event> = ((this: Node, event: E) => void) | { handleEvent(event: E): void };
export type ListenerOptions = boolean | { capture?: boolean; once?: boolean };

/** Live tokens in a node's class attribute. */
export class ClassList implements Iterable<string> {
  constructor(node: Node);
  value: string;
  readonly length: number;
  item(index: number): string | null;
  contains(token: string): boolean;
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
  toggle(token: string, force?: boolean): boolean;
  replace(oldToken: string, newToken: string): boolean;
  values(): IterableIterator<string>;
  keys(): IterableIterator<number>;
  entries(): IterableIterator<[number, string]>;
  forEach(callback: (value: string, index: number, list: ClassList) => void, thisArg?: unknown): void;
  [Symbol.iterator](): IterableIterator<string>;
  toString(): string;
}

/** A node of the tree. Make one with `createBox`, `createText`, `createInput` or `createNode`. */
export class Node {
  constructor(kind: NodeKind);
  /** Stable protocol identifier, independent of the CSS id attribute. */
  readonly nodeId: number;
  id: string;
  className: string;
  adoptedStyleSheets: CSSStyleSheet[];
  readonly classList: ClassList;
  readonly kind: NodeKind;
  readonly parentNode: Node | null;
  readonly childNodes: readonly Node[];
  readonly firstChild: Node | null;
  readonly lastChild: Node | null;
  readonly nextSibling: Node | null;
  readonly previousSibling: Node | null;
  /** 1 for an element, 3 for text, 11 for a document fragment, as in the DOM. */
  readonly nodeType: 1 | 3 | 11;
  hasChildNodes(): boolean;
  /** A copy with the same looks and attributes, and with `deep` copies of the children. */
  cloneNode(deep?: boolean): this;
  /** Joins adjacent text children and drops empty ones, in the whole subtree. */
  normalize(): void;
  /** Whether `other` is this node or inside it. */
  contains(other: Node | null): boolean;
  /** Puts `node` where `child` is and detaches `child`. */
  replaceChild<T extends Node>(node: Node, child: T): T;
  /** Inserts `child` before `before`, or last without it. A child already in the tree moves. */
  insertBefore<T extends Node>(child: T, before?: Node | null): T;
  appendChild<T extends Node>(child: T): T;
  /** Appends nodes, and strings as text nodes. */
  append(...children: (Node | string)[]): void;
  /** Detaches `child` and its subtree. It keeps its state and can be inserted again. */
  removeChild<T extends Node>(child: T): T;
  remove(): void;
  /** Detaches and frees this node and its subtree. They cannot be used again. */
  destroy(): void;
  /** The base look: `node.style.set({ width: 120 })` sets properties, `node.style = { ... }` replaces it. */
  get style(): Look;
  set style(properties: Style);
  /** The look the tree lays over the base in `state`. */
  look(state: LookState): Look;
  /**
   * Sets a tree attribute (`tabIndex`, `disabled`, `label`, `testId`, `placeholder`, `href`,
   * `cursor`, `multiline`, `readOnly`, `inert`, `focusTrap`, `transition`), `id`, `role`, or
   * an ARIA attribute spelled `aria-checked` or `ariaChecked`, or a `data-*` attribute.
   * `null` and `undefined` remove an attribute.
   */
  setAttribute(name: string, value: unknown): void;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
  set tabIndex(value: number);
  set disabled(value: boolean);
  focus(): void;
  /** As DOM `setPointerCapture`: throws `NotFoundError` for a pointer that is not down. */
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
  scrollTo(x: number, y: number): void;
  scroll(x: number, y: number): void;
  addEventListener<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>, options?: ListenerOptions): void;
  /** The app's own event types, sent with `dispatchEvent`. */
  addEventListener(type: string, listener: (event: globalThis.Event) => void, options?: ListenerOptions): void;
  removeEventListener<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>, options?: ListenerOptions): void;
  removeEventListener(type: string, listener: (event: globalThis.Event) => void, options?: ListenerOptions): void;
  /** Sends `event` through the tree from this node, as on the web. False when a listener prevented the default. */
  dispatchEvent(event: globalThis.Event): boolean;
}

/** A text leaf. It takes its look from its parent. */
export class Text extends Node {
  constructor(data?: string);
  data: string;
  nodeValue: string;
  textContent: string;
  /** In UTF-16 code units. */
  readonly length: number;
  substringData(offset: number, count: number): string;
  appendData(data: string): void;
  insertData(offset: number, data: string): void;
  deleteData(offset: number, count: number): void;
  replaceData(offset: number, count: number, data: string): void;
  /** Splits at `offset`: this keeps the text before it, and a new next sibling the rest. */
  splitText(offset: number): Text;
}

/** Nodes held together outside the tree. Inserting it inserts its children and empties it. */
export class DocumentFragment extends Node {
  constructor();
}

export function createDocumentFragment(): DocumentFragment;

/** Two boundary points: a node and an offset (a child index, or UTF-16 units in text). */
export abstract class AbstractRange {
  readonly startContainer: Node;
  readonly startOffset: number;
  readonly endContainer: Node;
  readonly endOffset: number;
  readonly collapsed: boolean;
}

export interface StaticRangeInit {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
}

/** A range that does not follow changes to the tree. */
export class StaticRange extends AbstractRange {
  constructor(init: StaticRangeInit);
}

/** A live range over the app's nodes, as the DOM Standard defines it. */
export class Range extends AbstractRange {
  static readonly START_TO_START: 0;
  static readonly START_TO_END: 1;
  static readonly END_TO_END: 2;
  static readonly END_TO_START: 3;
  readonly START_TO_START: 0;
  readonly START_TO_END: 1;
  readonly END_TO_END: 2;
  readonly END_TO_START: 3;
  /** Collapsed at the start of the mounted root. */
  constructor();
  readonly commonAncestorContainer: Node;
  setStart(node: Node, offset: number): void;
  setEnd(node: Node, offset: number): void;
  setStartBefore(node: Node): void;
  setStartAfter(node: Node): void;
  setEndBefore(node: Node): void;
  setEndAfter(node: Node): void;
  collapse(toStart?: boolean): void;
  selectNode(node: Node): void;
  selectNodeContents(node: Node): void;
  compareBoundaryPoints(how: 0 | 1 | 2 | 3, sourceRange: Range): -1 | 0 | 1;
  comparePoint(node: Node, offset: number): -1 | 0 | 1;
  isPointInRange(node: Node, offset: number): boolean;
  intersectsNode(node: Node): boolean;
  cloneRange(): Range;
  detach(): void;
  deleteContents(): void;
  extractContents(): DocumentFragment;
  cloneContents(): DocumentFragment;
  insertNode(node: Node): void;
  surroundContents(newParent: Node): void;
  toString(): string;
}

/** A new live range, collapsed at the start of the root. */
export function createRange(): Range;

/**
 * An editable text field. `value` follows what the user types. Selection offsets are UTF-16
 * string indices, as on the web.
 */
export class Input extends Node {
  constructor();
  /** Setting a different value puts the caret at its end. */
  value: string;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: "forward" | "backward" | "none";
  /** Selects `start` to `end`; with `direction` "backward" the caret sits at `start`. */
  setSelectionRange(start: number, end: number, direction?: "forward" | "backward" | "none"): void;
  /** Selects the whole value. */
  select(): void;
  /** Replaces the selection with `replacement`. */
  setRangeText(replacement: string): void;
  /** Replaces `start` to `end` with `replacement` and places the selection by `selectionMode`. */
  setRangeText(
    replacement: string,
    start: number,
    end: number,
    selectionMode?: "select" | "start" | "end" | "preserve",
  ): void;
}

/** An inline atom of a rich input: a mention or a chip. */
export interface RichAtom {
  kind: string;
  label: string;
  data: string;
}

/** A styled run of a rich input's text. */
export interface RichMarks {
  start: number;
  end: number;
  marks: readonly string[];
}

/**
 * A rich input's content. Each atom sits in `text` as one `OBJECT` character; `atoms` lists
 * them in text order. Offsets are string indices.
 */
export interface RichDocument {
  text: string;
  marks: readonly RichMarks[];
  atoms: readonly RichAtom[];
}

/** Where an atom sits in a rich input's text: U+FFFC OBJECT REPLACEMENT CHARACTER. */
export const OBJECT: string;

/** A rich text field: marks and inline atoms over the text the user edits. */
export class RichInput extends Input {
  /** The marks text typed at the caret gets, as of the last change. */
  readonly activeMarks: readonly string[];
  /** Replacing it moves the caret to the end and forgets the undo history. */
  get document(): RichDocument;
  set document(document: Partial<RichDocument>);
  /** What text with mark `name` looks like. */
  defineMark(name: string, style: Style): void;
  /** What atoms of `kind` look like: the inline block holding the label. */
  defineAtom(kind: string, style: Style): void;
  /** Turns mark `name` on or off over the selection, or for the text typed next. */
  format(name: string, on?: boolean): void;
  toggleMark(name: string): void;
  /** Replaces the text from `start` to `end` with `atom`. */
  insertAtom(start: number, end: number, atom: RichAtom): void;
}

/**
 * An image, as an `<img>`: `src` is a `data:` URL, a file or `http(s):` address. An SVG
 * file draws as an inline `<svg>` does. It hears `load` and `error`.
 */
export class Image extends Node {
  constructor(src?: string);
  src: string;
}

/** Text inside an `<svg>`. */
export class SvgText {
  constructor(data?: string);
  data: string;
  textContent: string;
  readonly parentNode: SvgElement | Svg | null;
  remove(): void;
  destroy(): void;
}

/** An element inside an `<svg>` (`path`, `g`, `circle`...): markup its root draws, no node. */
export class SvgElement {
  constructor(tag: string);
  readonly localName: string;
  readonly tagName: string;
  readonly namespaceURI: string;
  readonly parentNode: SvgElement | Svg | null;
  readonly childNodes: (SvgElement | SvgText | Text)[];
  textContent: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  /** SVG's names, or React's spellings (`strokeWidth`, `xlinkHref`). */
  setAttribute(name: string, value: unknown): void;
  removeAttribute(name: string): void;
  insertBefore<T extends SvgElement | SvgText | Text>(child: T, before?: SvgElement | SvgText | Text | null): T;
  appendChild<T extends SvgElement | SvgText | Text>(child: T): T;
  append(...children: (SvgElement | SvgText | Text | string)[]): void;
  removeChild<T extends SvgElement | SvgText | Text>(child: T): T;
  remove(): void;
  destroy(): void;
}

/**
 * An inline `<svg>`: one node drawing the markup its `SvgElement` children make, at its CSS
 * size (else its `width` and `height`, else a square of the font size), with its `color` as
 * `currentColor`. Class, look, events and ARIA are the node's; `viewBox`, `fill`, `width`
 * and the rest are markup.
 */
export class Svg extends Node {
  constructor();
  readonly outerHTML: string;
  textContent: string;
}

/** An event of the tree, with the members of the DOM event it corresponds to. */
export class Event {
  constructor(type: keyof EventMap, target: Node);
  readonly type: keyof EventMap;
  readonly target: Node;
  readonly currentTarget: Node | null;
  /** 0 none, 1 capturing, 2 at the target, 3 bubbling. */
  readonly eventPhase: 0 | 1 | 2 | 3;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
  /** The nodes the event passes, target first. */
  composedPath(): Node[];
}

export interface ModifierEvent extends Event {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export interface PointerEvent extends ModifierEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly x: number;
  readonly y: number;
  /** 1 for the mouse, 2 and up for touches. */
  readonly pointerId: number;
  readonly pointerType: "mouse" | "pen" | "touch";
  readonly isPrimary: boolean;
  /** -1 for `pointermove`, as on the web. */
  readonly button: number;
  readonly buttons: number;
  /** 0.5 while a button is down, 0 otherwise: no host reports pressure yet. */
  readonly pressure: number;
  readonly tangentialPressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly altitudeAngle: number;
  readonly azimuthAngle: number;
  readonly width: number;
  readonly height: number;
  /** The event itself for `pointermove` (each host move is its own event), empty otherwise. */
  getCoalescedEvents(): PointerEvent[];
  getPredictedEvents(): PointerEvent[];
}

/** `pointerdown`, `pointerup` and `click`. */
export interface PointerButtonEvent extends PointerEvent {
  readonly button: number;
  /** The click count: 2 for a double click. */
  readonly detail: number;
}

export interface WheelEvent extends PointerEvent {
  readonly deltaX: number;
  readonly deltaY: number;
}

export interface KeyboardEvent extends ModifierEvent {
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
}

/** An input or selection event's target: the field itself, or a field inside a node that listens. */
type FieldOf<T extends Node> = T extends Input ? T : Input;

export interface InputEvent<T extends Node = Input> extends Event {
  readonly target: FieldOf<T>;
  readonly value: string;
  readonly inputType: string;
  /** On a rich input: its document after the change. */
  readonly document: FieldOf<T> extends RichInput ? RichDocument : RichDocument | undefined;
}

export interface SelectionEvent<T extends Node = Input> extends Event {
  readonly target: FieldOf<T>;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** An edit about to change an input (`beforeinput`), as the web's `InputEvent`. Preventing it cancels the edit. */
export interface BeforeInputEvent<T extends Node = Input> extends Event {
  readonly target: FieldOf<T>;
  readonly inputType: string;
  /** The text the edit inserts. */
  readonly data: string | null;
  readonly dataTransfer: DataTransfer | null;
  readonly isComposing: boolean;
  getTargetRanges(): never[];
}

export interface ScrollEvent extends Event {
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

/** Where layout put the node, in window pixels. */
export interface LayoutEvent extends Event {
  readonly bounds: { x: number; y: number; width: number; height: number };
}

export interface TransitionEvent extends Event {
  readonly propertyName: string;
  readonly elapsedTime: number;
  readonly pseudoElement: string;
}

export interface AnimationEvent extends Event {
  readonly animationName: string;
  readonly elapsedTime: number;
  readonly pseudoElement: string;
}

/** The events of the tree by type. */
export interface EventMap {
  pointerdown: PointerButtonEvent;
  pointerup: PointerButtonEvent;
  click: PointerButtonEvent;
  pointermove: PointerEvent;
  pointerenter: PointerEvent;
  pointerleave: PointerEvent;
  pointercancel: PointerEvent;
  pointerover: PointerEvent;
  pointerout: PointerEvent;
  wheel: WheelEvent;
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  focus: Event;
  blur: Event;
  input: InputEvent;
  selectionchange: SelectionEvent;
  copy: ClipboardEvent;
  cut: ClipboardEvent;
  paste: ClipboardEvent;
  beforeinput: BeforeInputEvent;
  scroll: ScrollEvent;
  layout: LayoutEvent;
  gotpointercapture: Event;
  lostpointercapture: Event;
  load: Event;
  error: Event;
  transitionrun: TransitionEvent;
  transitionstart: TransitionEvent;
  transitionend: TransitionEvent;
  transitioncancel: TransitionEvent;
  animationstart: AnimationEvent;
  animationiteration: AnimationEvent;
  animationend: AnimationEvent;
  animationcancel: AnimationEvent;
  dragenter: DragEvent;
  dragover: DragEvent;
  dragleave: DragEvent;
  drop: DragEvent;
}

export function createNode(kind: "text"): Text;
export function createNode(kind: "input"): Input;
export function createNode(kind: "richinput"): RichInput;
export function createNode(kind: "image" | "img"): Image;
export function createNode(kind: "svg"): Svg;
export function createNode(kind: NodeKind): Node;

/** A box with `style` as its base look and `children` appended. */
export function createBox(style?: Style | null, ...children: (Node | string)[]): Node;
export function createText(data?: string): Text;
export function createInput(style?: Style | null): Input;
export function createRichInput(style?: Style | null): RichInput;
/** An image showing `src`, with `style` as its base look. */
export function createImage(src: string, style?: Style | null): Image;
/** `document.createElementNS` in the SVG namespace: an `Svg` for `svg`, else an `SvgElement`. */
export function createSvgElement(tag: "svg"): Svg;
export function createSvgElement(tag: string): SvgElement;
/** Draws the `<svg>`s that changed now, rather than before the host applies the batch. */
export function flushSvg(): void;

/**
 * Defines `@keyframes name`: `{ from: { opacity: 0 }, "50%": { ... }, to: { ... } }`.
 * Defining a name again replaces its rule.
 */
export function defineKeyframes(name: string, frames: Record<string, Style>): void;

/** Makes `node` the root of the window's tree. */
export function mount<T extends Node>(node: T): T;
export function root(): Node | null;

/** Has screen readers say `message` without showing it. */
export function announce(message: string, options?: { politeness?: "polite" | "assertive" }): void;

/** The node with tree id `id`, for hosts and tools. */
export function nodeById(id: number): Node | null;

/** Runs `event` through the tree as the DOM does. Returns false when a listener prevented the default. */
export function dispatchEvent(event: Event): boolean;

export interface MarkdownOptions {
  /** GitHub's tables, strikethrough, task lists and autolinks. Default true. */
  gfm?: boolean;
  tables?: boolean;
  strikethrough?: boolean;
  taskLists?: boolean;
  autolinkLiterals?: boolean;
  footnotes?: boolean;
  frontmatter?: boolean;
  /** `> [!NOTE]` blocks, as nodes of type `alert` with a `kind`. */
  alerts?: boolean;
}

/**
 * The syntax tree of Markdown `text` in the shape of mdast, without positions. Install
 * `@types/mdast` for its node types.
 */
export function parseMarkdown(text: string, options?: MarkdownOptions): import("mdast").Root;

/** What happens to an exception a listener throws. Without a handler, the host reports it. */
export function setErrorHandler(handler: ((error: unknown) => void) | null): void;

/** A file dragged in from the desktop, as the web's `File`, with its `path` on disk. */
export class DroppedFile {
  readonly name: string;
  readonly path: string;
  readonly type: string;
}

/** A file in a `DataTransfer` that is no file on disk, such as a pasted image: the runtime's `File`. */
export interface DataFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

/** One entry of a `DataTransfer`. */
export interface DataTransferItem {
  readonly kind: "string" | "file";
  readonly type: string;
  getAsString(callback: (value: string) => void): void;
  getAsFile(): DataFile | DroppedFile | null;
}

export interface DataTransferItemList extends Iterable<DataTransferItem> {
  readonly length: number;
  readonly [index: number]: DataTransferItem;
  add(data: string, type: string): DataTransferItem;
  add(file: DataFile | DroppedFile): DataTransferItem;
  remove(index: number): void;
  clear(): void;
}

/**
 * What a copy, cut, paste or file drag carries, as the web's. `new DataTransfer()` is empty
 * and writable; a paste's is read-only, and after its event none can be read.
 */
export class DataTransfer {
  constructor();
  readonly files: readonly (DataFile | DroppedFile)[];
  readonly items: DataTransferItemList;
  readonly types: readonly string[];
  dropEffect: string;
  effectAllowed: string;
  getData(format: string): string;
  setData(format: string, data: string): void;
  clearData(format?: string): void;
  setDragImage(image: unknown, x: number, y: number): void;
}

/**
 * A copy, cut or paste at the focused node, as the web's. A `copy` or `cut` listener that sets
 * data on `clipboardData` and prevents the default puts that data on the clipboard; a `paste`
 * listener reads what it holds (`text/plain`, `text/html`, a pasted PNG in `files`), and
 * preventing it keeps the paste out of the input.
 */
export class ClipboardEvent extends Event {
  constructor(type: string, init?: { bubbles?: boolean; cancelable?: boolean; composed?: boolean; clipboardData?: DataTransfer | null });
  readonly clipboardData: DataTransfer | null;
}

/** Files dragged from another app over the window (`dragenter`, `dragover`, `dragleave`, `drop`). */
export interface DragEvent extends Event {
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  dataTransfer: DataTransfer;
}

export interface NotificationOptions {
  body?: string;
  tag?: string;
  data?: unknown;
}

/** A desktop notification, as the web's. Permission is always granted. */
export class Notification {
  static readonly permission: "granted";
  static requestPermission(callback?: (permission: "granted") => void): Promise<"granted">;
  constructor(title: string, options?: NotificationOptions);
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly data: unknown;
  onclick: ((event: { type: "click"; target: Notification }) => void) | null;
  onshow: ((event: { type: "show"; target: Notification }) => void) | null;
  onerror: ((event: { type: "error"; target: Notification }) => void) | null;
  onclose: ((event: { type: "close"; target: Notification }) => void) | null;
  close(): void;
  addEventListener(type: "click" | "show" | "error" | "close", listener: (event: { type: string; target: Notification }) => void): void;
  removeEventListener(type: "click" | "show" | "error" | "close", listener: (event: { type: string; target: Notification }) => void): void;
}

export type TrayMenuItem =
  | { label: string; click?: () => void; enabled?: boolean; checked?: boolean }
  | { type: "separator" }
  | { label: string; submenu: TrayMenuItem[] };

export interface TrayOptions {
  /** RGBA pixels, as an `ImageData`. 32 by 32 looks right everywhere. */
  icon: { width: number; height: number; data: ArrayLike<number> };
  tooltip?: string;
  /** macOS draws the icon from its alpha, in the menu bar's colours. */
  template?: boolean;
  menu?: TrayMenuItem[];
  /** Runs on a click when there is no menu. `button` is `MouseEvent.button`'s. */
  onClick?: (event: { button: number }) => void;
}

/** Shows an icon in the system tray; calling it again replaces it. Resolves to whether it shows. */
export function setTray(options: TrayOptions): Promise<boolean>;
export function removeTray(): void;

/**
 * Runs `callback` when `accelerator` (`"Mod+Shift+K"`; `Mod` is Command on macOS, Control
 * elsewhere) is pressed, whichever app has focus. Resolves to whether the system took it.
 */
export function registerShortcut(accelerator: string, callback: () => void): Promise<boolean>;
export function unregisterShortcut(accelerator: string): void;

/** The app's memory: `footprint` in bytes over `processes` processes. */
export interface MemoryUsage {
  footprint: number;
  processes: number;
}

/**
 * The app's memory as the system shows it to users (macOS `phys_footprint`, Linux `Pss`,
 * Windows `PrivateUsage`). In the browser, the wasm tree's linear memory only. Cheap enough
 * to call every second; `null` when the host cannot say.
 */
export function memoryUsage(): MemoryUsage | null;

/** What the window put on screen over a stretch of time; see `frameStats`. */
export interface FrameStats {
  /** Frames presented. */
  frames: number;
  /** `frames` per second over the stretch. */
  fps: number;
  /** Painted frames a newer frame replaced before the GPU drew them. */
  dropped: number;
  /** Milliseconds between presents: median, 95th and 99th percentile, longest. */
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/**
 * The frames the window presented since the last call (since the app started, the first
 * time), which `requestAnimationFrame` cannot count. Cheap enough to call every second;
 * `null` in a browser build.
 */
export function frameStats(): FrameStats | null;
