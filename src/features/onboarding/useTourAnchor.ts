import { useEffect, useState } from 'react';

export type TourRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type TourAnchor = { element: HTMLElement | null; rect: TourRect | null; rail?: TourRect | null; width: number; height: number };

export function findTourTarget(selector?: string) {
  if (!selector) return null;
  for (const candidate of selector.split(',')) {
    const element = document.querySelector<HTMLElement>(candidate.trim());
    if (element) return element;
  }
  return null;
}

// Only watch while mounted. Lazy settings, container scrolling and resizing
// can move a control after its step begins.
export function useTourAnchor(selector?: string): TourAnchor {
  const [anchor, setAnchor] = useState<TourAnchor & { selector?: string }>({ element: null, rect: null, width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    let frame = 0;
    let current: HTMLElement | null = null;
    let disposed = false;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      frame = 0;
      if (disposed) return;
      const element = findTourTarget(selector);
      if (element !== current) {
        if (current) resize.unobserve(current);
        current = element;
        if (element) { resize.observe(element); element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
      }
      const bounds = element?.getBoundingClientRect();
      const settingsRail = element?.closest('.settings-page')?.querySelector('.settings-nav')?.getBoundingClientRect();
      const rail = settingsRail ? { left: settingsRail.left, top: settingsRail.top, right: settingsRail.right, bottom: settingsRail.bottom, width: settingsRail.width, height: settingsRail.height } : null;
      const width = window.innerWidth, height = window.innerHeight;
      const left = Math.max(8, (bounds?.left ?? 8) - 7), top = Math.max(8, (bounds?.top ?? 8) - 7);
      const right = Math.min(width - 8, (bounds?.right ?? 8) + 7), bottom = Math.min(height - 8, (bounds?.bottom ?? 8) + 7);
      const rect = bounds && bounds.width > 0 && bounds.height > 0 && right > left && bottom > top
        ? { left, top, right, bottom, width: right - left, height: bottom - top } : null;
      setAnchor(previous => previous.selector === selector && previous.element === element && previous.width === width && previous.height === height
        && JSON.stringify(previous.rect) === JSON.stringify(rect) && JSON.stringify(previous.rail) === JSON.stringify(rail) ? previous : { element, rect, rail, width, height, selector });
    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    resize.observe(document.documentElement);
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
    };
  }, [selector]);
  return anchor.selector === selector ? anchor : { ...anchor, element: null, rect: null };
}

export function placeTourCard(anchor: TourAnchor, card: { width: number; height: number }, placement?: 'settings') {
  const { rect, width, height } = anchor;
  const clampX = (x: number) => Math.max(12, Math.min(x, width - card.width - 12));
  const clampY = (y: number) => Math.max(12, Math.min(y, height - card.height - 12));
  // Dock inside the navigation rail. Never cover the settings controls, even
  // when there isn't space above or below the highlighted card.
  if (placement === 'settings' && anchor.rail) return { left: anchor.rail.left + 12, top: clampY(rect?.top ?? anchor.rail.top + 12) };
  if (!rect) return { left: clampX((width - card.width) / 2), top: clampY((height - card.height) / 2) };
  const candidates = [
    { left: rect.right + 16, top: clampY(rect.top) },
    { left: clampX(rect.left), top: rect.bottom + 16 },
    { left: rect.left - card.width - 16, top: clampY(rect.top) },
    { left: clampX(rect.left), top: rect.top - card.height - 16 },
  ];
  const fits = candidates.find(p => p.left >= 12 && p.top >= 12 && p.left + card.width <= width - 12 && p.top + card.height <= height - 12);
  return fits ?? { left: rect.left > width * .25 ? 12 : clampX(rect.right + 16), top: clampY(rect.bottom - card.height) };
}
