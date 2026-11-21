// `location` and `history` for an app in one window: a session history of entries in memory,
// as a page's is. There is no page to load, so a navigation to another address of the app
// changes the entry and sends `popstate`, the event routers follow.

export class PopStateEvent extends (globalThis.Event ?? class {}) {
  constructor(type, init = {}) {
    super(type, init);
    Object.defineProperty(this, "state", { value: init.state ?? null, enumerable: true });
  }
}

export class HashChangeEvent extends (globalThis.Event ?? class {}) {
  constructor(type, init = {}) {
    super(type, init);
    Object.defineProperty(this, "oldURL", { value: init.oldURL ?? "", enumerable: true });
    Object.defineProperty(this, "newURL", { value: init.newURL ?? "", enumerable: true });
  }
}

// The embedded engine has no `URL`: a small one for the parts `location` has.
class AppURL {
  constructor(text, base) {
    text = String(text);
    const match = /^([a-z][a-z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(text);
    if (match) {
      this.protocol = match[1].toLowerCase();
      this.host = match[2].toLowerCase();
      this.pathname = match[3] || "/";
      this.search = match[4] && match[4] !== "?" ? match[4] : "";
      this.hash = match[5] && match[5] !== "#" ? match[5] : "";
      return;
    }
    if (!base) throw new TypeError("'" + text + "' is not an absolute address");
    const from = new AppURL(String(base));
    Object.assign(this, { protocol: from.protocol, host: from.host, pathname: from.pathname, search: from.search, hash: "" });
    const [, path = "", search, hash] = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(text);
    if (path) {
      this.pathname = path.startsWith("/") ? path : from.pathname.replace(/[^/]*$/, "") + path;
      this.search = "";
    }
    if (search !== undefined) this.search = search === "?" ? "" : search;
    if (hash !== undefined) this.hash = hash === "#" ? "" : hash;
  }
  get hostname() { return this.host.replace(/:\d+$/, ""); }
  set hostname(value) { this.host = value + (this.port ? ":" + this.port : ""); }
  get port() { return /:(\d+)$/.exec(this.host)?.[1] ?? ""; }
  set port(value) { this.host = this.hostname + (value ? ":" + value : ""); }
  get origin() { return this.protocol + "//" + this.host; }
  get href() { return this.origin + this.pathname + this.search + this.hash; }
  toString() { return this.href; }
}
const URL = globalThis.URL ?? AppURL;

const url = Symbol("url");
const historyOf = Symbol("history");

export class Location {
  constructor(href, document) {
    this[url] = new URL(href);
    this[historyOf] = null;
    void document;
  }

  get href() { return this[url].href; }
  set href(value) { this.assign(value); }
  get origin() { return this[url].origin; }
  get protocol() { return this[url].protocol; }
  set protocol(value) { this.#with("protocol", value); }
  get host() { return this[url].host; }
  set host(value) { this.#with("host", value); }
  get hostname() { return this[url].hostname; }
  set hostname(value) { this.#with("hostname", value); }
  get port() { return this[url].port; }
  set port(value) { this.#with("port", value); }
  get pathname() { return this[url].pathname; }
  set pathname(value) { this.#with("pathname", value); }
  get search() { return this[url].search; }
  set search(value) { this.#with("search", value); }
  get hash() { return this[url].hash; }
  set hash(value) { this.#with("hash", value); }
  get ancestorOrigins() { return []; }

  #with(part, value) {
    const next = new URL(this[url].href);
    next[part] = value;
    this.assign(next.href);
  }

  assign(value) {
    this[historyOf]._navigate(new URL(String(value), this[url]), false);
  }

  replace(value) {
    this[historyOf]._navigate(new URL(String(value), this[url]), true);
  }

  reload() {
    console.warn("location.reload: a Silk UI window has no page to load again");
  }

  toString() { return this.href; }
  valueOf() { return this; }
}

export class History {
  #location;
  #window;
  #entries;
  #index = 0;

  constructor(location, windowTarget) {
    this.#location = location;
    this.#window = windowTarget;
    this.#entries = [{ url: location[url], state: null }];
    location[historyOf] = this;
  }

  get length() { return this.#entries.length; }
  get state() { return this.#entries[this.#index].state; }
  get scrollRestoration() { return "manual"; }
  set scrollRestoration(_) {}

  pushState(state, _title, address) {
    this.#add(state, address, false);
  }

  replaceState(state, _title, address) {
    this.#add(state, address, true);
  }

  back() { this.go(-1); }
  forward() { this.go(1); }

  go(delta = 0) {
    const index = this.#index + (Number(delta) | 0);
    if (delta === 0 || index < 0 || index >= this.#entries.length) return;
    const old = this.#location[url];
    this.#index = index;
    const entry = this.#entries[index];
    this.#location[url] = entry.url;
    // As in a browser, the traversal's events come in a later task.
    setTimeout(() => this.#traversed(old, entry), 0);
  }

  #traversed(old, entry) {
    this.#window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }));
    if (old.hash !== entry.url.hash && sameDocument(old, entry.url)) this.#hashChanged(old, entry.url);
  }

  #hashChanged(old, next) {
    this.#window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: old.href, newURL: next.href }));
  }

  #add(state, address, replace) {
    const current = this.#location[url];
    const next = address == null ? current : new URL(String(address), current);
    if (next.origin !== current.origin) {
      throw new (globalThis.DOMException ?? Error)("a history entry must have the window's origin, not " + next.origin, "SecurityError");
    }
    const entry = { url: next, state: state === undefined ? null : structuredCopy(state) };
    if (replace) this.#entries[this.#index] = entry;
    else {
      this.#entries.length = this.#index + 1;
      this.#entries.push(entry);
      this.#index++;
    }
    this.#location[url] = next;
  }

  // A navigation by `location`: a new hash only scrolls in a browser, which sends `hashchange`;
  // another address of the app becomes the entry, with `popstate` for the router.
  _navigate(next, replace) {
    const old = this.#location[url];
    if (next.origin !== old.origin) {
      globalThis.open?.(next.href);
      return;
    }
    if (next.href === old.href) return;
    this.#add(null, next.href, replace);
    if (sameDocument(old, next) && old.hash !== next.hash) {
      setTimeout(() => this.#hashChanged(old, next), 0);
    } else {
      setTimeout(() => this.#window.dispatchEvent(new PopStateEvent("popstate", { state: null })), 0);
    }
  }
}

function sameDocument(a, b) {
  return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
}

function structuredCopy(value) {
  try {
    return typeof structuredClone === "function" ? structuredClone(value) : value;
  } catch {
    return value;
  }
}
