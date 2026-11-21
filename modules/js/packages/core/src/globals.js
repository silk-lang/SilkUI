// The browser globals a DOM app reaches for, over the Silk UI tree: `document` with an `<html>`
// root and a `<body>`, `window` as the global object, element classes for `instanceof`,
// `location` and `history`, `localStorage`, `sessionStorage`, `indexedDB`, `Worker` and the
// observers. Import it before anything else; globals the realm already has stay as they are.
import {
  DocumentFragment as CoreFragment,
  DOMRect,
  IntersectionObserver,
  MutationObserver,
  Node as CoreNode,
  Range,
  ResizeObserver,
  Selection,
  StaticRange,
  Svg,
  SvgElement,
  SvgText,
  Text as CoreText,
  Input,
  Image as CoreImage,
  Canvas,
  caretPositionFromPoint,
  createDocumentFragment,
  createNode,
  createRange,
  createSvgElement,
  createText,
  elementFromPoint,
  elementsFromPoint,
  getComputedStyle,
  getSelection,
  mount,
  root,
  setOuterTargets,
  supports,
} from "./index.js";
import * as core from "./index.js";
import { Storage, localStorageArea, sessionStorageArea } from "./storage.js";
import { History, Location, PopStateEvent, HashChangeEvent } from "./location.js";
import { indexedDBModule } from "./indexeddb.js";
import { WorkerClass } from "./worker.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const KIND_OF_TAG = { span: "box", img: "image", input: "input", textarea: "input", svg: "svg" };

// A `<canvas>` made here draws nothing: libraries such as lottie-web make one at load to probe.
const inert = new Proxy({}, { get: (target, name) => (name in target ? target[name] : () => {}) });

// What a tag becomes: `@silkui/core`'s own `createElement` when it has one (HTML tags as
// nodes), else a box, an input, an image or an svg.
function createElement(tag) {
  tag = String(tag).toLowerCase();
  const html = exported("createElement");
  if (typeof html === "function") {
    const node = html(tag);
    // A 2d context the host cannot draw draws nothing, rather than failing a library's probe.
    if (tag === "canvas" && typeof node.getContext === "function") {
      const context = node.getContext;
      node.getContext = function (type, ...rest) {
        return context.call(this, type, ...rest) ?? (type === "2d" ? inert : null);
      };
    }
    return node;
  }
  if (tag === "canvas") return { localName: tag, width: 300, height: 150, style: {}, getContext: () => inert };
  const node = createNode(KIND_OF_TAG[tag] ?? "box");
  if (!("localName" in node)) Object.defineProperty(node, "localName", { value: tag, configurable: true });
  return node;
}

const global = globalThis;
// An export `@silkui/core` may have, read by name so a build without it does not warn.
const exported = (name) => core[name];

// An event target outside the tree (the document and the window). The dispatcher runs its
// listeners after the root's as `_run`, and `dispatchEvent` sends an event to it alone.
class OuterTarget {
  #listeners = new Map();

  addEventListener(type, listener, options) {
    if (listener == null || options?.signal?.aborted) return;
    const capture = options === true || !!options?.capture;
    let list = this.#listeners.get(type);
    if (!list) this.#listeners.set(type, (list = []));
    if (list.some((entry) => entry.listener === listener && entry.capture === capture)) return;
    list.push({ listener, capture, once: !!options?.once });
    if (list.length === 1) this._listening(type, true);
    options?.signal?.addEventListener("abort", () => this.removeEventListener(type, listener, capture), { once: true });
  }

  removeEventListener(type, listener, options) {
    const list = this.#listeners.get(type);
    if (!list) return;
    const capture = options === true || !!options?.capture;
    const index = list.findIndex((entry) => entry.listener === listener && entry.capture === capture);
    if (index < 0) return;
    list.splice(index, 1);
    if (list.length === 0) this._listening(type, false);
  }

  _listening(type, on) {
    relay(type, on);
  }

