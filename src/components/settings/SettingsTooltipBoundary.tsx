import { useRef, useState, type ReactNode, type MouseEvent, type FocusEvent } from "react";
import { createPortal } from "react-dom";

// Handle settings hover locally so the preview controls and their wrappers
// do not depend on document-level pointer event delivery in the WebView.
export function SettingsTooltipBoundary({ children, dark }: { children: ReactNode; dark: boolean }) {
  const active = useRef<HTMLElement | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; left: number; top: number; width: number } | null>(null);
  const hide = () => { active.current = null; setTooltip(null); };
  const show = (event: MouseEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tooltip]");
    if (!target?.dataset.tooltip) { hide(); return; }
    if (active.current === target) return;
    active.current = target;
    const rect = target.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 24);
    // Keep the tooltip below the target when possible, away from its hit area.
    const top = rect.bottom + 8;
    setTooltip({ text: target.dataset.tooltip, width,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(top, window.innerHeight - 120)),
    });
  };
  return (
    <div className="settings-tooltip-boundary" onMouseOver={show} onMouseMove={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onScrollCapture={hide} onClickCapture={hide} onKeyDown={(event) => { if (event.key === "Escape") hide(); }}>
      {children}
      {tooltip && createPortal(
        <div role="tooltip" className={`app-tooltip settings-visible-tooltip ${dark ? "is-dark" : "is-light"}`} style={{ position: "fixed", left: tooltip.left, top: tooltip.top, maxWidth: tooltip.width, zIndex: 2147483647, pointerEvents: "none" }}>
          {tooltip.text}
        </div>, document.body,
      )}
    </div>
  );
}
