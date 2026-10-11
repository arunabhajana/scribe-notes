import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  text: string;
  left: number;
  top: number;
  placement: "top" | "right";
  target: Element;
};

export function TooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipElement = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipElement.current) return;
    const bounds = tooltipElement.current.getBoundingClientRect();
    const safeGap = 8;
    let next = tooltip;
    if (tooltip.placement === "right" && tooltip.left + bounds.width > window.innerWidth - safeGap) {
      const rect = tooltip.target?.getBoundingClientRect();
      next = {
        ...tooltip,
        placement: "top",
        left: rect ? rect.left + rect.width / 2 : tooltip.left,
      };
    }
    if (next.placement === "top") {
      next = {
        ...next,
        left: Math.max(bounds.width / 2 + safeGap, Math.min(window.innerWidth - bounds.width / 2 - safeGap, next.left)),
        top: Math.max(bounds.height + safeGap, Math.min(window.innerHeight - safeGap, next.top)),
      };
    } else {
      next = {
        ...next,
        left: Math.max(safeGap, Math.min(window.innerWidth - bounds.width - safeGap, next.left)),
        top: Math.max(bounds.height / 2 + safeGap, Math.min(window.innerHeight - bounds.height / 2 - safeGap, next.top)),
      };
    }
    if (next.left !== tooltip.left || next.top !== tooltip.top || next.placement !== tooltip.placement) setTooltip(next);
  }, [tooltip]);

  useEffect(() => {
    let timer = 0;
    let activeTarget: Element | null = null;
    const show = (target: Element) => {
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      const rect = target.getBoundingClientRect();
      const collapsedSidebar =
        target.closest(".app-layout.sidebar-collapsed .sidebar") !== null;
      const toolbar = target.closest(".format-toolbar") !== null;
      const composerFooter = target.closest(".composer-footer") !== null;
      setTooltip({
        text,
        target,
        left: collapsedSidebar && rect.right + 131 <= window.innerWidth - 8 ? rect.right + 11 : rect.left + rect.width / 2,
        top: Math.max(48, rect.top - (toolbar || composerFooter ? 12 : 10)),
        placement: collapsedSidebar && rect.right + 131 <= window.innerWidth - 8 ? "right" : "top",
      });
    };
    const hide = () => {
      window.clearTimeout(timer);
      activeTarget = null;
      setTooltip(null);
    };
    const schedule = (event: Event) => {
      const target = (event.target as Element | null)?.closest("[data-tooltip]");
      if (!target) { hide(); return; }
      if (target === activeTarget) return;
      window.clearTimeout(timer);
      setTooltip(null);
      activeTarget = target;
      timer = window.setTimeout(() => { if (target.isConnected) show(target); }, 250);
    };
    const move = (event: Event) => {
      const next = (event as PointerEvent).relatedTarget;
      if (next instanceof Node && activeTarget?.contains(next)) return;
      hide();
    };
    document.addEventListener("pointerover", schedule);
    document.addEventListener("pointermove", schedule);
    document.addEventListener("pointerout", move);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", schedule);
      document.removeEventListener("pointermove", schedule);
      document.removeEventListener("pointerout", move);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  if (!tooltip) return null;
  return createPortal(
    <div
      ref={tooltipElement}
      role="tooltip"
      className={`app-tooltip app-tooltip-${tooltip.placement}`}
      style={{ left: tooltip.left, top: tooltip.top, "--accent": getComputedStyle(tooltip.target).getPropertyValue("--accent") || "#37c994" } as React.CSSProperties}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}