  _has(type) {
    return (this.#listeners.get(type)?.length ?? 0) > 0;
  }

  _run(event, capture) {
    const list = this.#listeners.get(event.type);
    if (!list) return;
    for (const entry of list.slice()) {
      if (event._immediate) return;
      if (entry.capture !== capture) continue;
      if (entry.once) this.removeEventListener(event.type, entry.listener, entry.capture);
      try {
        if (typeof entry.listener === "function") entry.listener.call(this === windowTarget ? global : this, event);
        else entry.listener.handleEvent(event);
      } catch (error) {
        global.reportError?.(error);
      }
    }
    // `onresize`, `onkeydown` and the rest, as handler properties.
    const handler = (this === windowTarget ? global : this)["on" + event.type];
    if (!capture && typeof handler === "function" && !event._immediate) {
      try {
        handler.call(this === windowTarget ? global : this, event);
      } catch (error) {
        global.reportError?.(error);
      }
    }
  }

  // An event for this target alone, as `window.dispatchEvent(new Event("storage"))`.
  dispatchEvent(event) {
    if (typeof event?.type !== "string") throw new TypeError("dispatchEvent takes an Event");
    const self = this === windowTarget ? global : this;
    let stopped = false;
    const set = (name, value) => {
      try {
        if (Object.getOwnPropertyDescriptor(event, name)?.writable !== false) event[name] = value;
      } catch {}
      if (event[name] !== value) Object.defineProperty(event, name, { value, writable: true, configurable: true });
    };
    if (!("_immediate" in event)) {
      const stopNow = event.stopImmediatePropagation;
      Object.defineProperty(event, "_immediate", { get: () => stopped, configurable: true });
      Object.defineProperty(event, "stopImmediatePropagation", { value() { stopped = true; stopNow?.call(event); }, configurable: true });
    }
    set("target", self);
    set("currentTarget", self);
    set("eventPhase", 2);
    this._run(event, true);
    this._run(event, false);
    set("currentTarget", null);
    set("eventPhase", 0);
    return !event.defaultPrevented;
  }
}

// A document or window listener for a tree event needs the tree to send that event: the root
// listens for it with a listener that does nothing.
const relayed = new Map();
const nothing = () => {};
function relay(type, on) {
  if (type === "resize") return watchSize(on);
  const count = (relayed.get(type) ?? 0) + (on ? 1 : -1);
  relayed.set(type, count);
  if (on && count === 1) documentElement.addEventListener(type, nothing);
  if (!on && count === 0) documentElement.removeEventListener(type, nothing);
}

const windowTarget = new OuterTarget();

// `<html>` is the tree's root, the size of the window; `<body>` fills it, as a page's does
// with `height: 100%`. `<head>` is outside the tree.
const documentElement = createElement("html");
documentElement.style.set({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 });
const head = createElement("head");
const body = createElement("body");
documentElement.appendChild(body);

// Text a `<title>` would hold. The window's title is the host's.
let title = "";

class Document extends OuterTarget {
  get documentElement() { return documentElement; }
  get head() { return head; }
  get body() { return body; }
  get defaultView() { return global; }
  get ownerDocument() { return null; }
  get nodeType() { return 9; }
  get nodeName() { return "#document"; }
  get readyState() { return "complete"; }
  get visibilityState() { return "visible"; }
  get hidden() { return false; }
  get compatMode() { return "CSS1Compat"; }
  get characterSet() { return "UTF-8"; }
  get contentType() { return "text/html"; }
  get location() { return location; }
  get URL() { return location.href; }
  get documentURI() { return location.href; }
  get baseURI() { return location.href; }
  get referrer() { return ""; }
  get cookie() { return ""; }
  set cookie(_) {}
  get title() { return title; }
  set title(value) { title = String(value); }
  get dir() { return documentElement.getAttribute("dir") ?? ""; }
  set dir(value) { documentElement.setAttribute("dir", value); }
  get scrollingElement() { return documentElement; }
  get fullscreenElement() { return null; }
  get pointerLockElement() { return null; }
  get childNodes() { return [documentElement]; }
  get firstChild() { return documentElement; }
  get lastChild() { return documentElement; }
  get children() { return [documentElement]; }
  get firstElementChild() { return documentElement; }
  get isConnected() { return true; }

