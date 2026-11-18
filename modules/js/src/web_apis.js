// The web APIs a ui-js realm has beyond the prelude's: Blob, base64, text encoding, crypto random
// values, events (and unhandledrejection on the global object), matchMedia, user timing, setImmediate, idle callbacks and the console's timers. The
// prelude evaluates this on the first use of one of them, so realms that use none start as
// fast as before. It is a function of `__ui` and the prelude's shared console state, and
// returns the APIs by their global names. Edit it, then run `silk task embed-assets`.
(function (native, shared) {
  const entries = [];
  const entry = (name, entryType, startTime, duration, detail) => ({ name, entryType, startTime, duration, detail: detail ?? null, toJSON() { return { ...this }; } });
  const markTime = (name) => {
    if (typeof name === "number") return name;
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].entryType === "mark" && entries[i].name === name) return entries[i].startTime;
    throw new SyntaxError("there is no mark named '" + name + "'");
  };
  const clear = (type, name) => {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].entryType === type && (name === undefined || entries[i].name === name)) entries.splice(i, 1);
  };
  const performance = {
    mark(name, options) {
      const mark = entry(String(name), "mark", options?.startTime ?? native.now(), 0, options?.detail);
      entries.push(mark);
      return mark;
    },
    measure(name, start, end) {
      const options = typeof start === "object" && start !== null ? start : { start, end };
      const to = options.end !== undefined ? markTime(options.end) : options.duration !== undefined ? markTime(options.start ?? 0) + options.duration : native.now();
      const from = options.start !== undefined ? markTime(options.start) : options.duration !== undefined ? to - options.duration : 0;
      const measure = entry(String(name), "measure", from, to - from, options.detail);
      entries.push(measure);
      return measure;
    },
    getEntries: () => entries.slice(),
    getEntriesByType: (type) => entries.filter((item) => item.entryType === type),
    getEntriesByName: (name, type) => entries.filter((item) => item.name === name && (type === undefined || item.entryType === type)),
    clearMarks: (name) => clear("mark", name),
    clearMeasures: (name) => clear("measure", name),
  };

  // As Node's: after the promise jobs and the timers already due.
  const immediates = new Map();
  let nextImmediate = 0;
  const setImmediate = (callback, ...args) => {
    if (typeof callback !== "function") throw new TypeError("setImmediate needs a function");
    const id = ++nextImmediate;
    immediates.set(id, setTimeout(() => {
      immediates.delete(id);
      callback(...args);
    }, 0));
    return id;
  };
  const clearImmediate = (id) => {
    clearTimeout(immediates.get(id));
    immediates.delete(id);
  };

  // Idle callbacks run from a timer, with a 50 ms budget as the web gives at most.
  const requestIdleCallback = (callback) => {
    if (typeof callback !== "function") throw new TypeError("requestIdleCallback needs a function");
    return setTimeout(() => {
      const start = native.now();
      callback({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (native.now() - start)) });
    }, 1);
  };
  const cancelIdleCallback = (id) => clearTimeout(id);

  // The console's counters, timers and groups. `shared.groups` is how deep `console.group`
  // nests, which the prelude's log lines indent by.
  const timings = new Map();
  const counts = new Map();
  const console = {
    dir: (value) => native.log(1, shared.show(value, 1)),
    table: (...values) => shared.log(1)(...values),
    group: (...values) => {
      if (values.length) shared.log(1)(...values);
      shared.groups++;
    },
    groupCollapsed: (...values) => console.group(...values),
    groupEnd: () => {
      if (shared.groups > 0) shared.groups--;
    },
    time(label = "default") {
      if (timings.has(label)) return native.log(2, "Timer '" + label + "' already exists");
      timings.set(label, native.now());
    },
    timeLog(label = "default", ...values) {
      const start = timings.get(label);
      if (start === undefined) return native.log(2, "Timer '" + label + "' does not exist");
      native.log(1, [label + ": " + (native.now() - start).toFixed(3) + " ms", ...values.map((value) => shared.show(value, 0))].join(" "));
    },
    timeEnd(label = "default") {
      console.timeLog(label);
      timings.delete(label);
    },
    count(label = "default") {
      const count = (counts.get(label) ?? 0) + 1;
      counts.set(label, count);
      native.log(1, label + ": " + count);
    },
    countReset(label = "default") {
      counts.delete(label);
    },
  };

  const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const invalid = (what) => {
    const error = new Error(what);
    error.name = "InvalidCharacterError";
    return error;
  };
  const btoa = (data) => {
    data = String(data);
    let out = "";
    for (let i = 0; i < data.length; i += 3) {
      const a = data.charCodeAt(i), b = data.charCodeAt(i + 1), c = data.charCodeAt(i + 2);
      if (a > 255 || b > 255 || c > 255) throw invalid("btoa takes only characters up to U+00FF");
      out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4 || 0)] +
        (i + 1 < data.length ? BASE64[((b & 15) << 2) | (c >> 6 || 0)] : "=") + (i + 2 < data.length ? BASE64[c & 63] : "=");
    }
    return out;
  };
  const atob = (data) => {
    data = String(data).replace(/[\t\n\f\r ]/g, "");
    if (data.length % 4 === 0) data = data.replace(/==?$/, "");
    if (data.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(data)) throw invalid("atob takes only base64 text");
    let out = "";
    let bits = 0, count = 0;
    for (let i = 0; i < data.length; i++) {
      bits = (bits << 6) | BASE64.indexOf(data[i]);
      count += 6;
      if (count >= 8) {
        count -= 8;
        out += String.fromCharCode((bits >> count) & 255);
      }
    }
    return out;
  };

  class TextEncoder {
    get encoding() { return "utf-8"; }
    encode(input = "") {
      const text = String(input);
      const bytes = new Uint8Array(text.length * 3);
      return bytes.slice(0, this.encodeInto(text, bytes).written);
    }
    encodeInto(input, bytes) {
      const text = String(input);
      let read = 0, written = 0;
      while (read < text.length) {
        let code = text.codePointAt(read);
        const units = code > 0xffff ? 2 : 1;
        if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
        const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
        if (written + size > bytes.length) break;
        if (size === 1) bytes[written] = code;
        else {
          bytes[written] = (0xf00 >> size) | (code >> (6 * (size - 1)));
          for (let i = 1; i < size; i++) bytes[written + i] = 0x80 | ((code >> (6 * (size - 1 - i))) & 63);
        }
        read += units;
        written += size;
      }
      return { read, written };
    }
  }
  const LABELS = { "utf-8": "utf-8", utf8: "utf-8", "unicode-1-1-utf-8": "utf-8", "utf-16le": "utf-16le", "utf-16": "utf-16le", "utf-16be": "utf-16be", latin1: "windows-1252", "iso-8859-1": "windows-1252", ascii: "windows-1252", "us-ascii": "windows-1252", "windows-1252": "windows-1252" };
  class TextDecoder {
    #encoding;
    #fatal;
    #ignoreBOM;
    #pending = [];
    constructor(label = "utf-8", options) {
      const encoding = LABELS[String(label).trim().toLowerCase()];
      if (!encoding) throw new RangeError("TextDecoder has no encoding '" + label + "'");
      this.#encoding = encoding;
      this.#fatal = !!options?.fatal;
      this.#ignoreBOM = !!options?.ignoreBOM;
    }
    get encoding() { return this.#encoding; }
    get fatal() { return this.#fatal; }
    get ignoreBOM() { return this.#ignoreBOM; }
    decode(input, options) {
      let bytes = input === undefined ? new Uint8Array(0) : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
      if (this.#pending.length) bytes = Uint8Array.from([...this.#pending, ...bytes]);
      const stream = !!options?.stream;
      let text = "", i = 0;
      const fail = () => {
        if (this.#fatal) throw new TypeError("the bytes are not valid " + this.#encoding);
        return "\ufffd";
      };
      if (this.#encoding === "windows-1252") {
        for (; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
      } else if (this.#encoding !== "utf-8") {
        const little = this.#encoding === "utf-16le";
        for (; i + 1 < bytes.length; i += 2) text += String.fromCharCode(little ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
        if (!this.#ignoreBOM && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      } else {
        // The WHATWG decoder: each invalid sequence becomes one U+FFFD, or throws when fatal.
        let codes = [], code = 0, need = 0, seen = 0, lower = 0x80, upper = 0xbf, start = 0;
        const flush = () => {
          text += String.fromCodePoint(...codes);
          codes = [];
        };
        const bad = () => codes.push(fail().codePointAt(0));
        for (; i < bytes.length; i++) {
          const byte = bytes[i];
          if (need === 0) {
            start = i;
            if (byte < 0x80) codes.push(byte);
            else if (byte >= 0xc2 && byte <= 0xdf) {
              need = 1;
              code = byte & 0x1f;
            } else if (byte >= 0xe0 && byte <= 0xef) {
              need = 2;
              code = byte & 0xf;
              if (byte === 0xe0) lower = 0xa0;
              if (byte === 0xed) upper = 0x9f;
            } else if (byte >= 0xf0 && byte <= 0xf4) {
              need = 3;
              code = byte & 7;
              if (byte === 0xf0) lower = 0x90;
              if (byte === 0xf4) upper = 0x8f;
            } else bad();
          } else if (byte < lower || byte > upper) {
            need = seen = 0;
            lower = 0x80;
            upper = 0xbf;
            bad();
            i--;
          } else {
            lower = 0x80;
            upper = 0xbf;
            code = (code << 6) | (byte & 0x3f);
            if (++seen === need) {
              codes.push(code);
              need = seen = 0;
            }
          }
          if (codes.length >= 4096) flush();
        }
        if (need !== 0) {
          if (stream) i = start;
          else bad();
        }
        flush();
        if (!this.#ignoreBOM && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      }
      this.#pending = stream ? Array.from(bytes.subarray(i)) : [];
      if (!stream && i < bytes.length) text += fail();
      return text;
    }
  }

  // Secure random numbers from the operating system: `native.random()` is 32 random bits.
  const randomFill = (array) => {
    if (!/^(Big)?(Ui|I)nt(8|16|32|64)(Clamped)?Array$/.test(array?.[Symbol.toStringTag])) throw new TypeError("getRandomValues takes an integer typed array");
    if (array.byteLength > 65536) throw new RangeError("getRandomValues fills at most 65536 bytes");
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let i = 0; i < bytes.length; i += 4) {
      const bits = native.random();
      for (let j = 0; j < 4 && i + j < bytes.length; j++) bytes[i + j] = bits >>> (8 * j);
    }
    return array;
  };
  const crypto = {
    getRandomValues: randomFill,
    randomUUID() {
      const bytes = randomFill(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 0x40;
      bytes[8] = (bytes[8] & 63) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    },
  };

  // Events as on the web, for objects of the app's own: nodes of @silkui/core take these too.
  class Event {
    #type;
    #bubbles;
    #cancelable;
    #composed;
    #stopped = false;
    #immediate = false;
    #prevented = false;
    constructor(type, options) {
      if (arguments.length === 0) throw new TypeError("an Event needs a type");
      this.#type = String(type);
      this.#bubbles = !!options?.bubbles;
      this.#cancelable = !!options?.cancelable;
      this.#composed = !!options?.composed;
      this.target = null;
      this.currentTarget = null;
      this.eventPhase = 0;
      this.isTrusted = false;
      this.timeStamp = native.now();
    }
    get type() { return this.#type; }
    get bubbles() { return this.#bubbles; }
    get cancelable() { return this.#cancelable; }
    get composed() { return this.#composed; }
    get defaultPrevented() { return this.#prevented; }
    get cancelBubble() { return this.#stopped; }
    set cancelBubble(value) { if (value) this.#stopped = true; }
    get returnValue() { return !this.#prevented; }
    set returnValue(value) { if (!value) this.preventDefault(); }
    preventDefault() { if (this.#cancelable) this.#prevented = true; }
    stopPropagation() { this.#stopped = true; }
    stopImmediatePropagation() { this.#stopped = this.#immediate = true; }
    composedPath() { return this.target ? [this.target] : []; }
    // What a dispatcher reads: whether a listener stopped the event, and stopped it at once.
    get _stopped() { return this.#stopped; }
    get _immediate() { return this.#immediate; }
  }
  Event.NONE = 0;
  Event.CAPTURING_PHASE = 1;
  Event.AT_TARGET = 2;
  Event.BUBBLING_PHASE = 3;
  class CustomEvent extends Event {
    #detail;
    constructor(type, options) {
      super(type, options);
      this.#detail = options?.detail ?? null;
    }
    get detail() { return this.#detail; }
  }
  class PromiseRejectionEvent extends Event {
    #promise;
    #reason;
    constructor(type, options) {
      super(type, options);
      this.#promise = options?.promise;
      this.#reason = options?.reason;
    }
    get promise() { return this.#promise; }
    get reason() { return this.#reason; }
  }
  class EventTarget {
    #listeners = new Map();
    addEventListener(type, listener, options) {
      if (listener == null) return;
      const capture = options === true || !!options?.capture;
      let list = this.#listeners.get(type);
      if (!list) this.#listeners.set(type, (list = []));
      if (list.some((item) => item.listener === listener && item.capture === capture)) return;
      const entry = { listener, capture, once: !!options?.once };
      list.push(entry);
      options?.signal?.addEventListener?.("abort", () => this.removeEventListener(type, listener, capture));
    }
    removeEventListener(type, listener, options) {
      const list = this.#listeners.get(type);
      const capture = options === true || !!options?.capture;
      const index = list ? list.findIndex((item) => item.listener === listener && item.capture === capture) : -1;
      if (index >= 0) list.splice(index, 1);
    }
    dispatchEvent(event) {
      if (!(event instanceof Event)) throw new TypeError("dispatchEvent takes an Event");
      event.target = event.currentTarget = this;
      event.eventPhase = 2;
      for (const item of (this.#listeners.get(event.type) ?? []).slice()) {
        if (event._immediate) break;
        if (item.once) this.removeEventListener(event.type, item.listener, item.capture);
        try {
          if (typeof item.listener === "function") item.listener.call(this, event);
          else item.listener.handleEvent(event);
        } catch (error) {
          globalThis.reportError(error);
        }
      }
      event.currentTarget = null;
      event.eventPhase = 0;
      return !event.defaultPrevented;
    }
  }

  // matchMedia lists with change listeners: `mediaChanged` runs after the window's media
  // changed (a resize, a move to a display of another scale, a new appearance).
  const watched = new Set();
  class MediaQueryListEvent extends Event {
    #media;
    #matches;
    constructor(type, options) {
      super(type, options);
      this.#media = String(options?.media ?? "");
      this.#matches = !!options?.matches;
    }
    get media() { return this.#media; }
    get matches() { return this.#matches; }
  }
  class MediaQueryList extends EventTarget {
    #media;
    #last;
    #onchange = null;
    constructor(media) {
      super();
      this.#media = media;
      this.#last = native.matchMedia(media);
    }
    get media() { return this.#media; }
    get matches() { return native.matchMedia(this.#media); }
    get onchange() { return this.#onchange; }
    set onchange(handler) {
      if (this.#onchange) this.removeEventListener("change", this.#onchange);
      this.#onchange = typeof handler === "function" ? handler : null;
      if (this.#onchange) this.addEventListener("change", this.#onchange);
    }
    addEventListener(type, listener, options) {
      super.addEventListener(type, listener, options);
      if (type === "change" && !watched.has(this)) {
        this.#last = this.matches;
        watched.add(this);
      }
    }
    addListener(listener) { this.addEventListener("change", listener); }
    removeListener(listener) { this.removeEventListener("change", listener); }
    _check() {
      const now = this.matches;
      if (now === this.#last) return;
      this.#last = now;
      this.dispatchEvent(new MediaQueryListEvent("change", { media: this.#media, matches: now }));
    }
  }
  const matchMedia = (query) => {
    return new MediaQueryList(String(query));
  };
  const mediaChanged = () => {
    for (const list of watched) list._check();
  };

  // As the File API's Blob: immutable bytes with a MIME type. No stream().
  const blobBytes = new WeakMap();
  const partBytes = (part) => {
    if (part instanceof Blob) return blobBytes.get(part);
    if (part instanceof ArrayBuffer) return new Uint8Array(part.slice(0));
    if (ArrayBuffer.isView(part)) return new Uint8Array(part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength));
    return new TextEncoder().encode(String(part));
  };
  const blobType = (type) => {
    const value = String(type ?? "");
    return /^[\x20-\x7e]*$/.test(value) ? value.toLowerCase() : "";
  };
  class Blob {
    constructor(parts = [], options = {}) {
      if (parts === null || typeof parts !== "object" || typeof parts[Symbol.iterator] !== "function") throw new TypeError("Blob takes a sequence of parts");
      const chunks = [...parts].map(partBytes);
      const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      blobBytes.set(this, bytes);
      Object.defineProperty(this, "type", { value: blobType(options?.type), enumerable: true });
    }
    get size() {
      return blobBytes.get(this).length;
    }
    slice(start = 0, end = this.size, type = "") {
      const blob = new Blob([], { type });
      blobBytes.set(blob, blobBytes.get(this).slice(start, end));
      return blob;
    }
    async arrayBuffer() {
      return blobBytes.get(this).slice().buffer;
    }
    async bytes() {
      return blobBytes.get(this).slice();
    }
    async text() {
      return new TextDecoder().decode(blobBytes.get(this));
    }
  }
  Object.defineProperty(Blob.prototype, Symbol.toStringTag, { value: "Blob" });

  return { Blob, matchMedia, mediaChanged, MediaQueryList, MediaQueryListEvent, performance, setImmediate, clearImmediate, requestIdleCallback, cancelIdleCallback, console, atob, btoa, TextEncoder, TextDecoder, crypto, Event, CustomEvent, PromiseRejectionEvent, EventTarget };
})
