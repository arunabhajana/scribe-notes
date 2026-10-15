import { useSyncExternalStore } from "react";

export type DataScope = "local" | "cloud" | "both";
export type DataDeletionTarget = { id: string; displayName: string; email: string; localOnly: boolean };
export type PendingDataDeletion = { target: DataDeletionTarget; scope: DataScope; receipt: string; requestedAt: number; phase: "verifying" | "confirmed" | "restart"; runtime: string };
const key = "scribe-data-deletion:v1";
const event = "scribe-data-deletion-changed";
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
function snapshot() { try { return localStorage.getItem(key); } catch { return null; } }
function parse(raw: string | null): PendingDataDeletion | null {
  try {
    const value = JSON.parse(raw ?? "null");
    return value && uuid.test(value.target?.id) && typeof value.target.displayName === "string" && typeof value.target.email === "string" && typeof value.target.localOnly === "boolean" &&
      ["local", "cloud", "both"].includes(value.scope) && (!value.target.localOnly || value.scope === "local") && /^[\da-f]{64}$/.test(value.receipt) &&
      Number.isFinite(value.requestedAt) && ["verifying", "confirmed", "restart"].includes(value.phase) && typeof value.runtime === "string" ? value : null;
  } catch { return null; }
}
export function pendingDataDeletion() { return parse(snapshot()); }
export function saveDataDeletion(value: PendingDataDeletion | null) {
  if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key);
  window.dispatchEvent(new Event(event));
}
function subscribe(notify: () => void) {
  window.addEventListener(event, notify); window.addEventListener("storage", notify);
  return () => { window.removeEventListener(event, notify); window.removeEventListener("storage", notify); };
}
export function usePendingDataDeletion() { return parse(useSyncExternalStore(subscribe, snapshot, () => null)); }
