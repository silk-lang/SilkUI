import type { Attribute } from "foldkit/html";
import type { Node as TreeNode } from "@silk/ui";

/** A style object, as `h.Style` takes it. */
export type Style = Readonly<Record<string, string>>;

/** The style laid over the element while the pointer is on it, as `:hover`. */
export declare const HoverStyle: (style: Style) => Attribute<never>;
/** While it is pressed, as `:active`. */
export declare const ActiveStyle: (style: Style) => Attribute<never>;
/** While it has the focus, as `:focus`. */
export declare const FocusStyle: (style: Style) => Attribute<never>;
/** While it has the focus from the keyboard, as `:focus-visible`. */
export declare const FocusVisibleStyle: (style: Style) => Attribute<never>;
/** What its transitions start from when it first shows, as `@starting-style`. */
export declare const StartingStyle: (style: Style) => Attribute<never>;
/** The SVG markup an `icon` element draws, with the element's `color` as `currentColor`. */
export declare const Svg: (markup: string) => Attribute<never>;

declare global {
  interface Node {
    /** The @silk/ui node behind this element or text. */
    readonly node: TreeNode;
  }
}
