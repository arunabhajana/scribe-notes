/** Reveal expanded content inside its nearest scrolling panel. */
export function scrollExpandedIntoView(element: HTMLElement, fallback?: HTMLElement | null) {
  let container = element.parentElement;
  while (container && !(/auto|scroll/.test(getComputedStyle(container).overflowY) && container.scrollHeight > container.clientHeight)) {
    container = container.parentElement;
  }
  if (!container) return;
  const viewport = container.getBoundingClientRect();
  const top = viewport.top + container.clientTop + 12;
  const bottom = viewport.top + container.clientTop + container.clientHeight - 12;
  let bounds = element.getBoundingClientRect();
  if (bounds.height > bottom - top && fallback) bounds = fallback.getBoundingClientRect();
  const distance = bounds.height > bottom - top || bounds.top < top
    ? bounds.top - top : bounds.bottom > bottom ? bounds.bottom - bottom : 0;
  if (Math.abs(distance) > 1) container.scrollBy({
    top: distance,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}
