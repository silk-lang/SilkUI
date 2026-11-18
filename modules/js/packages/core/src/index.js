// @silkui/core: the nodes of a Silk UI tree and their events, for JavaScript that runs on the
// embedded SilkJS engine. The primitives are the tree's own (box, text, input, image, canvas)
// and inline svg; the methods and the event flow are the DOM's, so code written for the web reads
// the same here.
//
// Every call queues a mutation through the native `__ui` functions. The host applies the
// queue after the script, and after each event it delivers.

const native = globalThis.__ui;
if (!native) throw new Error("@silkui/core needs the __ui functions of a ui-js host");

const KINDS = { box: 0, text: 1, input: 2, image: 3, icon: 4, canvas: 5 };
const STATES = { base: 0, hover: 1, active: 2, focus: 3, focusVisible: 4, starting: 5 };

// Event types in the order of the tree's LISTEN_* flags: the index is the kind number the
// host dispatches and the bit a node listens with.
const TYPES = [
  "pointerdown", "pointerup", "click", "pointermove", "pointerenter", "pointerleave", "wheel",
  "keydown", "keyup", "focus", "blur", "input", "scroll", "layout", "pointercancel",
  "gotpointercapture", "lostpointercapture", "load", "error", "transitionrun", "transitionstart",
  "transitionend", "transitioncancel", "animationstart", "animationiteration", "animationend",
  "animationcancel", "selectionchange", "pointerover", "pointerout", "touchstart", "touchmove",
  "touchend", "touchcancel",
];
const KIND_OF = new Map(TYPES.map((type, kind) => [type, kind]));

// The live `Range`s (see Range below), held weakly: a range nobody holds stops being updated.
const liveRanges = new Set();

function eachLiveRange(update) {
  for (const ref of liveRanges) {
    const range = ref.deref();
    if (range) update(range);
    else liveRanges.delete(ref);
  }
}

const CLICK = KIND_OF.get("click");
const TOUCH_START = KIND_OF.get("touchstart");
// The tree has one listener flag for the four touch kinds.
const TOUCH_FLAG = 1 << 30;
// Compatibility mouse events, as the web fires them after pointer events: each listens
// through the pointer kind it follows.
const MOUSE_OF = new Map([
  ["pointerdown", "mousedown"], ["pointerup", "mouseup"], ["pointermove", "mousemove"],
  ["pointerover", "mouseover"], ["pointerout", "mouseout"], ["pointerenter", "mouseenter"],
  ["pointerleave", "mouseleave"],
]);
const POINTER_OF = new Map([...MOUSE_OF].map(([pointer, mouse]) => [mouse, pointer]));
// As on the web: these reach the target alone.
const NO_BUBBLE = new Set([
  "pointerenter", "pointerleave", "mouseenter", "mouseleave", "focus", "blur", "scroll", "layout", "load",
  "error",
]);
// The tree has a default action to skip for these. Touch records say for themselves.
const CANCELABLE = new Set([
  "pointerdown", "pointerup", "click", "wheel", "keydown", "keyup", "dragenter", "dragover", "drop",
  "mousedown", "mouseup", "mousemove", "mouseover", "mouseout",
]);
// Files dragged from the desktop: the host dispatches these itself, so nodes need no flag.
const DRAG_TYPES = new Set(["dragenter", "dragover", "dragleave", "drop"]);

// Properties whose numbers are not lengths. Every other number is CSS pixels.
const UNITLESS = new Set([
  "opacity", "flexGrow", "flexShrink", "flex", "order", "zIndex", "fontWeight", "lineHeight",
  "aspectRatio", "tabSize", "scale", "animationIterationCount", "gridRow", "gridRowStart", "gridRowEnd",
  "gridColumn", "gridColumnStart", "gridColumnEnd", "gridArea", "columnCount", "columns", "orphans", "widows",
]);

const nodes = new Map();
const NO_CHILDREN = Object.freeze([]);
let nextId = 0;

// Property names repeat across nodes: each is converted once.
const CSS_NAMES = new Map();

function cssName(name) {
  if (name.startsWith("--")) return name;
  let css = CSS_NAMES.get(name);
  if (css === undefined) {
    css = name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
    CSS_NAMES.set(name, css);
  }
  return css;
}

// The tree names font family lists by number: each `fontFamily` text is defined once, as a
// list of its own. The numbers start high, clear of the lists a host defines, and stay
// small enough to be exact in the 32-bit float a style value is.
const FAMILIES = new Map();
let nextFamily = 0x10000;

function familyOf(names) {
  let id = FAMILIES.get(names);
  if (id === undefined) {
    id = nextFamily++;
    FAMILIES.set(names, id);
    native.fontFamily(id, names);
  }
  return String(id);
}

function cssValue(name, value) {
  if (name.startsWith("--")) return String(value);
  if (name === "fontFamily") return familyOf(String(value));
  return typeof value === "number" && !UNITLESS.has(name) ? value + "px" : String(value);
}

const warned = new Set();

function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

// The part of an ARIA attribute name after `aria`, lowercase: `aria-valuenow` (the DOM
// attribute) and `ariaValueNow` (the DOM property) are both `valuenow`. Null for other names.
function ariaName(name) {
  if (name.startsWith("aria-")) return name.slice(5).toLowerCase();
  if (name.length > 4 && name.startsWith("aria") && name[4] >= "A" && name[4] <= "Z") return name.slice(4).toLowerCase();
  return null;
}

/** The declarations of one look of a node: the base look, or what a state lays over it. */
class Look {
  #node;
  #state;
  // Plain objects share their shape across nodes: a Map here costs four times the memory.
  #values = Object.create(null);

  constructor(node, state) {
    this.#node = node;
    this.#state = state;
  }

