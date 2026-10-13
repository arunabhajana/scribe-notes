import { useEffect } from "react";
import { scrollExpandedIntoView } from "./scrollExpandedIntoView";

/** Reveal new form errors without moving focus or scrolling for toast messages. */
export function AutoRevealValidation() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const seen = new WeakMap<HTMLElement, string>();
    const queued = new Set<HTMLElement>();
    let frame = 0;
    function schedule(element: HTMLElement) {
      queued.add(element);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const candidates = [...queued]; queued.clear();
        for (const candidate of candidates) {
          if (!candidate.isConnected || !candidate.getClientRects().length) continue;
          const form = candidate.closest("form");
          const invalid = form?.querySelector<HTMLElement>('[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid');
          scrollExpandedIntoView(invalid ?? candidate);
          break;
        }
      });
    }
    function consider(element: HTMLElement) {
      if (element.closest(".status-toast, .app-tooltip")) return;
      if (element.getAttribute("aria-invalid") === "true") { schedule(element); return; }
      if (element.getAttribute("role") !== "alert" ||
        !(element.closest("form") || element.matches(".auth-error, .shortcut-error, .reminder-shortcut-error, .folder-error"))) return;
      const text = element.textContent?.trim() ?? "";
      if (!text || seen.get(element) === text) return;
      seen.set(element, text); schedule(element);
    }
    function scan(node: Node) {
      const element = node instanceof HTMLElement ? node : node.parentElement;
      if (!element) return;
      const parentAlert = element.closest<HTMLElement>('[role="alert"]');
      if (parentAlert) consider(parentAlert);
      consider(element);
      element.querySelectorAll<HTMLElement>('[role="alert"], [aria-invalid="true"]').forEach(consider);
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") mutation.addedNodes.forEach(scan);
        else scan(mutation.target);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["role", "aria-invalid"] });
    const invalid = (event: Event) => { if (event.target instanceof HTMLElement) schedule(event.target); };
    root.addEventListener("invalid", invalid, true);
    scan(root);
    return () => { observer.disconnect(); root.removeEventListener("invalid", invalid, true); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
