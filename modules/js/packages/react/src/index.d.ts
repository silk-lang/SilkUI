import type { ReactNode } from "react";
import type { Node } from "@silkui/core";

export interface Root {
  /** Renders `element`; the commit is done when it returns, so a window's first frame has it. */
  render(element: ReactNode): void;
  /** Unmounts what the root rendered. */
  unmount(): void;
}

/**
 * A React root in `container`, a @silkui/core node. Without one it renders into the root of
 * the window's tree, mounting a new box when there is none.
 */
export function createRoot(container?: Node): Root;

/** Runs `callback` and commits the updates it made before returning. */
export function flushSync<T>(callback: () => T): T;

/** Renders `children` into `container`, a @silkui/core node elsewhere in the tree. */
export function createPortal(children: ReactNode, container: Node, key?: string | null): ReactNode;

export { createElement } from "react";