  /**
   * Sets properties by their camel case names: `{ width: 120, backgroundColor: "red" }`.
   * Numbers are CSS pixels except for unitless properties. `null`, `undefined` and `""`
   * take a property out.
   */
  set(properties) {
    let css = "";
    let removed = false;
    for (const name of Object.keys(properties)) {
      const value = properties[name];
      if (value === null || value === undefined || value === "") {
        if (name in this.#values) {
          delete this.#values[name];
          removed = true;
        }
        continue;
      }
      const text = cssValue(name, value);
      if (this.#values[name] === text) continue;
      this.#values[name] = text;
      css += cssName(name) + ":" + text + ";";
    }
    if (removed) {
      // The tree sets declarations over earlier ones, so taking one out means starting the
      // look again.
      native.clearStyle(this.#node.nodeId, this.#state);
      css = this.cssText;
    }
    if (css) native.style(this.#node.nodeId, css, this.#state);
  }

  /** Replaces the whole look. */
  replace(properties) {
    native.clearStyle(this.#node.nodeId, this.#state);
    this.#values = Object.create(null);
    this.set(properties);
  }

  get(name) {
    return this.#values[name];
  }

  get cssText() {
    let css = "";
    for (const name in this.#values) css += cssName(name) + ":" + this.#values[name] + ";";
    return css;
  }

  _copyTo(look) {
    look.#values = Object.assign(Object.create(null), this.#values);
    const css = this.cssText;
    if (css) native.style(look.#node.nodeId, css, look.#state);
  }
}

const CLASS_SPACE = /[\t\n\f\r ]/;
function classToken(value) {
  const token = String(value);
  if (!token || CLASS_SPACE.test(token)) {
    const error = new Error(!token ? "A class token cannot be empty" : "A class token cannot contain whitespace");
    error.name = !token ? "SyntaxError" : "InvalidCharacterError";
    throw error;
  }
  return token;
}

/** A live token list backed by the node's class attribute. */
export class ClassList {
  #node;
  constructor(node) { this.#node = node; }
  #tokens() { return [...new Set(this.value.split(/[\t\n\f\r ]+/).filter(Boolean))]; }
  #write(tokens) { this.#node.className = tokens.join(" "); }
  get value() { return this.#node.className; }
  set value(value) { this.#node.className = value; }
  get length() { return this.#tokens().length; }
  item(index) { return this.#tokens()[Number(index) >>> 0] ?? null; }
  contains(token) { return this.#tokens().includes(classToken(token)); }
  add(...values) {
    const tokens = values.map(classToken);
    this.#write([...new Set([...this.#tokens(), ...tokens])]);
  }
  remove(...values) {
    const tokens = values.map(classToken);
    this.#write(this.#tokens().filter((token) => !tokens.includes(token)));
  }
  toggle(value, force) {
    const token = classToken(value);
    const present = this.contains(token);
    const wanted = force === undefined ? !present : !!force;
    if (wanted && !present) this.add(token);
    else if (!wanted && present) this.remove(token);
    return wanted;
  }
  replace(oldValue, newValue) {
    const oldToken = classToken(oldValue), newToken = classToken(newValue);
    const tokens = this.#tokens(), index = tokens.indexOf(oldToken);
    if (index === -1) return false;
    if (oldToken !== newToken) {
      if (tokens.includes(newToken)) tokens.splice(index, 1);
      else tokens[index] = newToken;
    }
    this.#write(tokens);
    return true;
  }
  values() { return this.#tokens().values(); }
  keys() { return this.#tokens().keys(); }
  entries() { return this.#tokens().entries(); }
  forEach(callback, thisArg) { this.#tokens().forEach((value, index) => callback.call(thisArg, value, index, this)); }
  [Symbol.iterator]() { return this.values(); }
  toString() { return this.value; }
}

const sheetData = new WeakMap();
const adoptedLists = new WeakMap();
const importedSheets = new Map();
let installedSheets = [];
let nextSheet = 1;

function sheetError(message) {
  const error = new Error(message);
  error.name = "NotAllowedError";
  return error;
}

function base64Bytes(value) {
  if (typeof value === "string") return value;
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected compiled stylesheet bytes");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const bits = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    encoded += alphabet[bits >>> 18] + alphabet[(bits >>> 12) & 63]
      + (i + 1 < bytes.length ? alphabet[(bits >>> 6) & 63] : "=")
      + (i + 2 < bytes.length ? alphabet[bits & 63] : "=");
  }
  return encoded;
}

function replaceSheet(sheet, bytes) {
  native.styleSheet(0, 0, bytes);
  const state = sheetData.get(sheet);
  state.bytes = bytes;
  for (const entry of installedSheets) {
    if (entry.sheet !== sheet) continue;
    native.styleSheet(entry.live ? 2 : 1, entry.id, bytes);
    entry.live = true;
  }
}

/** A constructed stylesheet, adopted on an application's root. */
export class CSSStyleSheet {
  constructor() { sheetData.set(this, { bytes: null, replacing: false }); }

  static fromCompiled(bytes) {
    const sheet = new CSSStyleSheet();
    replaceSheet(sheet, base64Bytes(bytes));
    return sheet;
  }

  replaceCompiled(bytes) {
    if (sheetData.get(this).replacing) throw sheetError("A stylesheet replacement is already pending");
    replaceSheet(this, base64Bytes(bytes));
  }

  replaceSync(text) {
    if (sheetData.get(this).replacing) throw sheetError("A stylesheet replacement is already pending");
    if (!native.compileStyleSheet) throw sheetError("Runtime CSS compilation is disabled in this host");
    replaceSheet(this, native.compileStyleSheet(String(text)));
  }

  replace(text) {
    const state = sheetData.get(this);
    if (state.replacing) return Promise.reject(sheetError("A stylesheet replacement is already pending"));
    const source = String(text);
    state.replacing = true;
    return Promise.resolve().then(() => {
      if (!native.compileStyleSheet) throw sheetError("Runtime CSS compilation is disabled in this host");
      replaceSheet(this, native.compileStyleSheet(source));
      return this;
    }).finally(() => { state.replacing = false; });
  }
}

function clearAdoptedSheets() {
  for (const entry of installedSheets) if (entry.live) native.styleSheet(3, entry.id, "");
  installedSheets = [];
}

function syncAdoptedSheets() {
  if (!rootNode) return;
  clearAdoptedSheets();
  const sheets = [...importedSheets.values(), ...(adoptedLists.get(rootNode)?.values ?? [])];
  for (const sheet of sheets) {
    if (nextSheet >= 0x80000000) throw new RangeError("Too many stylesheet adoptions");
    const entry = { sheet, id: nextSheet++, live: false };
    installedSheets.push(entry);
    const bytes = sheetData.get(sheet).bytes;
    if (bytes !== null) { native.styleSheet(1, entry.id, bytes); entry.live = true; }
  }
}

function validateSheets(values) {
  for (const sheet of values) if (!sheetData.has(sheet)) throw new TypeError("adoptedStyleSheets accepts constructed CSSStyleSheet objects");
  return values;
}

const sheetMutators = new Set(["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"]);
function adoptedList(node) {
  let list = adoptedLists.get(node);
  if (list) return list;
  const values = [];
  const assign = next => {
    validateSheets(next);
    values.splice(0, values.length, ...next);
    if (rootNode === node) syncAdoptedSheets();
  };
  const numeric = key => typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key);
  const proxy = new Proxy(values, {
    get(target, key, receiver) {
      if (!sheetMutators.has(key)) return Reflect.get(target, key, receiver);
      return (...args) => {
        const next = values.slice();
        const result = Array.prototype[key].apply(next, args);
        assign(next);
        return result === next ? proxy : result;
      };
    },
    set(target, key, value) {
      if (key !== "length" && !numeric(key)) return Reflect.set(target, key, value);
      const next = values.slice();
      Reflect.set(next, key, value);
      assign(next);
      return true;
    },
    defineProperty(target, key, descriptor) {
      if (key !== "length" && !numeric(key)) return Reflect.defineProperty(target, key, descriptor);
      if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || descriptor.configurable === false || descriptor.writable === false) {
        throw new TypeError("adoptedStyleSheets entries must remain mutable values");
      }
      const next = values.slice();
      Reflect.set(next, key, descriptor.value);
      assign(next);
      return true;
    },
    deleteProperty(target, key) {
      if (!numeric(key)) return Reflect.deleteProperty(target, key);
      return Number(key) >= values.length;
    },
  });
  list = { values, proxy, assign };
  adoptedLists.set(node, list);
  return list;
}

/** Installs or replaces a CSS import compiled by the development build tool. */
export function updateStyleSheet(id, compiled) {
  const key = String(id);
  const previous = importedSheets.get(key);
  if (compiled === null) {
    if (importedSheets.delete(key)) syncAdoptedSheets();
  } else if (previous) {
    previous.replaceCompiled(compiled);
  } else {
    importedSheets.set(key, CSSStyleSheet.fromCompiled(compiled));
    syncAdoptedSheets();
  }
}

/** A node of the tree. Make one with `createBox`, `createText`, `createInput` or `createNode`. */
export class Node {
  #listeners = null;
  // The base look, and the state looks by name: most nodes have the base alone.
  #base = null;
  #looks = null;
  #flags = 0;
  // Kinds the node hears whatever its listeners: an input keeps its value and selection current.
  #kept = 0;
  #attributes = null;
  #classList = null;

  constructor(kind) {
    Object.defineProperty(this, "nodeId", { value: ++nextId, enumerable: true });
    this.kind = kind;
    this.parentNode = null;
    // A text leaf has no children: they all share one empty list.
    this.childNodes = kind === "text" ? NO_CHILDREN : [];
    nodes.set(this.nodeId, this);
    native.create(this.nodeId, KINDS[kind]);
  }

  get adoptedStyleSheets() { return adoptedList(this).proxy; }
  set adoptedStyleSheets(value) { adoptedList(this).assign(Array.from(value)); }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) + 1] ?? null : null;
  }

  get previousSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) - 1] ?? null : null;
  }

  /** 1 for an element, 3 for text, 11 for a document fragment, as in the DOM. */
  get nodeType() {
    return 1;
  }

  hasChildNodes() {
    return this.childNodes.length > 0;
  }

  /** A copy with the same looks and attributes, and with `deep` copies of the children. */
  cloneNode(deep = false) {
    const copy = this._shallowClone();
    if (this.#base) this.#base._copyTo(copy.look("base"));
    for (const state in this.#looks ?? {}) this.#looks[state]._copyTo(copy.look(state));
    for (const [name, value] of this.#attributes ?? []) copy.setAttribute(name, value);
    if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
    return copy;
  }

  _shallowClone() {
    return new Node(this.kind);
  }

  /** Joins adjacent text children and drops empty ones, in the whole subtree. */
  normalize() {
    for (let node = this.firstChild; node; ) {
      if (node.nodeType !== 3) {
        node.normalize();
        node = node.nextSibling;
        continue;
      }
      let next = node.nextSibling;
      if (node.length === 0) {
        node.remove();
        node = next;
        continue;
      }
      let joined = "";
      for (let sibling = next; sibling?.nodeType === 3; sibling = sibling.nextSibling) joined += sibling.data;
      let length = node.length;
      node.replaceData(length, 0, joined);
      for (let current = next; current?.nodeType === 3; current = current.nextSibling) {
        const index = indexIn(current);
        eachLiveRange((range) => range._joined(current, node, length, index));
        length += current.length;
      }
      while (next?.nodeType === 3) {
        const after = next.nextSibling;
        next.remove();
        next = after;
      }
      node = next;
    }
  }

  /** Whether `other` is this node or inside it. */
  contains(other) {
    for (let node = other; node; node = node.parentNode) if (node === this) return true;
    return false;
  }

  /** Inserts `child` before `before`, or last without it. A child already in the tree moves. */
  insertBefore(child, before = null) {
    if (child.contains(this)) throw domError("HierarchyRequestError", "a node cannot be inserted into itself or its own subtree");
    if (this.nodeType === 3) throw domError("HierarchyRequestError", "text has no children");
    if (before && before.parentNode !== this) throw domError("NotFoundError", "the node to insert before is not a child of this node");
    if (child.nodeType === 11) {
      for (const node of [...child.childNodes]) this.insertBefore(node, before);
      return child;
    }
    if (before === child) before = child.nextSibling;
    const old = child.parentNode;
    if (old) {
      const index = old.childNodes.indexOf(child);
      if (liveRanges.size) eachLiveRange((range) => range._removing(child, old, index));
      old.childNodes.splice(index, 1);
    }
    child.parentNode = this;
    if (liveRanges.size) {
      const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
      eachLiveRange((range) => range._inserted(this, index));
    }
    if (before) {
      this.childNodes.splice(this.childNodes.indexOf(before), 0, child);
      native.insertBefore(this.nodeId, child.nodeId, before.nodeId);
    } else {
      this.childNodes.push(child);
      native.append(this.nodeId, child.nodeId);
    }
    return child;
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  /** Puts `node` where `child` is and detaches `child`. */
  replaceChild(node, child) {
    if (child.parentNode !== this) throw domError("NotFoundError", "the node to replace is not a child of this node");
    if (node === child) return child;
    let before = child.nextSibling;
    if (before === node) before = node.nextSibling;
    this.removeChild(child);
    this.insertBefore(node, before);
    return child;
  }

  /** Appends nodes, and strings as text nodes. */
  append(...children) {
    for (const child of children) this.insertBefore(typeof child === "string" ? createText(child) : child, null);
  }

  /** Detaches `child` and its subtree. It keeps its state and can be inserted again. */
  removeChild(child) {
    if (child.parentNode !== this) throw domError("NotFoundError", "the node to remove is not a child of this node");
    const index = this.childNodes.indexOf(child);
    if (liveRanges.size) eachLiveRange((range) => range._removing(child, this, index));
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    native.remove(child.nodeId);
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  /** Detaches and frees this node and its subtree. They cannot be used again. */
  destroy() {
    if (rootNode && this.contains(rootNode)) { clearAdoptedSheets(); rootNode = null; }
    const parent = this.parentNode;
    if (parent) {
      const index = parent.childNodes.indexOf(this);
      if (liveRanges.size) eachLiveRange((range) => range._removing(this, parent, index));
      parent.childNodes.splice(index, 1);
      this.parentNode = null;
    }
    native.destroy(this.nodeId);
    forget(this);
  }

  /**
   * The base look. `node.style.set({ width: 120 })` sets properties,
   * `node.style = { ... }` replaces the look.
   */
  get style() {
    return this.look("base");
  }

  set style(properties) {
    this.look("base").replace(properties);
  }

  /** The look the tree lays over the base in `state`: hover, active, focus, focusVisible, or
   * starting (what transitions start from when the node first shows, as `@starting-style`). */
  look(state) {
    if (state === "base") return (this.#base ??= new Look(this, 0));
    if (!(state in STATES)) throw new TypeError("the tree has no look '" + state + "'");
    this.#looks ??= Object.create(null);
    return (this.#looks[state] ??= new Look(this, STATES[state]));
  }

  /**
   * Sets a tree attribute: tabIndex, disabled, label, testId, placeholder and so on. A node
   * with an `href` is a link: a click on it or inside it that no listener prevented opens
   * the address with `open`, as a click on an `<a>` follows it.
   *
   * `role` and `aria-*` work as in the DOM, spelled `aria-checked` or `ariaChecked`. A role
   * the tree does not know is ignored with a warning. Literal ARIA and data attributes
   * remain available to selectors even when they have no native accessibility mapping.
   */
  get id() { return this._elementId ?? ""; }
  set id(value) { this.setAttribute("id", String(value)); }
  get className() { return this.getAttribute("class") ?? ""; }
  set className(value) { this.setAttribute("class", String(value)); }
  get classList() { return this.#classList ??= new ClassList(this); }

  getAttribute(name) {
    name = String(name);
    const aria = ariaName(name);
    name = aria === null ? name === "className" ? "class" : name : "aria-" + aria;
    return this.#attributes?.get(name) ?? null;
  }

  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) { this.setAttribute(name, null); }

  setAttribute(name, value) {
    name = String(name);
    const aria = ariaName(name);
    name = aria === null ? name === "className" ? "class" : name : "aria-" + aria;
    const text = value == null ? null : String(value);
    if (name === "role") {
      if (!native.attribute(this.nodeId, "role", text ?? "")) warnOnce("the tree has no role '" + text + "': it is ignored");
    } else if (name === "id") {
      this.#identify(text);
    } else if (aria !== null) {
      native.attribute(this.nodeId, name, text);
    } else if (name === "src") {
      // An image's address, as `<img src>`.
      if ("src" in this) this.src = text ?? "";
      else warnOnce("only an image has a src: it is ignored");
    } else if (name === "alt") {
      native.attribute(this.nodeId, "label", text ?? "");
    } else {
      if (name === "href") {
        this._href = text || null;
        this.#want(KIND_OF.get("click"));
      }
      native.attribute(this.nodeId, name,
        name === "class" || name === "lang" || name === "dir" || name.startsWith("data-") ? text : value);
    }
    if (text === null) this.#attributes?.delete(name);
    else (this.#attributes ??= new Map()).set(name, text);
  }

  // The `id` other nodes' relations name this node by.
  #identify(id) {
    const old = this._elementId ?? "";
    if (old === (id ?? "") && this.getAttribute("id") === id) return;
    this._elementId = id || undefined;
    native.attribute(this.nodeId, "id", id);
  }

  // Tells the tree which events this node wants: its listeners', and clicks on a link.
  #want(kind) {
    const has = (type) => (this.#listeners?.get(type)?.length ?? 0) > 0;
    let wanted;
    let bit;
    if (kind >= TOUCH_START) {
      wanted = TYPES.slice(TOUCH_START).some(has);
      bit = TOUCH_FLAG;
    } else {
      const type = TYPES[kind];
      wanted = has(type) || (MOUSE_OF.has(type) && has(MOUSE_OF.get(type))) || (kind === CLICK && this._href);
      bit = 1 << kind;
    }
    const flags = (wanted ? this.#flags | bit : this.#flags & ~bit) | this.#kept;
    if (flags !== this.#flags) native.listen(this.nodeId, (this.#flags = flags));
  }

  _keep(...types) {
    for (const type of types) this.#kept |= 1 << KIND_OF.get(type);
    this.#want(KIND_OF.get(types[0]));
  }

  set tabIndex(value) {
    native.attribute(this.nodeId, "tabIndex", value);
  }

  set disabled(value) {
    native.attribute(this.nodeId, "disabled", value);
  }

  focus() {
    native.focus(this.nodeId);
  }

  /**
   * Sends the pointer's records here until it lifts, as DOM `setPointerCapture`. Throws
   * `NotFoundError` for a pointer that is not down. The tree moves the capture of the
   * primary pointer; another finger keeps sending to the node it went down on.
   */
  setPointerCapture(pointerId) {
    const pointer = pointers.get(pointerId);
    if (!pointer) throw domError("NotFoundError", `no active pointer with id ${pointerId}`);
    if (!pointer.buttons) return;
    pointer.capture = this;
    if (pointer.primary) native.capture(this.nodeId);
  }

  releasePointerCapture(pointerId) {
    const pointer = pointers.get(pointerId);
    if (!pointer) throw domError("NotFoundError", `no active pointer with id ${pointerId}`);
    if (pointer.capture !== this) return;
    pointer.capture = null;
    if (pointer.primary) native.capture(0);
  }

  hasPointerCapture(pointerId) {
    return pointers.get(pointerId)?.capture === this;
  }

  scrollTo(x, y) {
    native.scrollTo(this.nodeId, x, y);
  }

  scroll(x, y) {
    native.scrollTo(this.nodeId, x, y);
  }

  /**
   * As on the web. `options` is `true` or `{ capture: true }` for the capture phase, and
   * `{ once: true }` for a listener that runs once. A type the tree has no event for is the
   * app's own, sent with `dispatchEvent`.
   */
  addEventListener(type, listener, options) {
    const signal = options?.signal;
    if (listener == null || signal?.aborted) return;
    const kind = KIND_OF.get(POINTER_OF.get(type) ?? type);
    const capture = options === true || !!options?.capture;
    this.#listeners ??= new Map();
    let list = this.#listeners.get(type);
    if (!list) this.#listeners.set(type, (list = []));
    if (list.some((entry) => entry.listener === listener && entry.capture === capture)) return;
    list.push({ listener, capture, once: !!options?.once });
    if (kind !== undefined) this.#want(kind);
    signal?.addEventListener("abort", () => this.removeEventListener(type, listener, capture), { once: true });
  }

  removeEventListener(type, listener, options) {
    const list = this.#listeners?.get(type);
    if (!list) return;
    const capture = options === true || !!options?.capture;
    const index = list.findIndex((entry) => entry.listener === listener && entry.capture === capture);
    if (index < 0) return;
    list.splice(index, 1);
    const kind = KIND_OF.get(POINTER_OF.get(type) ?? type);
    if (kind !== undefined) this.#want(kind);
  }

  /** Sends `event` (an `Event` or `CustomEvent`) through the tree from this node, as on the web. */
  dispatchEvent(event) {
    if (typeof event?.type !== "string") throw new TypeError("dispatchEvent takes an Event");
    return dispatchEvent(adopt(event, this));
  }

  /** Runs the capture or the bubble listeners of `event.type`. Used by the dispatcher. */
  _run(event, capture) {
    const list = this.#listeners?.get(event.type);
    if (!list) return;
    for (const entry of list.slice()) {
      if (event._immediate) return;
      if (entry.capture !== capture) continue;
      if (entry.once) this.removeEventListener(event.type, entry.listener, entry.capture);
      try {
        if (typeof entry.listener === "function") entry.listener.call(this, event);
        else entry.listener.handleEvent(event);
      } catch (error) {
        reportError(error);
      }
    }
  }
}

/** A text leaf. It takes its look from its parent. */
export class Text extends Node {
  #data = "";

  constructor(data = "") {
    super("text");
    this.data = data;
  }

  get data() {
    return this.#data;
  }

  set data(value) {
    this.replaceData(0, this.#data.length, value == null ? "" : value);
  }

  get nodeType() {
    return 3;
  }

  get nodeValue() {
    return this.#data;
  }

  set nodeValue(value) {
    this.data = value;
  }

  get textContent() {
    return this.#data;
  }

  set textContent(value) {
    this.data = value;
  }

  get length() {
    return this.#data.length;
  }

  _shallowClone() {
    return new Text(this.#data);
  }

  substringData(offset, count) {
    offset = offset >>> 0;
    if (offset > this.#data.length) throw domError("IndexSizeError", "the offset is past the end of the text");
    return this.#data.substring(offset, offset + (count >>> 0));
  }

  appendData(data) {
    this.replaceData(this.#data.length, 0, data);
  }

  insertData(offset, data) {
    this.replaceData(offset, 0, data);
  }

  deleteData(offset, count) {
    this.replaceData(offset, count, "");
  }

  replaceData(offset, count, data) {
    offset = offset >>> 0;
    count = count >>> 0;
    data = String(data);
    const old = this.#data;
    if (offset > old.length) throw domError("IndexSizeError", "the offset is past the end of the text");
    if (offset + count > old.length) count = old.length - offset;
    if (liveRanges.size) eachLiveRange((range) => range._replaced(this, offset, count, data.length));
    const value = old.slice(0, offset) + data + old.slice(offset + count);
    if (value === old && value !== "") return;
    this.#data = value;
    native.setText(this.nodeId, value);
    if (this._svgText) svgChanged(this);
  }

  /** Splits at `offset`: this keeps the text before it, and a new next sibling the rest. */
  splitText(offset) {
    offset = offset >>> 0;
    const length = this.#data.length;
    if (offset > length) throw domError("IndexSizeError", "the offset is past the end of the text");
    const rest = new Text(this.#data.slice(offset));
    const parent = this.parentNode;
    if (parent) {
      parent.insertBefore(rest, this.nextSibling);
      const index = indexIn(this);
      if (liveRanges.size) eachLiveRange((range) => range._split(this, rest, offset, parent, index));
    }
    this.replaceData(offset, length - offset, "");
    return rest;
  }
}

/**
 * An editable text field. `value` follows what the user types. Selection offsets are UTF-16
 * string indices, as on the web; the tree counts UTF-8 bytes, converted here.
 */
export class Input extends Node {
  #value = "";
  #start = 0;
  #end = 0;
  #direction = "forward";

  constructor() {
    super("input");
    this._keep("input", "selectionchange");
  }

  /** The text the selection offsets index into. */
  _text() {
    return this.#value;
  }

  _shallowClone() {
    const copy = new this.constructor();
    copy.value = this.#value;
    return copy;
  }

  get value() {
    return this.#value;
  }

  set value(value) {
    value = String(value);
    if (value === this.#value) return;
    this.#value = value;
    native.setText(this.nodeId, value);
    this.#start = this.#end = value.length;
    this.#direction = "forward";
  }

  get selectionStart() {
    return this.#start;
  }

  set selectionStart(value) {
    const start = clampIndex(value, this._text().length);
    this.setSelectionRange(start, Math.max(start, this.#end), this.#direction);
  }

  get selectionEnd() {
    return this.#end;
  }

  set selectionEnd(value) {
    this.setSelectionRange(this.#start, clampIndex(value, this._text().length), this.#direction);
  }

  get selectionDirection() {
    return this.#direction;
  }

  set selectionDirection(value) {
    this.setSelectionRange(this.#start, this.#end, value);
  }

  /** Selects `start` to `end`; with `direction` "backward" the caret sits at `start`. */
  setSelectionRange(start, end, direction = "none") {
    const text = this._text();
    end = clampIndex(end, text.length);
    start = Math.min(clampIndex(start, text.length), end);
    const backward = direction === "backward";
    this.#start = start;
    this.#end = end;
    this.#direction = backward ? "backward" : "forward";
    const anchor = byteOf(text, backward ? end : start);
    const focus = byteOf(text, backward ? start : end);
    native.select(this.nodeId, anchor, focus);
  }

  /** Selects the whole value. */
  select() {
    this.setSelectionRange(0, this._text().length);
  }

  /**
   * Replaces `start` to `end` (the selection by default) with `replacement`. `selectionMode`
   * is "select", "start", "end" or "preserve", as on the web.
   */
  setRangeText(replacement, start, end, selectionMode = "preserve") {
    replacement = String(replacement);
    const text = this._text();
    if (start === undefined) {
      start = this.#start;
      end = this.#end;
    } else if (end === undefined) {
      throw new TypeError("setRangeText needs both start and end");
    } else if (Number(start) > Number(end)) {
      throw domError("IndexSizeError", "setRangeText: start is after end");
    }
    start = clampIndex(start, text.length);
    end = clampIndex(end, text.length);
    let selectionStart = this.#start;
    let selectionEnd = this.#end;
    const delta = replacement.length - (end - start);
    const newEnd = start + replacement.length;
    if (selectionMode === "select") {
      selectionStart = start;
      selectionEnd = newEnd;
    } else if (selectionMode === "start") {
      selectionStart = selectionEnd = start;
    } else if (selectionMode === "end") {
      selectionStart = selectionEnd = newEnd;
    } else {
      if (selectionStart > end) selectionStart += delta;
      else if (selectionStart > start) selectionStart = start;
      if (selectionEnd > end) selectionEnd += delta;
      else if (selectionEnd > start) selectionEnd = newEnd;
    }
    const direction = this.#direction;
    this._replace(start, end, replacement);
    this.setSelectionRange(selectionStart, selectionEnd, direction);
  }

  _replace(start, end, replacement) {
    const text = this.#value;
    this.value = text.slice(0, start) + replacement + text.slice(end);
  }

  // From the tree: the value and selection in UTF-8 bytes.
  _changed(value, anchor, focus) {
    this.#value = value;
    this.#take(byteIndex(value, anchor), byteIndex(value, focus));
  }

  _selected(start, end) {
    const text = this._text();
    this.#take(byteIndex(text, start), byteIndex(text, end));
  }

  // The tree reports the low and high offsets only, so a selection it changed reads forward
  // unless it is the one set here.
  #take(a, b) {
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    if (start === this.#start && end === this.#end) return;
    this.#start = start;
    this.#end = end;
    this.#direction = "forward";
  }
}

function clampIndex(value, length) {
  const number = Math.trunc(Number(value)) || 0;
  return Math.min(Math.max(number, 0), length);
}

// A UTF-8 offset from the tree as a string index; NaN and missing read as 0.
function byteIndex(text, byte) {
  return indexOf(text, Number(byte) || 0);
}

// Inline SVG markup as icon resources: identical markup shares one, freed when no `<svg>`
// shows it. The ids start high, clear of resources a host or a URL table numbers from 1.
const ICONS = new Map();
let nextIcon = 0x40000000;

function holdIcon(markup) {
  let entry = ICONS.get(markup);
  if (!entry) {
    entry = { id: nextIcon++, count: 0 };
    ICONS.set(markup, entry);
    native.defineIcon(entry.id, markup);
  }
  entry.count++;
  return entry.id;
}

function dropIcon(markup) {
  const entry = ICONS.get(markup);
  if (entry && --entry.count === 0) {
    ICONS.delete(markup);
    native.release(entry.id);
  }
}

// Addresses as image resources, shared and freed as markup is. The tree keeps a load state per
// number, so these count from 1. The loader tells an SVG file from a bitmap by itself.
const ADDRESSES = new Map();
let nextAddress = 1;

function holdAddress(url) {
  let entry = ADDRESSES.get(url);
  if (!entry) {
    entry = { id: nextAddress++, count: 0 };
    ADDRESSES.set(url, entry);
    native.load(entry.id, url, false);
  }
  entry.count++;
  return entry.id;
}

function dropAddress(url) {
  const entry = ADDRESSES.get(url);
  if (entry && --entry.count === 0) {
    ADDRESSES.delete(url);
    native.release(entry.id);
  }
}

/**
 * An image, as an `<img>`: `src` is its address, a `data:` URL (base64 or percent-encoded),
 * a file or `http(s):`. An SVG file draws as an inline `<svg>` does. It hears `load` and
 * `error` when the address loads or fails.
 */
export class Image extends Node {
  #src = "";

  constructor(src = "") {
    super("image");
    this.src = src;
  }

  get src() {
    return this.#src;
  }

  set src(url) {
    url = url == null ? "" : String(url);
    if (url === this.#src) return;
    if (this.#src) dropAddress(this.#src);
    this.#src = url;
    native.source(this.nodeId, url ? holdAddress(url) : 0);
  }

  _forget() {
    if (this.#src) dropAddress(this.#src);
    this.#src = "";
  }

  _shallowClone() {
    return new Image(this.#src);
  }
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// SVG attribute names that are camel case in SVG itself. Any other name with a capital letter
// is a React-style spelling of a hyphenated one (`strokeWidth` for `stroke-width`).
const SVG_CAMEL = new Set([
  "viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "patternUnits",
  "patternContentUnits", "patternTransform", "clipPathUnits", "maskUnits", "maskContentUnits",
  "markerUnits", "markerWidth", "markerHeight", "refX", "refY", "spreadMethod", "stdDeviation",
  "textLength", "lengthAdjust", "startOffset", "pathLength", "baseFrequency", "numOctaves",
  "filterUnits", "primitiveUnits", "kernelMatrix", "kernelUnitLength", "tableValues",
  "surfaceScale", "specularConstant", "specularExponent", "diffuseConstant", "limitingConeAngle",
  "pointsAtX", "pointsAtY", "pointsAtZ", "edgeMode", "targetX", "targetY", "xChannelSelector",
  "yChannelSelector", "attributeName", "attributeType", "calcMode", "keyTimes", "keySplines",
  "keyPoints", "repeatCount", "repeatDur", "systemLanguage", "requiredFeatures", "zoomAndPan",
  "glyphRef", "stitchTiles", "viewTarget", "contentScriptType", "contentStyleType",
]);
const SVG_NAMES = new Map([
  ["className", "class"], ["htmlFor", "for"], ["xlinkHref", "xlink:href"], ["xlinkTitle", "xlink:title"],
  ["xmlSpace", "xml:space"], ["xmlLang", "xml:lang"], ["xmlnsXlink", "xmlns:xlink"],
]);

function svgName(name) {
  name = String(name);
  const named = SVG_NAMES.get(name);
  if (named) return named;
  if (SVG_CAMEL.has(name) || !/[A-Z]/.test(name)) return name;
  return name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
}

function escaped(text, attribute) {
  text = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return attribute ? text.replace(/"/g, "&quot;") : text;
}

// The svg roots whose markup changed, drawn again once, before the host applies the mutations.
const changedSvgs = new Set();

function drawSvgs() {
  for (const svg of changedSvgs) svg._draw();
  changedSvgs.clear();
}

/** The element of `node` in an `<svg>` subtree: its text, or its element. */
function svgOwner(node) {
  for (let at = node; at; at = at.parentNode) if (at instanceof Svg) return at;
  return null;
}

function svgChanged(node) {
  const svg = svgOwner(node);
  if (!svg || changedSvgs.has(svg)) return;
  if (changedSvgs.size === 0) queueMicrotask(drawSvgs);
  changedSvgs.add(svg);
}

function svgStyle(value) {
  if (typeof value !== "object" || value === null) return String(value);
  let css = "";
  for (const name of Object.keys(value)) {
    const part = value[name];
    if (part === null || part === undefined || part === "") continue;
    css += cssName(name) + ":" + (typeof part === "number" && !UNITLESS.has(name) ? part + "px" : part) + ";";
  }
  return css;
}

// The children of an element of an `<svg>`: the markup they write, and how they move.
const svgChildren = {
  insertBefore(child, before = null) {
    if (before && before.parentNode !== this) throw new Error("the node to insert before is not a child of this node");
    if (before === child) return child;
    for (let at = this; at; at = at.parentNode) if (at === child) throw new Error("a node cannot be inserted into itself or its own subtree");
    const old = child.parentNode;
    if (old) {
      svgChanged(old);
      old.childNodes.splice(old.childNodes.indexOf(child), 1);
    }
    child.parentNode = this;
    if (before) this.childNodes.splice(this.childNodes.indexOf(before), 0, child);
    else this.childNodes.push(child);
    if (child instanceof Text) child._svgText = true;
    svgChanged(this);
    return child;
  },
  appendChild(child) {
    return this.insertBefore(child, null);
  },
  append(...children) {
    for (const child of children) this.insertBefore(typeof child === "string" ? new SvgText(child) : child, null);
  },
  removeChild(child) {
    if (child.parentNode !== this) throw new Error("the node to remove is not a child of this node");
    svgChanged(this);
    this.childNodes.splice(this.childNodes.indexOf(child), 1);
    child.parentNode = null;
    return child;
  },
  get textContent() {
    let text = "";
    for (const child of this.childNodes) text += child.textContent ?? child.data ?? "";
    return text;
  },
  set textContent(value) {
    for (const child of this.childNodes.slice()) this.removeChild(child);
    if (value !== null && value !== undefined && value !== "") this.insertBefore(new SvgText(String(value)), null);
  },
  _markupOf(children) {
    let markup = "";
    for (const child of children) {
      if (child instanceof SvgElement) markup += child._markup();
      else markup += escaped(child.data ?? "", false);
    }
    return markup;
  },
};

/** Text in an `<svg>`: its `<text>` and `<title>` contents. */
export class SvgText {
  #data;

  constructor(data = "") {
    this.#data = String(data);
    this.parentNode = null;
    this.childNodes = NO_CHILDREN;
  }

  get data() {
    return this.#data;
  }

  set data(value) {
    value = String(value);
    if (value === this.#data) return;
    this.#data = value;
    svgChanged(this);
  }

  get textContent() {
    return this.#data;
  }

  set textContent(value) {
    this.data = value;
  }

  get nextSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) + 1] ?? null : null;
  }

  get previousSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) - 1] ?? null : null;
  }

  contains(other) {
    for (let node = other; node; node = node.parentNode) if (node === this) return true;
    return false;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  destroy() {
    this.remove();
  }
}

/**
 * An element inside an `<svg>`: `path`, `circle`, `g`, `linearGradient` and the rest. It is
 * no node of the tree: it is markup its `Svg` root draws. Its attributes take SVG's names or
 * React's spellings (`strokeWidth`, `xlinkHref`).
 */
export class SvgElement {
  #attributes = new Map();

  constructor(tag) {
    this.localName = String(tag);
    this.tagName = this.localName;
    this.namespaceURI = SVG_NAMESPACE;
    this.parentNode = null;
    this.childNodes = [];
  }

  getAttribute(name) {
    return this.#attributes.get(svgName(name)) ?? null;
  }

  hasAttribute(name) {
    return this.#attributes.has(svgName(name));
  }

  setAttribute(name, value) {
    name = svgName(name);
    if (value === null || value === undefined || value === false) {
      this.removeAttribute(name);
      return;
    }
    const text = name === "style" ? svgStyle(value) : String(value);
    if (this.#attributes.get(name) === text) return;
    this.#attributes.set(name, text);
    svgChanged(this);
  }

  removeAttribute(name) {
    if (this.#attributes.delete(svgName(name))) svgChanged(this);
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) + 1] ?? null : null;
  }

  get previousSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) - 1] ?? null : null;
  }

  contains(other) {
    for (let node = other; node; node = node.parentNode) if (node === this) return true;
    return false;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  /** Takes the element out of its `<svg>`. It is plain markup, so nothing else is freed. */
  destroy() {
    this.remove();
  }

  addEventListener(type) {
    warnOnce("an element inside an <svg> hears no events: listen on the <svg> ('" + type + "')");
  }

  removeEventListener() {}

  _markup() {
    let markup = "<" + this.localName;
    for (const [name, value] of this.#attributes) markup += " " + name + '="' + escaped(value, true) + '"';
    if (this.childNodes.length === 0) return markup + "/>";
    return markup + ">" + svgChildren._markupOf(this.childNodes) + "</" + this.localName + ">";
  }
}

for (const name of ["insertBefore", "appendChild", "append", "removeChild"]) SvgElement.prototype[name] = svgChildren[name];
Object.defineProperty(SvgElement.prototype, "textContent", Object.getOwnPropertyDescriptor(svgChildren, "textContent"));

// Attributes of an `<svg>` root the tree has: they go to its node. Every other one is markup.
function treeAttribute(name) {
  return name === "class" || name === "className" || name === "id" || name === "role" || name === "tabIndex"
    || name === "tabindex" || name === "testId" || name === "label" || name === "cursor" || name === "transition"
    || name === "inert" || name === "disabled" || name === "element" || name === "lang" || name === "dir"
    || name.startsWith("data-") || ariaName(name) !== null;
}

/**
 * An inline `<svg>`, as the web has it: its children are `SvgElement`s and `SvgText`s, and
 * the tree draws the markup they make as an icon. Its look, class, events and accessibility
 * are the node's; `viewBox`, `fill`, `width` and the other SVG attributes are markup.
 * Changes are drawn once, before the host applies the batch.
 */
export class Svg extends Node {
  #attributes = new Map();
  #markup = "";

  constructor() {
    // The tree's node for drawn SVG markup is an icon; to code it is an `svg`.
    super("icon");
    this.kind = "svg";
    this.localName = "svg";
    this.tagName = "svg";
    this.namespaceURI = SVG_NAMESPACE;
    svgChanged(this);
  }

  _shallowClone() {
    return new Svg();
  }

  getAttribute(name) {
    return treeAttribute(String(name)) ? super.getAttribute(name) : this.#attributes.get(svgName(name)) ?? null;
  }

  setAttribute(name, value) {
    name = String(name);
    if (treeAttribute(name)) {
      super.setAttribute(name === "tabindex" ? "tabIndex" : name, value);
      return;
    }
    name = svgName(name);
    if (name === "xmlns") return;
    if (value === null || value === undefined || value === false || value === "") {
      this.removeAttribute(name);
      return;
    }
    const text = name === "style" ? svgStyle(value) : String(value);
    if (this.#attributes.get(name) === text) return;
    this.#attributes.set(name, text);
    svgChanged(this);
  }

  removeAttribute(name) {
    name = String(name);
    if (treeAttribute(name)) super.removeAttribute(name);
    else if (this.#attributes.delete(svgName(name))) svgChanged(this);
  }

  /** The markup the tree draws, as `outerHTML` gives it. */
  get outerHTML() {
    let markup = '<svg xmlns="' + SVG_NAMESPACE + '"';
    const children = svgChildren._markupOf(this.childNodes);
    let xlink = this.#attributes.has("xmlns:xlink");
    for (const [name, value] of this.#attributes) {
      markup += " " + name + '="' + escaped(value, true) + '"';
    }
    if (!xlink && children.includes("xlink:")) markup += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    return markup + ">" + children + "</svg>";
  }

  _draw() {
    if (!nodes.has(this.nodeId)) return;
    const markup = this.outerHTML;
    if (markup === this.#markup) return;
    this._forget();
    this.#markup = markup;
    native.source(this.nodeId, holdIcon(markup));
  }

  _forget() {
    if (this.#markup) dropIcon(this.#markup);
    this.#markup = "";
  }
}

for (const name of ["insertBefore", "appendChild", "append", "removeChild"]) Svg.prototype[name] = svgChildren[name];
Object.defineProperty(Svg.prototype, "textContent", Object.getOwnPropertyDescriptor(svgChildren, "textContent"));

/**
 * An element of tag `tag` in the SVG namespace: an `Svg` root for `svg`, an `SvgElement`
 * inside one for anything else. `document.createElementNS` with the SVG namespace, as it were.
 */
export function createSvgElement(tag) {
  return tag === "svg" ? new Svg() : new SvgElement(tag);
}

/** Draws the `<svg>` roots that changed now, instead of before the host applies the batch. */
export function flushSvg() {
  drawSvgs();
}

// Offsets cross the bridge as UTF-8 bytes; a rich input speaks JavaScript string indices.
const ASCII = /^[\x00-\x7f]*$/;

function byteOf(text, index) {
  if (ASCII.test(text)) return Math.min(index, text.length);
  let bytes = 0;
  for (let i = 0; i < index && i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function indexOf(text, byte) {
  if (ASCII.test(text)) return Math.min(byte, text.length);
  let bytes = 0;
  let i = 0;
  while (i < text.length && bytes < byte) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
    i++;
  }
  return i;
}

function cssTextOf(properties) {
  let css = "";
  for (const name of Object.keys(properties ?? {})) {
    const value = properties[name];
    if (value === null || value === undefined || value === "") continue;
    css += cssName(name) + ":" + cssValue(name, value) + ";";
  }
  return css;
}

/** Where an atom sits in a rich input's text: U+FFFC OBJECT REPLACEMENT CHARACTER. */
export const OBJECT = "\ufffc";

/**
 * A rich text field: styled runs (marks) and inline atoms (mentions, chips) over the text the
 * user edits, with the caret, selection, undo and input method composition of `Input`.
 *
 * Its `document` is `{ text, marks, atoms }`. Each atom sits in `text` as one `OBJECT`
 * character, so the caret steps over it as one unit; `atoms` lists them in text order as
 * `{ kind, label, data }`. `marks` lists `{ start, end, marks }` spans with mark names.
 * Offsets here, in `selectionStart` and in `insertAtom`, are string indices.
 */
export class RichInput extends Input {
  #markBits = new Map();
  #markNames = [];
  #kinds = new Map();
  #kindNames = [];
  #document = { text: "", marks: [], atoms: [] };

  constructor() {
    super();
    /** The marks text typed at the caret gets, as of the last change. */
    this.activeMarks = [];
  }

  #bit(name) {
    let bit = this.#markBits.get(name);
    if (bit === undefined) {
      bit = this.#markNames.length;
      if (bit >= 32) throw new RangeError("a rich input has at most 32 marks");
      this.#markBits.set(name, bit);
      this.#markNames.push(name);
    }
    return bit;
  }

  #kind(name) {
    let kind = this.#kinds.get(name);
    if (kind === undefined) {
      kind = this.#kindNames.length;
      this.#kinds.set(name, kind);
      this.#kindNames.push(name);
    }
    return kind;
  }

  #names(bits) {
    const names = [];
    for (let bit = 0; bit < this.#markNames.length; bit++) if (bits & (1 << bit)) names.push(this.#markNames[bit]);
    return names;
  }

  /** What text with mark `name` looks like: properties as `style.set` takes them. */
  defineMark(name, style) {
    native.mark(this.nodeId, this.#bit(name), cssTextOf(style));
  }

  /** What atoms of `kind` look like: the inline block holding the label. */
  defineAtom(kind, style) {
    native.atomStyle(this.nodeId, this.#kind(kind), cssTextOf(style));
  }

  get document() {
    return this.#document;
  }

  _shallowClone() {
    const copy = new RichInput();
    copy.document = this.#document;
    return copy;
  }

  /** Replaces the document. The caret goes to the end and the undo history is forgotten. */
  set document(document) {
    const text = String(document?.text ?? "");
    const marks = (document?.marks ?? []).map((span) => ({ start: span.start, end: span.end, marks: [...span.marks] }));
    const atoms = (document?.atoms ?? []).map((atom) => ({ kind: atom.kind, label: String(atom.label ?? ""), data: atom.data ?? "" }));
    this.#document = { text, marks, atoms };
    let packedMarks = "";
    for (const span of marks) {
      let bits = 0;
      for (const name of span.marks) bits |= 1 << this.#bit(name);
      packedMarks += byteOf(text, span.start) + "," + byteOf(text, span.end) + "," + (bits >>> 0) + ";";
    }
    let packedAtoms = "";
    for (const atom of atoms) packedAtoms += this.#packAtom(atom);
    native.richText(this.nodeId, text, packedMarks, packedAtoms);
    const end = byteOf(text, text.length);
    super._changed(text, end, end);
  }

  #packAtom(atom) {
    return this.#kind(atom.kind) + "\0" + String(atom.label ?? "") + "\0" + String(atom.data ?? "") + "\0";
  }

  /** Turns mark `name` on or off over the selection, or for the text typed next. */
  format(name, on = true) {
    native.format(this.nodeId, this.#bit(name), !!on);
  }

  /** Turns mark `name` off where the caret's text has it, on where it does not. */
  toggleMark(name) {
    this.format(name, !this.activeMarks.includes(name));
  }

  /** Replaces the text from `start` to `end` with `atom` (`{ kind, label, data }`). */
  insertAtom(start, end, atom) {
    const text = this.#document.text;
    native.insertAtom(this.nodeId, byteOf(text, start), byteOf(text, end), this.#packAtom(atom));
  }

  // Marks around the range stay, shifted; the replacement takes none. Atoms in the range go,
  // and OBJECT characters in the replacement become U+FFFD, since they would name no atom.
  _replace(start, end, replacement) {
    const { text, marks, atoms } = this.#document;
    replacement = replacement.replaceAll(OBJECT, "\ufffd");
    const delta = replacement.length - (end - start);
    const shift = (index, inside) => (index <= start ? index : index >= end ? index + delta : inside);
    const spans = [];
    for (const span of marks) {
      const from = shift(span.start, start + replacement.length);
      const to = shift(span.end, start);
      if (to > from) spans.push({ start: from, end: to, marks: span.marks });
    }
    let before = 0;
    let inside = 0;
    for (let i = 0; i < end; i++) {
      if (text[i] !== OBJECT) continue;
      if (i < start) before++;
      else inside++;
    }
    const kept = atoms.slice(0, before).concat(atoms.slice(before + inside));
    this.document = { text: text.slice(0, start) + replacement + text.slice(end), marks: spans, atoms: kept };
  }

  _changed(value, anchor, focus, marks, atoms, active) {
    super._changed(value, anchor, focus);
    if (marks === undefined) return;
    const spans = [];
    for (const part of String(marks).split(";")) {
      if (!part) continue;
      const [start, end, bits] = part.split(",").map(Number);
      spans.push({ start: indexOf(value, start), end: indexOf(value, end), marks: this.#names(bits) });
    }
    const list = [];
    const fields = String(atoms ?? "").split("\0");
    for (let i = 0; i + 2 < fields.length; i += 3) {
      list.push({ kind: this.#kindNames[Number(fields[i])] ?? Number(fields[i]), label: fields[i + 1], data: fields[i + 2] });
    }
    this.#document = { text: value, marks: spans, atoms: list };
    this.activeMarks = this.#names(active ?? 0);
  }

  _selected(start, end, active) {
    super._selected(start, end);
    this.activeMarks = this.#names(active ?? 0);
  }
}

/** A rich text field with `style` as its base look. */
export function createRichInput(style) {
  const input = new RichInput();
  if (style) input.style.set(style);
  return input;
}

function forget(node) {
  nodes.delete(node.nodeId);
  node._forget?.();
  for (const child of node.childNodes) {
    child.parentNode = null;
    forget(child);
  }
  node.childNodes = [];
}

export function createNode(kind) {
  if (kind === "richinput") return new RichInput();
  if (kind === "svg") return new Svg();
  if (kind === "img") kind = "image";
  if (!(kind in KINDS) || kind === "icon") throw new TypeError("the tree has no node kind '" + kind + "'");
  if (kind === "text") return new Text();
  if (kind === "input") return new Input();
  if (kind === "image") return new Image();
  return new Node(kind);
}

/** A box with `style` as its base look and `children` appended. */
export function createBox(style, ...children) {
  const box = new Node("box");
  if (style) box.style.set(style);
  box.append(...children);
  return box;
}

export function createText(data = "") {
  return new Text(data);
}

/** An image showing `src` (see `Image`), with `style` as its base look. */
export function createImage(src, style) {
  const image = new Image(src);
  if (style) image.style.set(style);
  return image;
}

export function createInput(style) {
  const input = new Input();
  if (style) input.style.set(style);
  return input;
}

/**
 * Nodes held together outside the tree, as the DOM's `DocumentFragment`. Inserting it
 * inserts its children, in order, and leaves it empty.
 */
export class DocumentFragment extends Node {
  constructor() {
    super("box");
  }

  get nodeType() {
    return 11;
  }

  _shallowClone() {
    return new DocumentFragment();
  }
}

export function createDocumentFragment() {
  return new DocumentFragment();
}

// Ranges, as the DOM Standard defines them, over the nodes of this module. Every change to
// the tree passes through these nodes, so live ranges follow it here, with no native calls.

function nodeLength(node) {
  return node.nodeType === 3 ? node.length : node.childNodes.length;
}

function indexIn(node) {
  return node.parentNode ? node.parentNode.childNodes.indexOf(node) : 0;
}

function rootOf(node) {
  while (node.parentNode) node = node.parentNode;
  return node;
}

function isInclusiveAncestor(ancestor, node) {
  for (; node; node = node.parentNode) if (node === ancestor) return true;
  return false;
}

// -1 when `a` comes before `b` in tree order, 1 after, 0 the same node. One root.
function treeOrder(a, b) {
  if (a === b) return 0;
  const up = [];
  for (let node = a; node; node = node.parentNode) up.push(node);
  const other = [];
  for (let node = b; node; node = node.parentNode) other.push(node);
  let i = up.length - 1;
  let j = other.length - 1;
  while (i >= 0 && j >= 0 && up[i] === other[j]) {
    i--;
    j--;
  }
  if (i < 0) return -1;
  if (j < 0) return 1;
  const siblings = up[i + 1].childNodes;
  return siblings.indexOf(up[i]) < siblings.indexOf(other[j]) ? -1 : 1;
}

// The position of boundary point (a, aOffset) relative to (b, bOffset): -1 before, 0 equal,
// 1 after. Both are in one tree.
function comparePoints(a, aOffset, b, bOffset) {
  if (a === b) return aOffset === bOffset ? 0 : aOffset < bOffset ? -1 : 1;
  if (treeOrder(a, b) > 0) return -comparePoints(b, bOffset, a, aOffset);
  if (isInclusiveAncestor(a, b)) {
    let child = b;
    while (child.parentNode !== a) child = child.parentNode;
    if (indexIn(child) < aOffset) return 1;
  }
  return -1;
}

// The next node in tree order inside `within`, or null.
function following(node, within, skipChildren = false) {
  if (!skipChildren && node.childNodes.length) return node.childNodes[0];
  for (; node && node !== within; node = node.parentNode) {
    const next = node.nextSibling;
    if (next) return next;
  }
  return null;
}

function checkNode(node, what) {
  if (!(node instanceof Node)) throw new TypeError(what + " is not a node");
  return node;
}

/** The fields every range has: two boundary points. */
export class AbstractRange {
  constructor() {
    if (new.target === AbstractRange) throw new TypeError("Illegal constructor");
  }

  get startContainer() {
    return this._startNode;
  }

  get startOffset() {
    return this._startOffset;
  }

  get endContainer() {
    return this._endNode;
  }

  get endOffset() {
    return this._endOffset;
  }

  get collapsed() {
    return this._startNode === this._endNode && this._startOffset === this._endOffset;
  }
}

/** A range that does not follow changes to the tree, and is not checked when made. */
export class StaticRange extends AbstractRange {
  constructor(init) {
    super();
    if (init == null || typeof init !== "object") throw new TypeError("StaticRange needs its four members");
    for (const key of ["startContainer", "startOffset", "endContainer", "endOffset"]) {
      if (init[key] === undefined) throw new TypeError("StaticRange needs " + key);
    }
    this._startNode = checkNode(init.startContainer, "startContainer");
    this._startOffset = init.startOffset >>> 0;
    this._endNode = checkNode(init.endContainer, "endContainer");
    this._endOffset = init.endOffset >>> 0;
  }
}

// The node a new range starts in: the mounted root, else a detached one of its own.
let rangeHome = null;

/** A live range: it follows insertions, removals and text changes, as on the web. */
export class Range extends AbstractRange {
  static START_TO_START = 0;
  static START_TO_END = 1;
  static END_TO_END = 2;
  static END_TO_START = 3;

  constructor() {
    super();
    const home = rootNode ?? (rangeHome ??= new Node("box"));
    this._startNode = this._endNode = home;
    this._startOffset = this._endOffset = 0;
    liveRanges.add(new WeakRef(this));
  }

  get commonAncestorContainer() {
    let container = this._startNode;
    while (!isInclusiveAncestor(container, this._endNode)) container = container.parentNode;
    return container;
  }

  // Called after the boundary points change; a selection's range tells the tree.
  _changed() {}

  #set(node, offset, start) {
    checkNode(node, "the container");
    offset = offset >>> 0;
    if (offset > nodeLength(node)) throw domError("IndexSizeError", "the offset is past the end of the node");
    if (start) {
      if (rootOf(node) !== rootOf(this._startNode) || comparePoints(node, offset, this._endNode, this._endOffset) > 0) {
        this._endNode = node;
        this._endOffset = offset;
      }
      this._startNode = node;
      this._startOffset = offset;
    } else {
      if (rootOf(node) !== rootOf(this._startNode) || comparePoints(node, offset, this._startNode, this._startOffset) < 0) {
        this._startNode = node;
        this._startOffset = offset;
      }
      this._endNode = node;
      this._endOffset = offset;
    }
    this._changed();
  }

  setStart(node, offset) {
    this.#set(node, offset, true);
  }

  setEnd(node, offset) {
    this.#set(node, offset, false);
  }

  setStartBefore(node) {
    this.#set(parentOf(node), indexIn(node), true);
  }

  setStartAfter(node) {
    this.#set(parentOf(node), indexIn(node) + 1, true);
  }

  setEndBefore(node) {
    this.#set(parentOf(node), indexIn(node), false);
  }

  setEndAfter(node) {
    this.#set(parentOf(node), indexIn(node) + 1, false);
  }

  collapse(toStart = false) {
    if (toStart) {
      this._endNode = this._startNode;
      this._endOffset = this._startOffset;
    } else {
      this._startNode = this._endNode;
      this._startOffset = this._endOffset;
    }
    this._changed();
  }

  selectNode(node) {
    const parent = parentOf(node);
    const index = indexIn(node);
    this.#select(parent, index, parent, index + 1);
  }

  selectNodeContents(node) {
    checkNode(node, "the node");
    this.#select(node, 0, node, nodeLength(node));
  }

  #select(startNode, startOffset, endNode, endOffset) {
    this._startNode = startNode;
    this._startOffset = startOffset;
    this._endNode = endNode;
    this._endOffset = endOffset;
    this._changed();
  }

  compareBoundaryPoints(how, sourceRange) {
    how = Number(how) & 0xffff;
    if (how > 3) throw domError("NotSupportedError", "compareBoundaryPoints takes 0 to 3");
    if (!(sourceRange instanceof Range)) throw new TypeError("compareBoundaryPoints takes a Range");
    if (rootOf(this._startNode) !== rootOf(sourceRange._startNode)) throw domError("WrongDocumentError", "the ranges are in different trees");
    const thisStart = how === 0 || how === 3;
    const otherStart = how === 0 || how === 1;
    return comparePoints(
      thisStart ? this._startNode : this._endNode,
      thisStart ? this._startOffset : this._endOffset,
      otherStart ? sourceRange._startNode : sourceRange._endNode,
      otherStart ? sourceRange._startOffset : sourceRange._endOffset,
    );
  }

  #checkPoint(node, offset) {
    if (offset > nodeLength(node)) throw domError("IndexSizeError", "the offset is past the end of the node");
  }

  comparePoint(node, offset) {
    checkNode(node, "the node");
    offset = offset >>> 0;
    if (rootOf(node) !== rootOf(this._startNode)) throw domError("WrongDocumentError", "the node is in a different tree");
    this.#checkPoint(node, offset);
    if (comparePoints(node, offset, this._startNode, this._startOffset) < 0) return -1;
    if (comparePoints(node, offset, this._endNode, this._endOffset) > 0) return 1;
    return 0;
  }

  isPointInRange(node, offset) {
    checkNode(node, "the node");
    offset = offset >>> 0;
    if (rootOf(node) !== rootOf(this._startNode)) return false;
    this.#checkPoint(node, offset);
    return comparePoints(node, offset, this._startNode, this._startOffset) >= 0
      && comparePoints(node, offset, this._endNode, this._endOffset) <= 0;
  }

  intersectsNode(node) {
    checkNode(node, "the node");
    if (rootOf(node) !== rootOf(this._startNode)) return false;
    const parent = node.parentNode;
    if (!parent) return true;
    const offset = indexIn(node);
    return comparePoints(parent, offset, this._endNode, this._endOffset) < 0
      && comparePoints(parent, offset + 1, this._startNode, this._startOffset) > 0;
  }

  cloneRange() {
    const copy = new Range();
    copy.#select(this._startNode, this._startOffset, this._endNode, this._endOffset);
    return copy;
  }

  detach() {}

  #contains(node) {
    return rootOf(node) === rootOf(this._startNode)
      && comparePoints(node, 0, this._startNode, this._startOffset) > 0
      && comparePoints(node, nodeLength(node), this._endNode, this._endOffset) < 0;
  }

  #partlyContains(node) {
    return isInclusiveAncestor(node, this._startNode) !== isInclusiveAncestor(node, this._endNode);
  }

  toString() {
    const start = this._startNode;
    const end = this._endNode;
    if (start === end && start.nodeType === 3) return start.data.slice(this._startOffset, this._endOffset);
    let text = start.nodeType === 3 ? start.data.slice(this._startOffset) : "";
    const within = this.commonAncestorContainer;
    for (let node = following(within, within); node; node = following(node, within)) {
      if (node.nodeType === 3 && this.#contains(node)) text += node.data;
    }
    if (end.nodeType === 3) text += end.data.slice(0, this._endOffset);
    return text;
  }

  // The parts of the contents algorithms the three of them share.
  #split() {
    const startNode = this._startNode;
    const endNode = this._endNode;
    const common = this.commonAncestorContainer;
    const children = common.childNodes;
    const first = isInclusiveAncestor(startNode, endNode) ? null : children.find((child) => this.#partlyContains(child)) ?? null;
    let last = null;
    if (!isInclusiveAncestor(endNode, startNode)) {
      for (let i = children.length - 1; i >= 0; i--) {
        if (this.#partlyContains(children[i])) {
          last = children[i];
          break;
        }
      }
    }
    return { common, first, last, contained: children.filter((child) => this.#contains(child)) };
  }

  // Where the range collapses after its contents leave.
  #after() {
    if (isInclusiveAncestor(this._startNode, this._endNode)) return [this._startNode, this._startOffset];
    let reference = this._startNode;
    while (reference.parentNode && !isInclusiveAncestor(reference.parentNode, this._endNode)) reference = reference.parentNode;
    return [reference.parentNode, indexIn(reference) + 1];
  }

  deleteContents() {
    if (this.collapsed) return;
    const startNode = this._startNode;
    const startOffset = this._startOffset;
    const endNode = this._endNode;
    const endOffset = this._endOffset;
    if (startNode === endNode && startNode.nodeType === 3) {
      startNode.replaceData(startOffset, endOffset - startOffset, "");
      return;
    }
    const remove = [];
    const within = this.commonAncestorContainer;
    for (let node = following(within, within); node; ) {
      if (this.#contains(node)) {
        remove.push(node);
        node = following(node, within, true);
      } else {
        node = following(node, within);
      }
    }
    const [node, offset] = this.#after();
    if (startNode.nodeType === 3) startNode.replaceData(startOffset, startNode.length - startOffset, "");
    for (const child of remove) child.remove();
    if (endNode.nodeType === 3) endNode.replaceData(0, endOffset, "");
    this.#select(node, offset, node, offset);
  }

  #contents(extract) {
    const fragment = new DocumentFragment();
    if (this.collapsed) return fragment;
    const startNode = this._startNode;
    const startOffset = this._startOffset;
    const endNode = this._endNode;
    const endOffset = this._endOffset;
    if (startNode === endNode && startNode.nodeType === 3) {
      const clone = startNode.cloneNode();
      clone.data = startNode.substringData(startOffset, endOffset - startOffset);
      fragment.appendChild(clone);
      if (extract) startNode.replaceData(startOffset, endOffset - startOffset, "");
      return fragment;
    }
    const { first, last, contained } = this.#split();
    const after = extract ? this.#after() : null;
    if (first?.nodeType === 3) {
      const clone = startNode.cloneNode();
      clone.data = startNode.substringData(startOffset, startNode.length - startOffset);
      fragment.appendChild(clone);
      if (extract) startNode.replaceData(startOffset, startNode.length - startOffset, "");
    } else if (first) {
      const clone = first.cloneNode();
      fragment.appendChild(clone);
      const inner = new Range();
      inner.#select(startNode, startOffset, first, nodeLength(first));
      clone.appendChild(inner.#contents(extract));
    }
    for (const child of contained) fragment.appendChild(extract ? child : child.cloneNode(true));
    if (last?.nodeType === 3) {
      const clone = endNode.cloneNode();
      clone.data = endNode.substringData(0, endOffset);
      fragment.appendChild(clone);
      if (extract) endNode.replaceData(0, endOffset, "");
    } else if (last) {
      const clone = last.cloneNode();
      fragment.appendChild(clone);
      const inner = new Range();
      inner.#select(last, 0, endNode, endOffset);
      clone.appendChild(inner.#contents(extract));
    }
    if (extract) this.#select(after[0], after[1], after[0], after[1]);
    return fragment;
  }

  /** Moves the contents into a new fragment and collapses the range where they were. */
  extractContents() {
    return this.#contents(true);
  }

  /** Copies the contents into a new fragment. */
  cloneContents() {
    return this.#contents(false);
  }

  /** Inserts `node` at the start of the range. */
  insertNode(node) {
    checkNode(node, "the node");
    const start = this._startNode;
    if ((start.nodeType === 3 && !start.parentNode) || start === node) {
      throw domError("HierarchyRequestError", "cannot insert the node there");
    }
    let reference = start.nodeType === 3 ? start : start.childNodes[this._startOffset] ?? null;
    const parent = reference ? reference.parentNode : start;
    if (isInclusiveAncestor(node, parent)) throw domError("HierarchyRequestError", "a node cannot be inserted into itself");
    if (parent.nodeType === 3) throw domError("HierarchyRequestError", "text has no children");
    if (start.nodeType === 3) reference = start.splitText(this._startOffset);
    if (node === reference) reference = node.nextSibling;
    if (node.parentNode) node.remove();
    let offset = reference ? indexIn(reference) : nodeLength(parent);
    offset += node.nodeType === 11 ? node.childNodes.length : 1;
    parent.insertBefore(node, reference);
    if (this.collapsed) this.#set(parent, offset, false);
  }

  /** Wraps the contents in `newParent`. */
  surroundContents(newParent) {
    checkNode(newParent, "the new parent");
    const within = this.commonAncestorContainer;
    for (let node = within; node; node = following(node, within)) {
      if (node.nodeType !== 3 && this.#partlyContains(node)) {
        throw domError("InvalidStateError", "the range splits an element");
      }
    }
    if (newParent.nodeType === 11) throw domError("InvalidNodeTypeError", "a fragment cannot surround the range");
    const fragment = this.extractContents();
    while (newParent.firstChild) newParent.removeChild(newParent.firstChild);
    this.insertNode(newParent);
    newParent.appendChild(fragment);
    this.selectNode(newParent);
  }

  // The DOM Standard's live range steps, run by the nodes as they change.

  _inserted(parent, index) {
    if (this._startNode === parent && this._startOffset > index) this._startOffset++;
    if (this._endNode === parent && this._endOffset > index) this._endOffset++;
  }

  _removing(child, parent, index) {
    if (isInclusiveAncestor(child, this._startNode)) {
      this._startNode = parent;
      this._startOffset = index;
    }
    if (isInclusiveAncestor(child, this._endNode)) {
      this._endNode = parent;
      this._endOffset = index;
    }
    if (this._startNode === parent && this._startOffset > index) this._startOffset--;
    if (this._endNode === parent && this._endOffset > index) this._endOffset--;
  }

  _replaced(node, offset, count, added) {
    if (this._startNode === node) {
      if (this._startOffset > offset + count) this._startOffset += added - count;
      else if (this._startOffset > offset) this._startOffset = offset;
    }
    if (this._endNode === node) {
      if (this._endOffset > offset + count) this._endOffset += added - count;
      else if (this._endOffset > offset) this._endOffset = offset;
    }
  }

  _split(node, rest, offset, parent, index) {
    if (this._startNode === node && this._startOffset > offset) {
      this._startNode = rest;
      this._startOffset -= offset;
    }
    if (this._endNode === node && this._endOffset > offset) {
      this._endNode = rest;
      this._endOffset -= offset;
    }
    if (this._startNode === parent && this._startOffset === index + 1) this._startOffset++;
    if (this._endNode === parent && this._endOffset === index + 1) this._endOffset++;
  }

  _joined(current, node, length, index) {
    if (this._startNode === current) {
      this._startNode = node;
      this._startOffset += length;
    }
    if (this._endNode === current) {
      this._endNode = node;
      this._endOffset += length;
    }
    if (this._startNode === current.parentNode && this._startOffset === index) {
      this._startNode = node;
      this._startOffset = length;
    }
    if (this._endNode === current.parentNode && this._endOffset === index) {
      this._endNode = node;
      this._endOffset = length;
    }
  }
}

for (const [name, value] of [["START_TO_START", 0], ["START_TO_END", 1], ["END_TO_END", 2], ["END_TO_START", 3]]) {
  Object.defineProperty(Range.prototype, name, { value, enumerable: true });
}

function parentOf(node) {
  checkNode(node, "the node");
  if (!node.parentNode) throw domError("InvalidNodeTypeError", "the node has no parent");
  return node.parentNode;
}

/** A new live range, collapsed at the start of the root. */
export function createRange() {
  return new Range();
}

let rootNode = null;

/** Makes `node` the root of the window's tree. */
/**
 * Defines `@keyframes name` as CSS would: `{ from: { opacity: 0 }, "50%": {...}, to: {...} }`,
 * with selectors such as `"0%, 100%"` too. Style objects name it in `animation` or
 * `animationName`. Defining a name again replaces its rule; `null` removes it.
 */
export function defineKeyframes(name, frames) {
  for (const selector of Object.keys(frames ?? {})) {
    let css = "";
    const declarations = frames[selector];
    for (const property of Object.keys(declarations)) {
      const value = declarations[property];
      if (value === null || value === undefined || value === "") continue;
      css += cssName(property) + ":" + cssValue(property, value) + ";";
    }
    for (const part of selector.split(",")) {
      const text = part.trim().toLowerCase();
      const offset = text === "from" ? 0 : text === "to" ? 1 : parseFloat(text) / 100;
      if (!(offset >= 0 && offset <= 1)) throw new Error(`@silkui/core: bad keyframe selector '${part}'`);
      native.keyframe(offset, css);
    }
  }
  native.keyframes(String(name));
}

export function mount(node) {
  if (rootNode) clearAdoptedSheets();
  rootNode = node;
  native.root(node.nodeId);
  syncAdoptedSheets();
  return node;
}

export function root() {
  return rootNode;
}

// The live regions `announce` speaks through, one per politeness, made on first use.
const regions = Object.create(null);
// A box screen readers read and nothing shows, as the web's visually hidden pattern.
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

/**
 * Has screen readers say `message` without showing it, as a toast or a "Saved" would. Polite
 * messages wait for the reader to finish; `{ politeness: "assertive" }` interrupts it. The
 * same message twice is said twice. Nothing happens before `mount`.
 */
export function announce(message, { politeness = "polite" } = {}) {
  if (!rootNode) return;
  const key = politeness === "assertive" ? "assertive" : "polite";
  let region = regions[key];
  if (!region || region.parentNode !== rootNode) {
    region = regions[key] = createBox(VISUALLY_HIDDEN);
    region.setAttribute("aria-live", key);
    region.setAttribute("aria-atomic", "true");
    rootNode.appendChild(region);
  }
  // A region announces changes, not what it holds when it appears, so the text waits a
  // moment; each message is a node of its own so a repeat is a change too.
  setTimeout(() => {
    if (region.parentNode !== rootNode) return;
    for (const child of region.childNodes.slice()) child.destroy();
    const text = createText(String(message));
    region.appendChild(text);
    setTimeout(() => {
      if (text.parentNode === region) text.destroy();
    }, ANNOUNCEMENT_LIFETIME);
  }, ANNOUNCEMENT_DELAY);
}

const ANNOUNCEMENT_DELAY = 100;
const ANNOUNCEMENT_LIFETIME = 7000;

/** The node with tree id `id`, for hosts and tools. */
export function nodeById(id) {
  return nodes.get(id) ?? null;
}

// The option bits of `__ui.markdown`.
const MARKDOWN_FLAGS = { tables: 1, strikethrough: 2, taskLists: 4, autolinkLiterals: 8, footnotes: 16, frontmatter: 32, alerts: 64 };
const GFM = 1 | 2 | 4 | 8;

/**
 * The syntax tree of Markdown `text`, in the shape of mdast (what remark gives): plain
 * objects with `type` and `children`. CommonMark, with GitHub's tables, strikethrough,
 * task lists and autolinks unless `gfm` is false. `footnotes`, `frontmatter` and
 * `alerts` (`> [!NOTE]`, a node of type `alert` with a `kind`) turn those on.
 */
export function parseMarkdown(text, options = {}) {
  let flags = options.gfm === false ? 0 : GFM;
  for (const name in MARKDOWN_FLAGS) {
    if (options[name] === true) flags |= MARKDOWN_FLAGS[name];
    else if (options[name] === false) flags &= ~MARKDOWN_FLAGS[name];
  }
  return JSON.parse(native.markdown(String(text), flags));
}

let errorHandler = null;
let pendingError = null;

/**
 * What happens to an exception a listener throws. As on the web, it does not stop the
 * dispatch. Without a handler, the host reports the first one after the input is handled.
 */
export function setErrorHandler(handler) {
  errorHandler = handler;
}

function reportError(error) {
  if (errorHandler) errorHandler(error);
  else pendingError ??= { error };
}

/** An event of the tree, with the members of the DOM event it corresponds to. */
export class Event {
  constructor(type, target) {
    this.type = type;
    this.target = target;
    this.currentTarget = null;
    this.eventPhase = 0;
    this.bubbles = !NO_BUBBLE.has(type);
    this.cancelable = CANCELABLE.has(type);
    this.defaultPrevented = false;
    this._stopped = false;
    this._immediate = false;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stopped = true;
  }

  stopImmediatePropagation() {
    this._stopped = true;
    this._immediate = true;
  }

  /** The nodes the event passes, target first. */
  composedPath() {
    const path = [];
    for (let node = this.target; node; node = node.parentNode) path.push(node);
    return path;
  }
}

// The pointers down or hovering, by `pointerId`: their buttons and the node holding their
// capture.
const pointers = new Map();

function domError(name, message) {
  const DOMExceptionClass = globalThis.DOMException;
  if (DOMExceptionClass) return new DOMExceptionClass(message, name);
  const error = new Error(message);
  error.name = name;
  return error;
}

const POINTER_TYPES = ["mouse", "pen", "touch"];
// DOM `buttons` bits by `button`: primary 1, secondary 2, auxiliary 4, back 8, forward 16.
const BUTTON_BITS = [1, 4, 2, 8, 16];

function isPointerKind(kind) {
  return kind <= 5 || kind === 14 || kind === 28 || kind === 29;
}

// The fingers down, by `identifier`: the `Touch` each last reported.
const touches = new Map();

function touchList(list) {
  list.item = (index) => list[index] ?? null;
  return list;
}

// A touch record as DOM `TouchEvent`: the finger it is about is `changedTouches[0]`, and it
// goes to the node the finger went down on. No host reports contact size or force: a touch is
// 1 by 1 pixel, as its pointer is, with force 0.
function fillTouch(event, kind, a, b, bits, d) {
  const identifier = Math.floor(bits / 256);
  const touch = {
    identifier,
    target: event.target,
    clientX: a,
    clientY: b,
    pageX: a,
    pageY: b,
    screenX: a,
    screenY: b,
    radiusX: 0.5,
    radiusY: 0.5,
    rotationAngle: 0,
    force: 0,
  };
  const start = touches.get(identifier);
  if (start) touch.target = start.target;
  if (kind === TOUCH_START || kind === TOUCH_START + 1) touches.set(identifier, touch);
  else touches.delete(identifier);
  event.cancelable = d === 1;
  event.changedTouches = touchList([touch]);
  event.touches = touchList([...touches.values()]);
  event.targetTouches = touchList([...touches.values()].filter((t) => t.target === event.target));
}

// The members of DOM `PointerEvent` the record carries (see ui-js-calls `pointerBits`), and the
// spec defaults for what no host reports: pressure 0.5 while a button is down, 0 otherwise, and
// a contact of 1 by 1 pixel with no tilt.
function fillPointer(event, kind, bits, d) {
  const pointerId = Math.floor(bits / 256);
  const pointerType = POINTER_TYPES[Math.floor(bits / 16) % 4] ?? "mouse";
  const isPrimary = Math.floor(bits / 64) % 2 === 1;
  let pointer = pointers.get(pointerId);
  if (!pointer) {
    pointer = { buttons: 0, capture: null, primary: isPrimary, mute: false };
    // A click comes after its pointer lifted: it leaves no pointer behind.
    if (kind !== 2) pointers.set(pointerId, pointer);
  }
  if (kind === 0) pointer.buttons |= BUTTON_BITS[d] ?? 0;
  else if (kind === 1) pointer.buttons &= ~(BUTTON_BITS[d] ?? 0);
  event.pointerId = pointerId;
  event.pointerType = pointerType;
  event.isPrimary = isPrimary;
  event.buttons = pointer.buttons;
  event.pressure = pointer.buttons ? 0.5 : 0;
  event.tangentialPressure = 0;
  event.tiltX = 0;
  event.tiltY = 0;
  event.twist = 0;
  event.altitudeAngle = Math.PI / 2;
  event.azimuthAngle = 0;
  event.width = 1;
  event.height = 1;
  if (kind !== 0 && kind !== 1 && kind !== 2) event.button = kind === 3 ? -1 : 0;
  const coalesced = kind === 3 ? [event] : [];
  event.getCoalescedEvents = () => coalesced;
  event.getPredictedEvents = () => [];
  // A pointer that lifted, or a touch that left, is gone; the mouse stays.
  if ((kind === 1 && !pointer.buttons) || kind === 14) {
    pointer.capture = null;
    if (pointerType !== "mouse") pointers.delete(pointerId);
  }
}

function fill(event, kind, a, b, modifiers, d, e, first, second, third, fourth) {
  if (kind >= TOUCH_START) {
    fillTouch(event, kind, a, b, modifiers, d);
    event.shiftKey = (modifiers & 1) !== 0;
    event.ctrlKey = (modifiers & 2) !== 0;
    event.altKey = (modifiers & 4) !== 0;
    event.metaKey = (modifiers & 8) !== 0;
    return;
  }
  if (kind <= 6 || kind === 14 || kind === 28 || kind === 29) {
    event.clientX = event.x = a;
    event.clientY = event.y = b;
  }
  if (isPointerKind(kind)) fillPointer(event, kind, modifiers, d);
  if (kind === 16) for (const pointer of pointers.values()) if (pointer.capture === event.target) pointer.capture = null;
  if (kind <= 8 || kind === 14 || kind === 28 || kind === 29) {
    event.shiftKey = (modifiers & 1) !== 0;
    event.ctrlKey = (modifiers & 2) !== 0;
    event.altKey = (modifiers & 4) !== 0;
    event.metaKey = (modifiers & 8) !== 0;
  }
  if (kind <= 2) {
    event.button = d;
    event.detail = e;
  } else if (kind === 6) {
    event.deltaX = d;
    event.deltaY = e;
  } else if (kind === 7 || kind === 8) {
    event.key = first;
    event.code = second;
    event.repeat = d !== 0;
  } else if (kind === 11) {
    event.value = first;
    event.inputType = second;
    event.target._changed?.(first, a, b, third, fourth, d);
    if (event.target instanceof RichInput) event.document = event.target.document;
  } else if (kind === 12) {
    event.scrollLeft = a;
    event.scrollTop = b;
  } else if (kind === 13) {
    event.bounds = { x: a, y: b, width: d, height: e };
  } else if (kind >= 19 && kind <= 22) {
    event.propertyName = first;
    event.elapsedTime = a;
    event.pseudoElement = second ?? "";
  } else if (kind === 27) {
    event.target._selected?.(a, b, d);
    event.selectionStart = event.target.selectionStart;
    event.selectionEnd = event.target.selectionEnd;
  } else if (kind >= 23) {
    event.animationName = first;
    event.elapsedTime = a;
    event.pseudoElement = second ?? "";
  }
}

/**
 * Runs `event` through the tree as the DOM does: the capture phase from the root down, the
 * target, then the bubble phase back up for events that bubble. Returns false when a
 * listener prevented the default.
 */
export function dispatchEvent(event) {
  const path = [];
  for (let node = event.target; node; node = node.parentNode) path.push(node);
  for (let i = path.length - 1; i > 0 && !event._stopped; i--) {
    event.eventPhase = 1;
    event.currentTarget = path[i];
    path[i]._run(event, true);
  }
  if (!event._stopped) {
    event.eventPhase = 2;
    event.currentTarget = path[0];
    path[0]._run(event, true);
    if (!event._stopped) path[0]._run(event, false);
  }
  if (event.bubbles) {
    for (let i = 1; i < path.length && !event._stopped; i++) {
      event.eventPhase = 3;
      event.currentTarget = path[i];
      path[i]._run(event, false);
    }
  }
  event.eventPhase = 0;
  event.currentTarget = null;
  return !event.defaultPrevented;
}

// An event the app made, from the runtime's `Event` class: its target and phase become
// fields the dispatcher sets, and its stop methods record what the dispatcher reads.
function adopt(event, target) {
  if (!("_stopped" in event)) {
    let stopped = false;
    let immediate = false;
    const stop = event.stopPropagation;
    const stopNow = event.stopImmediatePropagation;
    Object.defineProperties(event, {
      _stopped: { get: () => stopped || event.cancelBubble === true, configurable: true },
      _immediate: { get: () => immediate, configurable: true },
      stopPropagation: { value() { stopped = true; stop?.call(event); }, configurable: true },
      stopImmediatePropagation: { value() { stopped = immediate = true; stopNow?.call(event); }, configurable: true },
    });
  }
  for (const [name, value] of [["target", target], ["currentTarget", null], ["eventPhase", 0]]) {
    if (Object.getOwnPropertyDescriptor(event, name)?.writable) event[name] = value;
    else Object.defineProperty(event, name, { value, writable: true, configurable: true });
  }
  return event;
}

// The compatibility mouse event of `type` that follows pointer event `from`.
function mouseEvent(type, from, target) {
  const event = new Event(type, target);
  for (const name of ["clientX", "clientY", "x", "y", "button", "buttons", "detail", "shiftKey", "ctrlKey", "altKey", "metaKey"]) {
    event[name] = from[name];
  }
  if (type === "mousemove") event.button = 0;
  return event;
}

// Mouse events after a pointer event of a mouse or pen, as the web sends them: a prevented
// `pointerdown` mutes `mousedown`, `mousemove` and `mouseup` until the pointer lifts.
function compatMouse(kind, event, target) {
  const type = MOUSE_OF.get(event.type);
  if (!type) return;
  const pointer = pointers.get(event.pointerId);
  if (kind === 0 && event.defaultPrevented && pointer) pointer.mute = true;
  const muted = pointer?.mute && (kind === 0 || kind === 1 || kind === 3);
  if (kind === 1 && pointer) pointer.mute = false;
  if (!muted && event.isPrimary) dispatchEvent(mouseEvent(type, event, target));
}

// The finger whose prevented `pointerdown` mutes its tap's mouse events.
let mutedTap = null;

// A tap's mouse events come just before its click, as on the web.
function compatTap(click, target) {
  if (mutedTap === click.pointerId) return;
  for (const type of ["mousemove", "mousedown", "mouseup"]) {
    const event = mouseEvent(type, click, target);
    event.buttons = type === "mousedown" ? 1 : 0;
    dispatchEvent(event);
  }
}

// The host calls this for every event record, before the tree runs the default action.
native.dispatch = function (kind, id, a, b, modifiers, d, e, first, second, third, fourth) {
  const target = nodes.get(id);
  if (!target) return false;
  const event = new Event(TYPES[kind], target);
  fill(event, kind, a, b, modifiers, d, e, first, second, third, fourth);
  if (kind === CLICK && event.pointerType === "touch" && event.isPrimary) compatTap(event, target);
  dispatchEvent(event);
  if (kind === CLICK && !event.defaultPrevented) follow(target);
  if (kind !== CLICK && isPointerKind(kind)) {
    if (event.pointerType !== "touch") compatMouse(kind, event, target);
    // A finger's defaults (pan, focus, the tap's click) follow its touch events, not its
    // pointer events, as on the web.
    else {
      if (kind === 0 && event.isPrimary) mutedTap = event.defaultPrevented ? event.pointerId : null;
      return false;
    }
  }
  return event.defaultPrevented;
};

// The default action of a click: the nearest link around the target opens.
function follow(target) {
  for (let node = target; node; node = node.parentNode) {
    if (node._href) {
      try {
        globalThis.open(node._href);
      } catch (error) {
        reportError(error);
      }
      return;
    }
  }
}

// The host calls this before it replaces the realm, on a reload: every node goes, so the
// next realm starts on an empty tree.
native.unload = function () {
  importedSheets.clear();
  for (const node of [...nodes.values()]) if (!node.parentNode && nodes.has(node.nodeId)) node.destroy();
  rootNode = null;
};

// The host calls this after it handled an input: an exception a listener threw surfaces here.
native.takeError = function () {
  if (!pendingError) return;
  const { error } = pendingError;
  pendingError = null;
  throw error;
};

// The desktop around the window: files dragged in from other apps, notifications, the tray
// and global shortcuts. The host serves `__ui.shell` calls after the code that made them has
// run and answers through `__ui.shellAnswer`; desktop events arrive through `__ui.shellEvent`.

const shellCalls = new Map();
let nextShellCall = 0;

function shellCall(op, fields) {
  const call = ++nextShellCall;
  return new Promise((resolve) => {
    shellCalls.set(call, resolve);
    native.shell(call, op, fields.join("\x1f"));
  });
}

native.shellAnswer = function (call, value) {
  const resolve = shellCalls.get(call);
  if (!resolve) return;
  shellCalls.delete(call);
  resolve(value);
};

/** A file dragged in from the desktop, as the web's `File`, with its `path` on disk. */
export class DroppedFile {
  constructor(path) {
    this.path = path;
    this.name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
    this.type = "";
  }
}

/**
 * What a file drag carries, as the web's `DataTransfer`: `types` is `["Files"]` while files
 * are over the window, and `files` lists them in `drop`, as on the web.
 */
export class DataTransfer {
  constructor(paths) {
    this.files = paths.map((path) => new DroppedFile(path));
    this.items = this.files.map((file) => ({ kind: "file", type: "", getAsFile: () => file }));
    this.types = ["Files"];
    this.dropEffect = "copy";
    this.effectAllowed = "copy";
  }

  getData() {
    return "";
  }
}

let dragTarget = null;

function dragEvent(type, target, x, y, paths) {
  const event = new Event(type, target);
  event.clientX = event.x = x;
  event.clientY = event.y = y;
  event.dataTransfer = new DataTransfer(paths);
  dispatchEvent(event);
}

// As the web: `dragenter` on the node now under the files, `dragleave` on the one before,
// then `dragover` on the current one.
function dragTo(target, x, y) {
  if (target !== dragTarget) {
    const before = dragTarget;
    dragTarget = target;
    if (target) dragEvent("dragenter", target, x, y, []);
    if (before) dragEvent("dragleave", before, x, y, []);
  }
  if (target) dragEvent("dragover", target, x, y, []);
}

let trayMenu = new Map();
let trayClick = null;
const shortcuts = new Map();
const shortcutIds = new Map();
let nextShortcut = 0;
const notifications = new Map();

native.shellEvent = function (kind, a, x, y, text) {
  if (kind <= 3) {
    const target = nodes.get(a) ?? rootNode;
    if (kind === 2) {
      const before = dragTarget;
      dragTarget = null;
      if (before) dragEvent("dragleave", before, x, y, []);
    } else if (kind === 3) {
      if (target !== dragTarget) dragTo(target, x, y);
      dragTarget = null;
      if (target) dragEvent("drop", target, x, y, text ? text.split("\n") : []);
    } else {
      dragTo(target, x, y);
    }
  } else if (kind === 4) {
    shortcuts.get(a)?.();
  } else if (kind === 5) {
    trayClick?.({ button: a });
  } else if (kind === 6) {
    trayMenu.get(a)?.();
  } else if (kind === 7) {
    const notification = notifications.get(a);
    if (!notification) return;
    notifications.delete(a);
    notification._fire("click");
  }
};

// Notifications nobody clicked are forgotten after this many newer ones.
const NOTIFICATIONS_KEPT = 64;

/**
 * A desktop notification, as the web's: `new Notification(title, { body })`, with `onclick`
 * or a `click` listener. Permission is always granted.
 */
export class Notification {
  static permission = "granted";

  static requestPermission(callback) {
    callback?.("granted");
    return Promise.resolve("granted");
  }

  #listeners = new Map();

  constructor(title, options = {}) {
    this.title = String(title);
    this.body = String(options.body ?? "");
    this.tag = String(options.tag ?? "");
    this.data = options.data ?? null;
    this.onclick = this.onshow = this.onerror = this.onclose = null;
    shellCall(0, [this.title, this.body]).then((id) => {
      if (!id) return this._fire("error");
      notifications.set(id, this);
      if (notifications.size > NOTIFICATIONS_KEPT) notifications.delete(notifications.keys().next().value);
      this._fire("show");
    });
  }

  /** The system keeps the notification until the user dismisses it. */
  close() {}

  addEventListener(type, listener) {
    let list = this.#listeners.get(type);
    if (!list) this.#listeners.set(type, (list = []));
    if (!list.includes(listener)) list.push(listener);
  }

  removeEventListener(type, listener) {
    const list = this.#listeners.get(type);
    const index = list ? list.indexOf(listener) : -1;
    if (index >= 0) list.splice(index, 1);
  }

  _fire(type) {
    const event = { type, target: this, currentTarget: this };
    const handler = this["on" + type];
    try {
      if (typeof handler === "function") handler.call(this, event);
      for (const listener of (this.#listeners.get(type) ?? []).slice()) listener.call(this, event);
    } catch (error) {
      reportError(error);
    }
  }
}

globalThis.Notification ??= Notification;
globalThis.AbstractRange ??= AbstractRange;
globalThis.StaticRange ??= StaticRange;
globalThis.Range ??= Range;
globalThis.DocumentFragment ??= DocumentFragment;

function hex(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
  return text;
}

function packMenu(items, lines) {
  for (const item of items) {
    if (item.type === "separator") lines.push("S");
    else if (item.submenu) {
      lines.push("B" + String(item.label ?? "").replace(/\n/g, " "));
      packMenu(item.submenu, lines);
      lines.push("E");
    } else {
      const action = trayMenu.size + 1;
      trayMenu.set(action, typeof item.click === "function" ? item.click : () => {});
      const label = String(item.label ?? "").replace(/\n/g, " ");
      lines.push("A" + action + "," + (item.enabled === false ? 0 : 1) + "," + (item.checked ? 1 : 0) + "," + label);
    }
  }
}

/**
 * Shows an icon in the system tray (the macOS menu bar, the Windows notification area, a
 * StatusNotifierItem on Linux). `icon` is RGBA pixels, as an `ImageData`: `{ width, height,
 * data }`; macOS draws a `template` icon from its alpha in the menu bar's colours. `menu`
 * items are `{ label, click, enabled, checked }`, `{ type: "separator" }` or `{ label,
 * submenu }`. With no menu, `onClick({ button })` runs when the icon is clicked. Calling it
 * again replaces the tray. Resolves to whether the system shows it.
 */
export function setTray({ icon, tooltip = "", template = false, menu = [], onClick = null }) {
  if (!icon || !(icon.width > 0) || !(icon.height > 0) || icon.data?.length !== icon.width * icon.height * 4) {
    throw new TypeError("setTray needs an icon of RGBA pixels: { width, height, data }");
  }
  trayMenu = new Map();
  trayClick = typeof onClick === "function" ? onClick : null;
  const lines = [];
  packMenu(menu, lines);
  const fields = [String(tooltip), icon.width, icon.height, template ? 1 : 0, hex(icon.data), lines.join("\n")];
  return shellCall(1, fields).then((shown) => shown === 1);
}

/** Takes the tray icon away. */
export function removeTray() {
  trayMenu = new Map();
  trayClick = null;
  shellCall(2, []);
}

const MODIFIERS = { shift: 1, ctrl: 2, control: 2, alt: 4, option: 4, meta: 8, cmd: 8, command: 8, super: 8, mod: 16, cmdorctrl: 16, commandorcontrol: 16 };
const KEY_NAMES = {
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", esc: "Escape", return: "Enter",
  space: " ", plus: "Equal", "=": "Equal", "-": "Minus", ",": "Comma", ".": "Period", "/": "Slash",
  ";": "Semicolon", "'": "Quote", "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash", "`": "Backquote",
};

// "Mod+Shift+K" as the UI Events `code` of the key and the modifier bits; `Mod` (also
// `CmdOrCtrl`) is Command on macOS and Control elsewhere.
function parseShortcut(accelerator) {
  const parts = String(accelerator).split("+").map((part) => part.trim()).filter(Boolean);
  let bits = 0;
  let code = "";
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (modifier !== undefined) {
      bits |= modifier;
      continue;
    }
    const named = KEY_NAMES[part.toLowerCase()] ?? part;
    if (named === " ") code = "Space";
    else if (/^[a-z]$/i.test(named)) code = "Key" + named.toUpperCase();
    else if (/^[0-9]$/.test(named)) code = "Digit" + named;
    else code = named[0].toUpperCase() + named.slice(1);
  }
  if (!code) throw new TypeError("'" + accelerator + "' names no key");
  return { code, bits };
}

/**
 * Runs `callback` when the keys of `accelerator` are pressed, whichever app has focus:
 * `"Mod+Shift+K"`, where `Mod` is Command on macOS and Control elsewhere, and the key is a
 * letter, a digit, a UI Events `code` (`"F5"`, `"ArrowUp"`, `"Slash"`) or a name such as
 * `Space` or `Esc`. Registering it again replaces the callback. Resolves to whether the
 * system took it: another app may hold it, and Wayland has no global shortcuts.
 */
export function registerShortcut(accelerator, callback) {
  const { code, bits } = parseShortcut(accelerator);
  const key = code + "+" + bits;
  let id = shortcutIds.get(key);
  if (id === undefined) shortcutIds.set(key, (id = ++nextShortcut));
  shortcuts.set(id, callback);
  return shellCall(3, [id, code, bits]).then((held) => held === 1);
}

/** Stops the shortcut of `accelerator`. */
export function unregisterShortcut(accelerator) {
  const { code, bits } = parseShortcut(accelerator);
  const id = shortcutIds.get(code + "+" + bits);
  if (id === undefined) return;
  shortcutIds.delete(code + "+" + bits);
  shortcuts.delete(id);
  shellCall(4, [id]);
}

/**
 * The app's memory in bytes, as the system shows it to users: `phys_footprint` on macOS
 * (Activity Monitor's "Memory"), `Pss` on Linux and `PrivateUsage` on Windows. `processes` is
 * how many processes `footprint` counts: the host is one. In the browser it is the wasm
 * tree's linear memory, without the page's JavaScript heap. `null` when there is no answer.
 */
export function memoryUsage() {
  const footprint = native.memoryUsage?.() ?? 0;
  return footprint > 0 ? { footprint, processes: 1 } : null;
}

let frameStatsSince = 0;

/**
 * The frames the window put on screen since the last call (since the app started, the first
 * time). `frames` counts presents, which `requestAnimationFrame` cannot: a callback can run
 * for a frame the GPU never drew. `dropped` counts painted frames a newer one replaced before
 * the GPU took them; `p50` to `max` are milliseconds between presents. `null` where the host
 * has no window of its own (a browser build).
 */
export function frameStats() {
  if (!native.frameStats) return null;
  const now = performance.now();
  const seconds = (now - frameStatsSince) / 1000;
  frameStatsSince = now;
  const frames = native.frameStats(0);
  return {
    frames,
    fps: seconds > 0 ? frames / seconds : 0,
    dropped: native.frameStats(1),
    p50: native.frameStats(2),
    p95: native.frameStats(3),
    p99: native.frameStats(4),
    max: native.frameStats(5),
  };
}
