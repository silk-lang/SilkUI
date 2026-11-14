import type * as CSS from "csstype";

/** The node kinds of the tree. `richinput` is an `input` with marks and atoms. */
export type NodeKind = "box" | "text" | "input" | "richinput" | "image" | "icon" | "canvas";

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

/** A node of the tree. Make one with `createBox`, `createText`, `createInput` or `createNode`. */
export class Node {
  constructor(kind: NodeKind);
  /** The tree's number for the node (not the DOM `id`: that is `setAttribute("id", ...)`). */
  readonly id: number;
  readonly kind: NodeKind;
  readonly parentNode: Node | null;
  readonly childNodes: readonly Node[];
  readonly firstChild: Node | null;
  readonly lastChild: Node | null;
  readonly nextSibling: Node | null;
  readonly previousSibling: Node | null;
  /** Whether `other` is this node or inside it. */
  contains(other: Node | null): boolean;
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
   * an ARIA attribute spelled `aria-checked` or `ariaChecked`.
   */
  setAttribute(name: string, value: unknown): void;
  set tabIndex(value: number);
  set disabled(value: boolean);
  focus(): void;
  scrollTo(x: number, y: number): void;
  addEventListener<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>, options?: ListenerOptions): void;
  removeEventListener<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>, options?: ListenerOptions): void;
}

/** A text leaf. It takes its look from its parent. */
export class Text extends Node {
  constructor(data?: string);
  data: string;
  textContent: string;
}

/** An editable text field. `value` follows what the user types. */
export class Input extends Node {
  constructor();
  value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** Selects from `anchor` to `focus`, as UTF-8 byte offsets in the value. */
  setSelectionRange(anchor: number, focus: number): void;
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
  /** Selects from `anchor` to `focus`, as string indices. */
  setSelectionRange(anchor: number, focus: number): void;
}

/** An icon: SVG markup drawn at the node's CSS size, with its `color` as `currentColor`. */
export class Icon extends Node {
  constructor(svg?: string);
  svg: string;
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
  wheel: WheelEvent;
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  focus: Event;
  blur: Event;
  input: InputEvent;
  selectionchange: SelectionEvent;
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
}

export function createNode(kind: "text"): Text;
export function createNode(kind: "input"): Input;
export function createNode(kind: "richinput"): RichInput;
export function createNode(kind: "icon"): Icon;
export function createNode(kind: NodeKind): Node;

/** A box with `style` as its base look and `children` appended. */
export function createBox(style?: Style | null, ...children: (Node | string)[]): Node;
export function createText(data?: string): Text;
export function createInput(style?: Style | null): Input;
export function createRichInput(style?: Style | null): RichInput;
/** An icon showing `svg` markup, with `style` as its base look. */
export function createIcon(svg: string, style?: Style | null): Icon;

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
