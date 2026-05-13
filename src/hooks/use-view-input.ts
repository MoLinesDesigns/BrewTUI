import { useInput } from 'ink';
import { useNavigationStore } from '../stores/navigation-store.js';

type InputHandler = Parameters<typeof useInput>[0];
type InputOptions = NonNullable<Parameters<typeof useInput>[1]>;

// useInput wrapper that suppresses keypresses while the side menu is open.
// All view-level useInput calls go through this so menu navigation owns
// the arrow keys / enter without each view duplicating the gate.
export function useViewInput(handler: InputHandler, opts?: InputOptions) {
  const menuMode = useNavigationStore((s) => s.menuMode);
  const baseActive = opts?.isActive ?? true;
  useInput(handler, { ...opts, isActive: baseActive && !menuMode });
}