  /** The focused node, else `<body>`, as `document.activeElement` is. */
  get activeElement() {
    const focused = exported("activeElement");
    return (typeof focused === "function" ? focused() : documentElement.querySelector(":focus")) ?? body;
  }

  hasFocus() { return true; }
  createElement(tag) { return createElement(tag); }
  createElementNS(namespace, tag) {
    return namespace === SVG_NAMESPACE ? createSvgElement(tag) : createElement(tag);
  }
  createTextNode(data) { return createText(data); }
  // A comment holds nothing a tree can show: an empty text node stands in for one.
  createComment() { return createText(""); }
  createDocumentFragment() { return createDocumentFragment(); }
  createRange() { return createRange(); }
  createEvent() { return new global.Event(""); }
  createTreeWalker(rootNode, whatToShow = 0xffffffff, filter = null) { return new TreeWalker(rootNode, whatToShow, filter); }
  getSelection() { return getSelection(); }
  getElementById(id) {
    if (!id) return null;
    return documentElement.querySelector("#" + cssEscape(String(id)));
  }
  querySelector(selector) {
    return documentElement.matches(selector) ? documentElement : documentElement.querySelector(selector);
  }
  querySelectorAll(selector) {
    const found = documentElement.querySelectorAll(selector);
    return documentElement.matches(selector) ? [documentElement, ...found] : found;
  }
  getElementsByTagName(tag) {
    return tag === "*" ? documentElement.querySelectorAll("*") : this.querySelectorAll(String(tag));
  }
  getElementsByClassName(names) {
    const selector = String(names).trim().split(/\s+/).filter(Boolean).map((name) => "." + cssEscape(name)).join("");
    return selector ? documentElement.querySelectorAll(selector) : [];
  }
  getElementsByName(name) {
    return documentElement.querySelectorAll(`[name="${String(name).replace(/["\\]/g, "\\$&")}"]`);
  }
  contains(node) { return node === this || documentElement.contains(node); }
  elementFromPoint(x, y) { return elementFromPoint(x, y); }
  elementsFromPoint(x, y) { return elementsFromPoint(x, y); }
  caretPositionFromPoint(x, y) { return caretPositionFromPoint(x, y); }
  importNode(node, deep) { return node.cloneNode(deep); }
  adoptNode(node) { node.remove?.(); return node; }
  exitFullscreen() { return Promise.resolve(); }
  exitPointerLock() {}
  execCommand() { return false; }
  queryCommandSupported() { return false; }
  // The fonts the app's style sheets load are the host's, ready before the first frame.
  get fonts() { return fonts; }
}

const fonts = Object.assign(new OuterTarget(), {
  status: "loaded",
  ready: Promise.resolve(),
  check: () => true,
  load: () => Promise.resolve([]),
  add() {},
  delete: () => false,
  clear() {},
  forEach() {},
  [Symbol.iterator]: function* () {},
});
fonts.ready = Promise.resolve(fonts);
fonts._listening = () => {};

function cssEscape(value) {
  return value.replace(/[^\w-]|^\d|^-\d/g, (character) => {
    const code = character.charCodeAt(0);
    return /[\d]/.test(character) ? "\\3" + character + " " : code < 0x20 || code === 0x7f ? "\\" + code.toString(16) + " " : "\\" + character;
  });
}

// `document.createTreeWalker`, over the nodes' child lists.
class TreeWalker {
  constructor(rootNode, whatToShow, filter) {
    this.root = rootNode;
    this.whatToShow = whatToShow;
    this.filter = filter;
    this.currentNode = rootNode;
  }
  #accepts(node) {
    const bit = 1 << ((node.nodeType ?? 1) - 1);
    if (!(this.whatToShow & bit)) return false;
    if (!this.filter) return true;
    const answer = typeof this.filter === "function" ? this.filter(node) : this.filter.acceptNode(node);
    return answer === 1;
  }
  nextNode() {
    let node = this.currentNode;
    for (;;) {
      if (node.childNodes?.length) node = node.childNodes[0];
      else {
        while (node && node !== this.root && !node.nextSibling) node = node.parentNode;
        if (!node || node === this.root) return null;
        node = node.nextSibling;
      }
      if (this.#accepts(node)) return (this.currentNode = node);
    }
  }
  parentNode() {
    for (let node = this.currentNode; node && node !== this.root; ) {
      node = node.parentNode;
      if (node && this.#accepts(node)) return (this.currentNode = node);
    }
    return null;
  }
  firstChild() {
    const node = this.currentNode.childNodes?.find((child) => this.#accepts(child));
    return node ? (this.currentNode = node) : null;
  }
  nextSibling() {
    for (let node = this.currentNode.nextSibling; node; node = node.nextSibling) if (this.#accepts(node)) return (this.currentNode = node);
    return null;
  }
  previousSibling() {
    for (let node = this.currentNode.previousSibling; node; node = node.previousSibling) if (this.#accepts(node)) return (this.currentNode = node);
    return null;
  }
}

const documentTarget = new Document();
const location = new Location(global.__silkLocation ?? "http://localhost/", documentTarget);
const history = new History(location, windowTarget);

// The window's size is the root's, read after any pending layout. A `resize` listener gets the
// root's size changes through a ResizeObserver.
let sizeWatcher = null;
let sizeListeners = 0;
function watchSize(on) {
  sizeListeners += on ? 1 : -1;
  if (on && !sizeWatcher) {
    let first = true;
    sizeWatcher = new ResizeObserver(() => {
      // A ResizeObserver reports the size it starts at; a window has not resized then.
      if (first) { first = false; return; }
      windowTarget.dispatchEvent(new global.Event("resize"));
    });
    sizeWatcher.observe(documentElement);
  } else if (!on && sizeListeners === 0 && sizeWatcher) {
    sizeWatcher.disconnect();
    sizeWatcher = null;
  }
}

// Every element and text node belongs to the one document.
for (const prototype of [CoreNode.prototype, SvgElement.prototype, SvgText.prototype]) {
  if (!("ownerDocument" in prototype)) Object.defineProperty(prototype, "ownerDocument", { get: () => documentTarget, configurable: true });
  if (!("getRootNode" in prototype)) {
    Object.defineProperty(prototype, "getRootNode", {
      value() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node === documentElement ? documentTarget : node;
      },
      writable: true,
      configurable: true,
    });
  }
}
// `parentElement`, `children` and the element siblings, which DOM libraries walk by.
const isElement = (node) => node != null && node.nodeType === 1;
const elementProperties = {
  parentElement: { get() { const parent = this.parentNode; return isElement(parent) ? parent : null; } },
  children: { get() { return (this.childNodes ?? []).filter(isElement); } },
  childElementCount: { get() { return (this.childNodes ?? []).filter(isElement).length; } },
  firstElementChild: { get() { return (this.childNodes ?? []).find(isElement) ?? null; } },
  lastElementChild: { get() { return (this.childNodes ?? []).findLast(isElement) ?? null; } },
  nextElementSibling: { get() { let node = this.nextSibling; while (node && !isElement(node)) node = node.nextSibling; return node ?? null; } },
  previousElementSibling: { get() { let node = this.previousSibling; while (node && !isElement(node)) node = node.previousSibling; return node ?? null; } },
};
for (const [name, descriptor] of Object.entries(elementProperties)) {
  if (!(name in CoreNode.prototype)) Object.defineProperty(CoreNode.prototype, name, { ...descriptor, configurable: true });
}
// The document is above `<html>`: `parentNode` stays null for the tree, but walks that ask for
// the owner's node find it.
if (!("blur" in CoreNode.prototype)) {
  Object.defineProperty(CoreNode.prototype, "blur", {
    value() { if (documentTarget.activeElement === this) documentElement.focus(); },
    writable: true,
    configurable: true,
  });
}

// Classes for `instanceof`, by what a node is. Their prototypes are the nodes', so a library
// that adds to `HTMLElement.prototype` adds to every node.
function nodeClass(name, prototype, test) {
  const Class = function () { throw new TypeError("Illegal constructor: make a " + name + " with document.createElement"); };
  Object.defineProperty(Class, "name", { value: name });
  Object.defineProperty(Class, "prototype", { value: prototype, writable: false });
  Object.defineProperty(Class, Symbol.hasInstance, { value: (value) => value != null && typeof value === "object" && test(value) });
  return Class;
}
const isSvg = (value) => value instanceof Svg || value instanceof SvgElement;
const isTreeElement = (value) => value instanceof CoreNode && value.nodeType === 1;
const isHtml = (value) => isTreeElement(value) && !(value instanceof Svg);
const tagIs = (...tags) => (value) => isHtml(value) && tags.includes(value.localName);
const classes = {
  EventTarget: null,
  Node: nodeClass("Node", CoreNode.prototype, (value) => value instanceof CoreNode || value instanceof SvgElement || value instanceof SvgText || value === documentTarget),
  Element: nodeClass("Element", CoreNode.prototype, (value) => isTreeElement(value) || value instanceof SvgElement),
  HTMLElement: nodeClass("HTMLElement", CoreNode.prototype, isHtml),
  SVGElement: nodeClass("SVGElement", SvgElement.prototype, isSvg),
  SVGSVGElement: nodeClass("SVGSVGElement", Svg.prototype, (value) => value instanceof Svg),
  CharacterData: nodeClass("CharacterData", CoreText.prototype, (value) => value instanceof CoreText || value instanceof SvgText),
  Text: nodeClass("Text", CoreText.prototype, (value) => value instanceof CoreText || value instanceof SvgText),
  Comment: nodeClass("Comment", CoreText.prototype, () => false),
  Document: nodeClass("Document", Document.prototype, (value) => value === documentTarget),
  HTMLDocument: nodeClass("HTMLDocument", Document.prototype, (value) => value === documentTarget),
  DocumentFragment: CoreFragment,
  ShadowRoot: nodeClass("ShadowRoot", CoreFragment.prototype, () => false),
  HTMLInputElement: nodeClass("HTMLInputElement", Input.prototype, (value) => value instanceof Input && value.localName !== "textarea"),
  HTMLTextAreaElement: nodeClass("HTMLTextAreaElement", Input.prototype, (value) => value instanceof Input && value.localName === "textarea"),
  HTMLImageElement: nodeClass("HTMLImageElement", CoreImage.prototype, (value) => value instanceof CoreImage),
  HTMLCanvasElement: nodeClass("HTMLCanvasElement", Canvas.prototype, (value) => value instanceof Canvas),
  HTMLDivElement: nodeClass("HTMLDivElement", CoreNode.prototype, tagIs("div")),
  HTMLSpanElement: nodeClass("HTMLSpanElement", CoreNode.prototype, tagIs("span")),
  HTMLButtonElement: nodeClass("HTMLButtonElement", CoreNode.prototype, tagIs("button")),
  HTMLAnchorElement: nodeClass("HTMLAnchorElement", CoreNode.prototype, tagIs("a")),
  HTMLLabelElement: nodeClass("HTMLLabelElement", CoreNode.prototype, tagIs("label")),
  HTMLFormElement: nodeClass("HTMLFormElement", CoreNode.prototype, tagIs("form")),
  HTMLSelectElement: nodeClass("HTMLSelectElement", CoreNode.prototype, tagIs("select")),
  HTMLOptionElement: nodeClass("HTMLOptionElement", CoreNode.prototype, tagIs("option")),
  HTMLIFrameElement: nodeClass("HTMLIFrameElement", CoreNode.prototype, tagIs("iframe")),
  HTMLVideoElement: nodeClass("HTMLVideoElement", CoreNode.prototype, tagIs("video")),
  HTMLMediaElement: nodeClass("HTMLMediaElement", CoreNode.prototype, tagIs("video", "audio")),
  HTMLBodyElement: nodeClass("HTMLBodyElement", CoreNode.prototype, (value) => value === body),
  HTMLHtmlElement: nodeClass("HTMLHtmlElement", CoreNode.prototype, (value) => value === documentElement),
  HTMLHeadElement: nodeClass("HTMLHeadElement", CoreNode.prototype, (value) => value === head),
  HTMLTemplateElement: nodeClass("HTMLTemplateElement", CoreNode.prototype, tagIs("template")),
  HTMLStyleElement: nodeClass("HTMLStyleElement", CoreNode.prototype, tagIs("style")),
  HTMLDetailsElement: nodeClass("HTMLDetailsElement", CoreNode.prototype, tagIs("details")),
  HTMLDialogElement: nodeClass("HTMLDialogElement", CoreNode.prototype, tagIs("dialog")),
};
for (const [name, value] of Object.entries(classes)) {
  if (value && global[name] === undefined) define(name, value);
}

function define(name, value) {
  Object.defineProperty(global, name, { value, writable: true, configurable: true });
}

// `new Image()`, an `<img>` to load.
if (global.Image === undefined) {
  define("Image", function Image(width, height) {
    const image = createElement("img");
    if (width !== undefined) image.style.set({ width });
    if (height !== undefined) image.style.set({ height });
    return image;
  });
}

for (const [name, value] of Object.entries({
  Range, StaticRange, Selection, DOMRect, ResizeObserver, IntersectionObserver, MutationObserver, getComputedStyle,
  Storage, PopStateEvent, HashChangeEvent, NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3, SHOW_ALL: 0xffffffff, SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
})) {
  if (global[name] === undefined) define(name, value);
}
if (global.CSS === undefined) define("CSS", { supports: (...args) => supports(...args), escape: (value) => cssEscape(String(value)) });
global.getSelection ??= getSelection;
global.DOMRectReadOnly ??= DOMRect;

// The window: the global object, its events, its size and where it is.
global.window ??= global;
global.self ??= global;
define("document", documentTarget);
define("location", location);
define("history", history);
global.top ??= global;
global.parent ??= global;
global.frames ??= global;
global.opener ??= null;
global.frameElement ??= null;
global.name ??= "";
global.closed ??= false;
define("addEventListener", (type, listener, options) => windowTarget.addEventListener(type, listener, options));
define("removeEventListener", (type, listener, options) => windowTarget.removeEventListener(type, listener, options));
define("dispatchEvent", (event) => windowTarget.dispatchEvent(event));
for (const [name, read] of Object.entries({
  innerWidth: () => documentElement.clientWidth,
  innerHeight: () => documentElement.clientHeight,
  outerWidth: () => documentElement.clientWidth,
  outerHeight: () => documentElement.clientHeight,
})) {
  Object.defineProperty(global, name, { get: read, set: (value) => define(name, value), configurable: true });
}
for (const name of ["scrollX", "scrollY", "pageXOffset", "pageYOffset", "screenX", "screenY", "screenLeft", "screenTop"]) global[name] ??= 0;
global.scrollTo ??= () => {};
global.scrollBy ??= () => {};
global.scroll ??= () => {};
global.focus ??= () => {};
global.blur ??= () => {};
global.print ??= () => {};
global.alert ??= (message) => console.warn("alert:", message);
global.confirm ??= () => false;
global.prompt ??= () => null;
global.getSelection ??= getSelection;
if (global.screen === undefined) {
  define("screen", {
    get width() { return documentElement.clientWidth; },
    get height() { return documentElement.clientHeight; },
    get availWidth() { return documentElement.clientWidth; },
    get availHeight() { return documentElement.clientHeight; },
    colorDepth: 24,
    pixelDepth: 24,
    orientation: { type: "landscape-primary", angle: 0, addEventListener() {}, removeEventListener() {} },
  });
}
global.visualViewport ??= {
  get width() { return documentElement.clientWidth; },
  get height() { return documentElement.clientHeight; },
  offsetLeft: 0,
  offsetTop: 0,
  pageLeft: 0,
  pageTop: 0,
  scale: 1,
  addEventListener() {},
  removeEventListener() {},
};

// The engine runtime reports rejections nothing handled to the window target it made; they
// go to this one now.
const native = global.__ui;
if (native && "rejected" in native && typeof global.PromiseRejectionEvent === "function") {
  native.rejected = (promise, reason) =>
    !windowTarget.dispatchEvent(new global.PromiseRejectionEvent("unhandledrejection", { promise, reason, cancelable: true }));
}

// Storage: `localStorage` lasts (a file, on the full runtime), `sessionStorage` lasts as long
// as the window. Both are made on first use.
lazy("localStorage", () => localStorageArea());
lazy("sessionStorage", () => sessionStorageArea());
lazy("indexedDB", () => idb().indexedDB);
for (const name of ["IDBFactory", "IDBDatabase", "IDBTransaction", "IDBObjectStore", "IDBIndex", "IDBRequest", "IDBOpenDBRequest", "IDBKeyRange", "IDBCursor", "IDBCursorWithValue", "IDBVersionChangeEvent"]) {
  lazy(name, () => idb()[name]);
}
let idbModule = null;
function idb() {
  return (idbModule ??= indexedDBModule());
}
function lazy(name, make) {
  if (name in global) return;
  Object.defineProperty(global, name, {
    get: () => {
      const value = make();
      define(name, value);
      return value;
    },
    set: (value) => define(name, value),
    configurable: true,
  });
}

if (global.Worker === undefined && WorkerClass) define("Worker", WorkerClass);

// `navigator` as a browser's on this machine.
if (typeof global.navigator !== "object" || global.navigator === null) global.navigator = {};
const platform = global.process?.platform;
const navigatorFields = {
  userAgent: platform === "darwin"
    ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SilkUI"
    : platform === "win32"
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SilkUI"
      : platform === "linux" ? "Mozilla/5.0 (X11; Linux x86_64) SilkUI" : "SilkUI",
  platform: platform === "darwin" ? "MacIntel" : platform === "win32" ? "Win32" : platform === "linux" ? "Linux x86_64" : "",
  language: languageOf(),
  languages: [languageOf()],
  onLine: true,
  cookieEnabled: false,
  maxTouchPoints: 0,
  vendor: "",
  doNotTrack: null,
  webdriver: false,
};
for (const [name, value] of Object.entries(navigatorFields)) {
  if (global.navigator[name] === undefined || (name === "userAgent" && global.navigator.userAgent === "SilkUI")) {
    Object.defineProperty(global.navigator, name, { value, enumerable: true, configurable: true });
  }
}
global.navigator.hardwareConcurrency ??= 4;
global.navigator.sendBeacon ??= () => false;
global.navigator.vibrate ??= () => false;

function languageOf() {
  const env = global.process?.env;
  const fromEnv = env?.LC_ALL || env?.LC_MESSAGES || env?.LANG;
  if (fromEnv && fromEnv !== "C" && fromEnv !== "POSIX") return fromEnv.split(".")[0].replace("_", "-");
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

// `<html>` becomes the tree's root, under the document and the window.
if (!root()) mount(documentElement);
// The dispatcher runs the window's listeners on the global object, its `currentTarget`.
Object.defineProperty(global, "_run", { value: (event, capture) => windowTarget._run(event, capture), configurable: true });
setOuterTargets(documentTarget, global);
