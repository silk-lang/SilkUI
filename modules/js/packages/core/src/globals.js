// A minimal `window` and `document` for libraries written for the browser that build SVG with
// the DOM, such as lottie-web. Import it before them; globals the realm has stay as they are.
import { createNode, createSvgElement, createText } from "./index.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const KIND_OF_TAG = { div: "box", span: "box", p: "box", a: "box", img: "image", input: "input", svg: "svg" };

// A `<canvas>` here draws nothing: libraries such as lottie-web make one at load to probe.
const inert = new Proxy({}, { get: (target, name) => (name in target ? target[name] : () => {}) });

function createElement(tag) {
  tag = String(tag).toLowerCase();
  if (tag === "canvas") return { localName: tag, width: 300, height: 150, style: {}, getContext: () => inert };
  const node = createNode(KIND_OF_TAG[tag] ?? "box");
  node.localName ??= tag;
  return node;
}

const none = () => [];

globalThis.window ??= globalThis;
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) globalThis.navigator = {};
if (globalThis.navigator.userAgent === undefined) {
  Object.defineProperty(globalThis.navigator, "userAgent", { value: "SilkUI", enumerable: true, configurable: true });
}
globalThis.document ??= {
  readyState: "complete",
  createElement,
  createElementNS: (namespace, tag) => (namespace === SVG_NAMESPACE ? createSvgElement(tag) : createElement(tag)),
  createTextNode: (data) => createText(data),
  getElementsByTagName: none,
  getElementsByClassName: none,
  querySelectorAll: none,
  querySelector: () => null,
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
};
