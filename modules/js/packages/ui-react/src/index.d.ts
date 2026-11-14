import type { ReactNode } from "react";
import type { Node } from "@silk/ui";

export interface Root {
  /** Renders `element`; the commit is done when it returns, so a window's first frame has it. */
  render(element: ReactNode): void;
  unmount(): void;
}

/**
 * A React root in `container`, a @silk/ui node. Without one, a new box is mounted as the
 * root of the window's tree.
 */
export function createRoot(container?: Node): Root;

/** Runs `callback` and commits the updates it made before returning. */
export function flushSync<T>(callback: () => T): T;
