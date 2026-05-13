import { useInput } from 'ink';
import { useNavigationStore } from '../stores/navigation-store.js';
import { useLocaleStore } from '../i18n/index.js';
import { useModalStore } from '../stores/modal-store.js';

export function useGlobalKeyboard(opts?: { onQuit?: () => void; disabled?: boolean }) {
  const navigate = useNavigationStore((s) => s.navigate);
  const goBack = useNavigationStore((s) => s.goBack);
  const menuMode = useNavigationStore((s) => s.menuMode);
  const enterMenuMode = useNavigationStore((s) => s.enterMenuMode);
  const exitMenuMode = useNavigationStore((s) => s.exitMenuMode);
  const moveMenuCursor = useNavigationStore((s) => s.moveMenuCursor);
  const selectMenuItem = useNavigationStore((s) => s.selectMenuItem);
  const { locale, setLocale } = useLocaleStore();
  const modalOpen = useModalStore((s) => s.isOpen);

  useInput((input, key) => {
    if (opts?.disabled) return;
    if (modalOpen) return;

    // Menu mode: arrows + enter operate the side menu, esc/m/q exit.
    if (menuMode) {
      if (input === 'q' || (key.ctrl && input === 'c')) {
        opts?.onQuit?.();
        return;
      }
      if (key.escape || input === 'm') {
        exitMenuMode();
        return;
      }
      if (key.upArrow) {
        moveMenuCursor(-1);
        return;
      }
      if (key.downArrow) {
        moveMenuCursor(1);
        return;
      }
      if (key.return) {
        selectMenuItem();
        return;
      }
      return;
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      opts?.onQuit?.();
      return;
    }

    if (key.escape) {
      goBack();
      return;
    }

    if (input === 'm') {
      enterMenuMode();
      return;
    }

    if (input === 'S') {
      navigate('search');
      return;
    }

    if (input === 'L') {
      setLocale(locale === 'en' ? 'es' : 'en');
      return;
    }
  }, { isActive: !opts?.disabled });
}
