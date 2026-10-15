import { useSyncExternalStore } from "react";

export const WORKSPACE_DELETION_CHANGED = "scribe-workspace-deletion-changed";
const key = (id: string) => `scribe-workspace-deletion:v1:${id}`;
const observedGenerations = new Map<string, string>();
const generationKey = (id: string) => `scribe-local-data-generation:${id}`;
export function observeWorkspaceGeneration(id: string) {
  const current = localStorage.getItem(generationKey(id)) ?? "0";
  if (!observedGenerations.has(id)) observedGenerations.set(id, current);
  if (observedGenerations.get(id) !== current) throw new Error("This workspace was cleared. Reopen Scribe before saving new data.");
}
export function advanceWorkspaceGeneration(id: string) {
  localStorage.setItem(generationKey(id), crypto.randomUUID());
}
export function finishWorkspaceDataReset(id: string) {
  localStorage.removeItem(key(id));
  window.dispatchEvent(new Event(WORKSPACE_DELETION_CHANGED));
}
export function workspaceDeletionStatus(id: string | null) {
  return id ? localStorage.getItem(key(id)) : null;
}
export function assertWorkspaceWritable(id: string) {
  observeWorkspaceGeneration(id);
  if (workspaceDeletionStatus(id)) throw new Error("This workspace is being deleted. Its data can no longer be changed.");
}
export function markWorkspaceDeletion(id: string, status: "pending" | "deleted" | "verifying") {
  // Keep a content-free tombstone so late saves cannot recreate deleted data.
  localStorage.setItem(key(id), status);
  window.dispatchEvent(new Event(WORKSPACE_DELETION_CHANGED));
}
export function cancelWorkspaceDeletion(id: string) {
  if (workspaceDeletionStatus(id) !== "verifying") return;
  localStorage.removeItem(key(id));
  window.dispatchEvent(new Event(WORKSPACE_DELETION_CHANGED));
}
function subscribe(notify: () => void) {
  window.addEventListener(WORKSPACE_DELETION_CHANGED, notify);
  window.addEventListener("storage", notify);
  return () => { window.removeEventListener(WORKSPACE_DELETION_CHANGED, notify); window.removeEventListener("storage", notify); };
}
export function useWorkspaceDeletionStatus(id: string | null) {
  return useSyncExternalStore(subscribe, () => workspaceDeletionStatus(id), () => null);
}
