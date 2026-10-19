import { createContext, useContext } from "react";
export type ContextMenuItem = { label: string; action: () => void | Promise<void>; disabled?: boolean; danger?: boolean; separator?: boolean; tourId?: string; checked?: boolean; radio?: boolean };
export const closeContextMenuEvent = 'scribe:close-context-menu';
export const closeContextMenu = () => window.dispatchEvent(new Event(closeContextMenuEvent));
export const MenuContext = createContext<(x: number, y: number, items: ContextMenuItem[], target?: HTMLElement) => void>(() => {});
export const useContextMenu = () => useContext(MenuContext);
