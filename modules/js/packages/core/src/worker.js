// The web's `Worker` on the full runtime's `node:worker_threads`: a module (or classic script)
// on a thread of its own with `self`, `postMessage`, `onmessage` and `close`, messages as
// `MessageEvent`s, and an uncaught exception as an `error` event. A runtime without worker
// threads (the embedded engine) has no `Worker`.

const threads = globalThis.process?.getBuiltinModule?.("node:worker_threads");

// What runs first on the worker's thread: the worker globals, then the script.
const BOOTSTRAP = `
const { parentPort, workerData } = require("node:worker_threads");
const target = new EventTarget();
globalThis.self = globalThis;
globalThis.name = workerData.name;
globalThis.onmessage = null;
globalThis.onmessageerror = null;
globalThis.onerror = null;
globalThis.addEventListener = target.addEventListener.bind(target);
globalThis.removeEventListener = target.removeEventListener.bind(target);
globalThis.dispatchEvent = target.dispatchEvent.bind(target);
globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, Array.isArray(transfer) ? transfer : transfer?.transfer);
globalThis.close = () => process.exit(0);
globalThis.importScripts = (...urls) => {
  const { readFileSync } = require("node:fs");
  const { fileURLToPath } = require("node:url");
  for (const url of urls) (0, eval)(readFileSync(fileURLToPath(new URL(url, workerData.url)), "utf8"));
};
parentPort.on("message", (data) => {
  const event = new MessageEvent("message", { data });
  if (typeof globalThis.onmessage === "function") globalThis.onmessage(event);
  target.dispatchEvent(event);
});
const ErrorEvent = globalThis.ErrorEvent ?? class ErrorEvent extends Event {
  constructor(type, init = {}) { super(type, init); this.message = init.message ?? ""; this.error = init.error; }
};
const failed = (error) => {
  const event = new ErrorEvent("error", { error, message: String(error?.message ?? error), cancelable: true });
  if (typeof globalThis.onerror === "function") globalThis.onerror(event);
  target.dispatchEvent(event);
  if (!event.defaultPrevented) parentPort.postMessage({ [workerData.errorKey]: { message: String(error?.message ?? error), stack: error?.stack } });
};
process.on("uncaughtException", failed);
if (workerData.module) import(workerData.url).catch(failed);
else {
  const { readFileSync } = require("node:fs");
  const { fileURLToPath } = require("node:url");
  const source = workerData.url.startsWith("data:")
    ? decodeURIComponent(workerData.url.slice(workerData.url.indexOf(",") + 1))
    : readFileSync(fileURLToPath(workerData.url), "utf8");
  try { (0, eval)(source); } catch (error) { failed(error); }
}
`;

const ERROR_KEY = "__silkWorkerError";

// Node has no ErrorEvent.
const ErrorEvent = !threads ? null : globalThis.ErrorEvent ?? class ErrorEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.message = init.message ?? "";
    this.error = init.error;
    this.filename = init.filename ?? "";
    this.lineno = init.lineno ?? 0;
    this.colno = init.colno ?? 0;
  }
};

function scriptUrl(specifier) {
  const text = String(specifier instanceof URL ? specifier.href : specifier);
  if (/^(file|data):/.test(text)) return text;
  if (text.startsWith("blob:")) {
    const blob = globalThis.process.getBuiltinModule("node:buffer").resolveObjectURL(text);
    if (!blob) throw new (globalThis.DOMException ?? Error)("no object URL " + text, "SecurityError");
    return { blob };
  }
  const { pathToFileURL } = globalThis.process.getBuiltinModule("node:url");
  const base = globalThis.__silkWorkerBase ?? pathToFileURL(globalThis.process.cwd() + "/").href;
  // An address of the window's own origin names a file of the app.
  try {
    const own = new URL(text, globalThis.location?.href);
    if (globalThis.location && own.origin === globalThis.location.origin) return new URL("." + own.pathname, base).href;
  } catch {}
  return new URL(text, base).href;
}

export const WorkerClass = threads
  ? class Worker extends EventTarget {
      #thread = null;
      #queue = [];
      onmessage = null;
      onmessageerror = null;
      onerror = null;

      constructor(specifier, options = {}) {
        super();
        const url = scriptUrl(specifier);
        const start = (href) => {
          this.#thread = new threads.Worker(BOOTSTRAP, {
            eval: true,
            workerData: { url: href, module: options.type === "module", name: options.name ?? "", errorKey: ERROR_KEY },
          });
          this.#thread.on("message", (data) => {
            if (data && typeof data === "object" && ERROR_KEY in data) {
              const error = Object.assign(new Error(data[ERROR_KEY].message), { stack: data[ERROR_KEY].stack });
              this.#fire(new ErrorEvent("error", { error, message: error.message }));
              return;
            }
            this.#fire(new MessageEvent("message", { data }));
          });
          this.#thread.on("messageerror", (data) => this.#fire(new MessageEvent("messageerror", { data })));
          this.#thread.on("error", (error) => this.#fire(new ErrorEvent("error", { error, message: String(error?.message ?? error) })));
          for (const [data, transfer] of this.#queue.splice(0)) this.#thread.postMessage(data, transfer);
        };
        if (typeof url === "string") start(url);
        else url.blob.text().then((source) => start("data:text/javascript," + encodeURIComponent(source)));
      }

      #fire(event) {
        const handler = this["on" + event.type];
        if (typeof handler === "function") {
          try { handler.call(this, event); } catch (error) { globalThis.reportError?.(error); }
        }
        this.dispatchEvent(event);
      }

      postMessage(data, transfer) {
        const list = Array.isArray(transfer) ? transfer : transfer?.transfer;
        if (this.#thread) this.#thread.postMessage(data, list);
        else this.#queue.push([data, list]);
      }

      terminate() {
        this.#thread?.terminate();
        this.#queue = [];
      }
    }
  : undefined;
