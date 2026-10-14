import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StatusToast } from "../feedback/LoadingFeedback";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { MenuContext, type ContextMenuItem } from "./contextMenuState";
type Menu = { x: number; y: number; items: ContextMenuItem[]; target: HTMLElement | null };

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = (x: number, y: number, items: ContextMenuItem[], target?: HTMLElement) => {
    const rect = target?.getBoundingClientRect();
    setMenu(items.length ? { x: x || rect?.left || 8, y: y || rect?.bottom || 8, items, target: target ?? null } : null);
  };
  useEffect(() => {
    let pendingNative: MouseEvent | null = null;
    let active = true;
    let unlisten: (() => void) | undefined;
    const handler = (event: MouseEvent, nativeResolved = false) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      const input = target.closest<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
      if (!nativeResolved && isTauri() && input?.spellcheck && !input.readOnly && !input.disabled && !["password", "checkbox", "radio", "button", "submit"].includes(input.type)) {
        pendingNative = event;
        setMenu(null);
        return;
      }
      event.preventDefault();
      const selection = window.getSelection()?.toString() ?? "";
      if (input && !["password", "checkbox", "radio", "button", "submit"].includes(input.type)) {
        const start = input.selectionStart ?? 0, end = input.selectionEnd ?? 0;
        const original = input.value;
        const replace = (text: string) => {
          if (!input.isConnected || input.value !== original) throw new Error("The text changed. Open the menu again to paste safely.");
          const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, original.slice(0, start) + text + original.slice(end));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus(); input.setSelectionRange(start + text.length, start + text.length);
        };
        open(event.clientX, event.clientY, [
          { label: "Cut", disabled: start === end || input.readOnly || input.disabled, action: async () => { await navigator.clipboard.writeText(original.slice(start, end)); replace(""); } },
          { label: "Copy", disabled: start === end, action: () => navigator.clipboard.writeText(original.slice(start, end)) },
          { label: "Paste", disabled: input.readOnly || input.disabled, action: async () => replace(await navigator.clipboard.readText()) },
          { label: "Select all", separator: true, action: () => { input.focus(); input.select(); } },
        ], input);
      } else if (selection) {
        open(event.clientX, event.clientY, [{ label: "Copy", action: () => navigator.clipboard.writeText(selection) }], target);
      } else setMenu(null);
    };
    const onContextMenu = (event: MouseEvent) => handler(event);
    if (isTauri()) void listen("scribe:editable-context-menu", () => {
      const event = pendingNative;
      pendingNative = null;
      if (active && event && (event.target as HTMLElement).isConnected && performance.now() - event.timeStamp < 1500) handler(event, true);
    }).then((stop) => { if (active) unlisten = stop; else stop(); }).catch(() => undefined);
    document.addEventListener("contextmenu", onContextMenu);
    return () => { active = false; unlisten?.(); document.removeEventListener("contextmenu", onContextMenu); };
  }, []);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);
  const styles = menu?.target ? getComputedStyle(menu.target) : getComputedStyle(document.documentElement);
  const variables = Object.fromEntries(["--surface-2", "--surface-3", "--text", "--muted", "--border", "--accent", "--accent-soft"].map((key) => [key, styles.getPropertyValue(key)]));
  return <MenuContext.Provider value={open}>{children}{menu && createPortal(
    <div ref={menuRef} role="menu" aria-label="Context actions" className="scribe-context-menu" style={{ ...variables, left: Math.max(8, Math.min(menu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(menu.y, window.innerHeight - Math.min(menu.items.length * 35 + 12, 350) - 8)) }} onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => {
      if (event.key === "Escape" || event.key === "Tab") { setMenu(null); menu.target?.focus(); if (event.key === "Escape") event.preventDefault(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>{menu.items.map((item, index) => <button key={`${item.label}-${index}`} role="menuitem" disabled={item.disabled} className={`${item.danger ? "is-danger" : ""} ${item.separator ? "has-separator" : ""}`} onClick={() => { setMenu(null); menu.target?.focus(); Promise.resolve().then(item.action).catch(() => setError("Could not complete this action. Clipboard access may be unavailable; you can use keyboard shortcuts.")); }}>{item.label}</button>)}</div>, document.body,
  )}{error && <div className="status-toast-stack"><StatusToast message={error} onDismiss={() => setError(null)} /></div>}</MenuContext.Provider>;
}
