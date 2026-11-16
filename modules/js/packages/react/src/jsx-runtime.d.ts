// JSX for the tree's node kinds. With `"jsxImportSource": "@silkui/react"`, TypeScript
// checks <box>, <input>, <richinput>, <image>, <icon> and <canvas> against these props.
import type { Key, Ref, ReactNode, JSX as ReactJSX } from "react";
import type * as Silk from "@silkui/core";

export { Fragment, jsx, jsxs } from "react/jsx-runtime";

/** Handlers by prop name; each also takes a `Capture` suffix for the capture phase. */
interface Handlers<T extends Silk.Node> {
  onPointerDown: Silk.PointerButtonEvent;
  onPointerUp: Silk.PointerButtonEvent;
  onClick: Silk.PointerButtonEvent;
  onPointerMove: Silk.PointerEvent;
  onPointerEnter: Silk.PointerEvent;
  onPointerLeave: Silk.PointerEvent;
  onPointerCancel: Silk.PointerEvent;
  onWheel: Silk.WheelEvent;
  onKeyDown: Silk.KeyboardEvent;
  onKeyUp: Silk.KeyboardEvent;
  onFocus: Silk.Event;
  onBlur: Silk.Event;
  onInput: Silk.InputEvent<T>;
  onSelectionChange: Silk.SelectionEvent<T>;
  onScroll: Silk.ScrollEvent;
  onLayout: Silk.LayoutEvent;
  onGotPointerCapture: Silk.Event;
  onLostPointerCapture: Silk.Event;
  onLoad: Silk.Event;
  onError: Silk.Event;
  onTransitionRun: Silk.TransitionEvent;
  onTransitionStart: Silk.TransitionEvent;
  onTransitionEnd: Silk.TransitionEvent;
  onTransitionCancel: Silk.TransitionEvent;
  onAnimationStart: Silk.AnimationEvent;
  onAnimationIteration: Silk.AnimationEvent;
  onAnimationEnd: Silk.AnimationEvent;
  onAnimationCancel: Silk.AnimationEvent;
}

type EventProps<T extends Silk.Node> = { [K in keyof Handlers<T>]?: ((event: Handlers<T>[K]) => void) | undefined } & {
  [K in keyof Handlers<T> as `${K}Capture`]?: ((event: Handlers<T>[K]) => void) | undefined;
};

type AriaProps = { [name: `aria-${string}`]: string | number | boolean | undefined };

export type SilkProps<T extends Silk.Node = Silk.Node> = EventProps<T> & AriaProps & { [name: `data-${string}`]: string | number | boolean | undefined } & BaseProps<T>;

interface BaseProps<T extends Silk.Node> {
  key?: Key | null | undefined;
  ref?: Ref<T> | undefined;
  children?: ReactNode | undefined;
  style?: Silk.Style | undefined;
  hoverStyle?: Silk.Style | undefined;
  activeStyle?: Silk.Style | undefined;
  focusStyle?: Silk.Style | undefined;
  focusVisibleStyle?: Silk.Style | undefined;
  /** What transitions start from when the node first shows, as `@starting-style`. */
  startingStyle?: Silk.Style | undefined;
  id?: string | undefined;
  className?: string | undefined;
  role?: string | undefined;
  tabIndex?: number | undefined;
  testId?: string | undefined;
  label?: string | undefined;
  disabled?: boolean | undefined;
  inert?: boolean | undefined;
  focusTrap?: boolean | undefined;
  /** CSS cursor keyword. */
  cursor?: string | undefined;
  /** Makes the node a link: an unprevented click on it or inside it opens the address. */
  href?: string | undefined;
}

export type InputProps = SilkProps<Silk.Input> & {
  /** Controlled, as in React DOM. */
  value?: string | undefined;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  multiline?: boolean | undefined;
  readOnly?: boolean | undefined;
};

export type RichInputProps = SilkProps<Silk.RichInput> & {
  /** Controlled, as `value` on <input>. */
  document?: Partial<Silk.RichDocument> | undefined;
  defaultDocument?: Partial<Silk.RichDocument> | undefined;
  /** What text with each mark looks like. */
  marks?: Record<string, Silk.Style> | undefined;
  /** What atoms of each kind look like. */
  atoms?: Record<string, Silk.Style> | undefined;
  placeholder?: string | undefined;
  multiline?: boolean | undefined;
  readOnly?: boolean | undefined;
};

export type IconProps = SilkProps<Silk.Icon> & {
  /** SVG markup, drawn at the icon's CSS size with its `color` as `currentColor`. */
  svg?: string | undefined;
};

export namespace JSX {
  type ElementType = ReactJSX.ElementType;
  interface Element extends ReactJSX.Element {}
  interface ElementClass extends ReactJSX.ElementClass {}
  interface ElementAttributesProperty extends ReactJSX.ElementAttributesProperty {}
  interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
  type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
  interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
  interface IntrinsicClassAttributes<T> extends ReactJSX.IntrinsicClassAttributes<T> {}
  interface IntrinsicElements {
    box: SilkProps;
    input: InputProps;
    richinput: RichInputProps;
    image: SilkProps;
    icon: IconProps;
    canvas: SilkProps;
  }
}
