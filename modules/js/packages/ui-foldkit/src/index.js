// @silk/ui-foldkit: Foldkit programs on the Silk UI tree.
//
// Import it before `foldkit`. It installs `document` and the DOM members Foldkit patches
// through (see dom.js), so the unmodified `foldkit` package renders into tree nodes:
//
//   import "@silk/ui-foldkit";
//   import { Runtime } from "foldkit";
//   Runtime.run(Runtime.makeApplication({ ..., container: document.getElementById("root") }));
//
// Every tag is a box except <input> and <textarea> (the tree's input), <img> (image),
// <icon> and <canvas>. Elements are styled with `h.Style`; the looks the tree lays over an
// element in a state come from the attributes below.
import "./dom.js";

export { document } from "./dom.js";

// Foldkit's attribute for a property of the element. It exports the constructor only from
// an internal module, so the value is spelled here.
const Prop = (key, value) => ({ _tag: "Prop", key, value });
const look = (key) => (style) => Prop(key, style);

/** The style laid over the element while the pointer is on it, as `:hover`. */
export const HoverStyle = look("hoverStyle");
/** While it is pressed, as `:active`. */
export const ActiveStyle = look("activeStyle");
/** While it has the focus, as `:focus`. */
export const FocusStyle = look("focusStyle");
/** While it has the focus from the keyboard, as `:focus-visible`. */
export const FocusVisibleStyle = look("focusVisibleStyle");
/** What its transitions start from when it first shows, as `@starting-style`. */
export const StartingStyle = look("startingStyle");

/** The SVG markup an `icon` element draws, with the element's `color` as `currentColor`. */
export const Svg = (markup) => Prop("svg", markup);
