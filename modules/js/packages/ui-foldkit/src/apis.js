// The web globals `@silkui/foldkit` provides in a realm that lacks them, for the `allow`
// option of `@silkui/vite`: its report then lists only what is really missing.
export const provided = [
  "document", "window", "self", "navigator", "location", "history", "sessionStorage", "matchMedia", "getComputedStyle",
  "addEventListener", "removeEventListener", "dispatchEvent", "Node", "Element", "HTMLElement", "HTMLInputElement",
  "HTMLTextAreaElement", "Text", "Comment", "Event", "CustomEvent", "MutationObserver", "CSSStyleDeclaration",
];
