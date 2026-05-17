import { useContentSize } from '../components/layout/content-size-context.js';
import { useTerminalSize } from './use-terminal-size.js';

interface VisibleRowsOptions {
  reservedRows: number;
  fallbackReservedRows?: number;
  minRows?: number;
}

export function useVisibleRows({
  reservedRows,
  fallbackReservedRows = reservedRows,
  minRows = 3,
}: VisibleRowsOptions): number {
  const { height: contentHeight } = useContentSize();
  const { rows: terminalRows } = useTerminalSize();
  const availableRows =
    contentHeight > 0
      ? contentHeight - reservedRows
      : terminalRows - fallbackReservedRows;

  return Math.max(minRows, Math.floor(availableRows));
}
