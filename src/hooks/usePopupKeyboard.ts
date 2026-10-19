import { useLayoutEffect, useRef, type RefObject, type KeyboardEvent } from 'react';

export function usePopupKeyboard(root: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open) {
      const selected = root.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
      (selected ?? root.current?.querySelector<HTMLElement>('[role="menuitem"], [role="option"]'))?.focus({ preventScroll: true });
    }
    if (!open && wasOpen.current && document.activeElement === document.body) root.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, root]);
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.defaultPrevented) return;
    const trigger = root.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]');
    if (!open && event.target === trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setOpen(true); return; }
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger?.focus({ preventScroll: true }); return; }
    if (event.key === 'Tab') { setOpen(false); trigger?.focus({ preventScroll: true }); return; }
    const buttons = [...root.current?.querySelectorAll<HTMLButtonElement>('[role="listbox"] button:not(:disabled), [role="menu"] button:not(:disabled)') ?? []];
    if (!buttons.includes(event.target as HTMLButtonElement)) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const current = buttons.indexOf(event.target as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    }
  };
}
