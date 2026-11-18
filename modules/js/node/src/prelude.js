// What a ui-js realm on the SilkJS runtime adds to Node's globals: animation and idle frames,
// `window.open`, `navigator.clipboard`, the `@silkui/core` modules the host defines, and
// uncaught exceptions printed as a browser console prints them, with the window left running.
(() => {
  const native = globalThis.__ui;

  let frames = new Map();
  let nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    native.requestFrame();
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  // The host calls this before a frame, with the time in milliseconds. Callbacks requested
  // while it runs wait for the next frame, as on the web.
  native.frame = function (time) {
    const due = frames;
    frames = new Map();
    let failure = null;
    for (const callback of due.values()) {
      try {
        callback(time);
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) throw failure.error;
  };

  // Idle callbacks run from a timer, with a 50 ms budget as the web gives at most.
  globalThis.requestIdleCallback ??= (callback) => {
    if (typeof callback !== "function") throw new TypeError("requestIdleCallback needs a function");
    return setTimeout(() => {
      const start = performance.now();
      callback({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (performance.now() - start)) });
    }, 1);
  };
  globalThis.cancelIdleCallback ??= (id) => clearTimeout(id);

  // Silk functions on a background thread: `fn.async(...)` of a `.silk` import. The host runs
  // the call on a thread and settles the promise once it ends: kind 0 is a value, 1 a
  // TypeError and 2 an Error.
  const nativeCalls = new Map();
  let nextNativeCall = 0;
  const startNative = native.nativeStart;
  native.nativeStart = (id, ...args) => new Promise((resolve, reject) => {
    const call = ++nextNativeCall;
    nativeCalls.set(call, { resolve, reject });
    startNative(call, id, ...args);
  });
  native.nativeDone = function (call, kind, value) {
    const pending = nativeCalls.get(call);
    if (!pending) return;
    nativeCalls.delete(call);
    if (kind === 0) pending.resolve(value);
    else pending.reject(kind === 1 ? new TypeError(value) : new Error(value));
  };

  // As `navigator.clipboard` in a browser, for text. The host reads and writes the system
  // clipboard after the code that asked has run, then settles the promise.
  const clipboardCalls = new Map();
  let nextClipboardCall = 0;
  function clipboardCall(read, ask) {
    const call = ++nextClipboardCall;
    return new Promise((resolve) => {
      clipboardCalls.set(call, { read, resolve });
      ask(call);
    });
  }
  // The host's answer to clipboard call `call`: a read's text, undefined when there is none.
  native.clipboard = function (call, text) {
    const pending = clipboardCalls.get(call);
    if (!pending) return;
    clipboardCalls.delete(call);
    pending.resolve(pending.read ? (text ?? "") : undefined);
  };
  const clipboard = {
    readText: () => clipboardCall(true, (call) => native.clipboardRead(call)),
    writeText: (text) => {
      const value = String(text);
      return clipboardCall(false, (call) => native.clipboardWrite(call, value));
    },
  };
  if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) globalThis.navigator = {};
  Object.defineProperty(globalThis.navigator, "clipboard", { value: clipboard, enumerable: true, configurable: true });

  // As `window.open` in a browser, for an address outside the application: the host opens
  // it with the system's browser or mail program. Only http, https and mailto addresses go.
  globalThis.open = (url) => {
    const address = String(url ?? "");
    if (!/^(https?:\/\/|mailto:)/i.test(address)) throw new TypeError("open takes an http, https or mailto address, not '" + address + "'");
    native.open(address);
    return null;
  };

  // A window stays open after an exception nothing caught, as a browser tab does.
  const uncaught = (error) => console.error("Uncaught", error);
  native.report = uncaught;
  process.on("uncaughtException", uncaught);
  process.on("unhandledRejection", (reason) => console.error("Uncaught (in promise)", reason));
  globalThis.reportError ??= uncaught;

  // Modules the host defines (`@silkui/core`), importable by name from any module.
  const modules = new Map();
  native.defineModule = (name, source) => {
    modules.set(name, source);
  };
  const scheme = "silk-module:";
  process.getBuiltinModule("node:module").registerHooks({
    resolve(specifier, context, next) {
      if (modules.has(specifier)) return { url: scheme + specifier, format: "module", shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith(scheme)) return { format: "module", source: modules.get(url.slice(scheme.length)), shortCircuit: true };
      return next(url, context);
    },
  });
})();
