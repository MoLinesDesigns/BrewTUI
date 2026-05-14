import { useEffect, useState, type RefObject } from 'react';
import { measureElement, type DOMElement } from 'ink';
import { useTerminalSize } from './use-terminal-size.js';

export interface ContainerSize {
  width: number;
  height: number;
}

// Container-size hook. Equivalent of CSS `100cqi` / `100cqb`.
//
// Returns the real post-layout dimensions of the referenced <Box>. The first
// render reports { width: 0, height: 0 } because measureElement requires
// layout to have run; the effect re-measures synchronously after mount and on
// every terminal resize, so the second frame onwards is accurate.
//
// Consumers MUST attach the returned `ref` to a <Box>, not to a <Text> — Yoga
// only computes a box for the former.
//
// Example:
//   const ref = useRef<DOMElement>(null);
//   const { width } = useContainerSize(ref);
//   return <Box ref={ref}>{width >= 100 ? <Wide /> : <Narrow />}</Box>;
export function useContainerSize(
  ref: RefObject<DOMElement | null>,
): ContainerSize {
  const terminal = useTerminalSize();
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const measured = measureElement(ref.current);
    // Avoid an extra render when nothing changed (resize on unrelated dim).
    setSize((prev) =>
      prev.width === measured.width && prev.height === measured.height
        ? prev
        : measured,
    );
    // Re-measure on every terminal resize — that's when container width can
    // change, since Yoga reflows from the root.
  }, [ref, terminal.columns, terminal.rows]);

  return size;
}
