import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export const WorkspacePreferencesContext = createContext<string | null>(null);
const changed = "scribe-workspace-preferences-changed";
export const workspacePreferenceKey = (workspaceId: string | null, name: string) => `scribe-preferences:v1:${workspaceId ?? "entry"}:${name}`;
export function readWorkspacePreference(workspaceId: string | null, name: string) {
  try { return localStorage.getItem(workspacePreferenceKey(workspaceId, name)); } catch { return null; }
}
export function writeWorkspacePreference(workspaceId: string | null, name: string, value: string) {
  localStorage.setItem(workspacePreferenceKey(workspaceId, name), value);
  window.dispatchEvent(new Event(changed));
}
function subscribe(notify: () => void) {
  window.addEventListener(changed, notify); window.addEventListener("storage", notify);
  return () => { window.removeEventListener(changed, notify); window.removeEventListener("storage", notify); };
}
export function useWorkspaceId() { return useContext(WorkspacePreferencesContext); }
export function useWorkspacePreference(name: string) {
  const id = useWorkspaceId();
  const value = useSyncExternalStore(subscribe, () => readWorkspacePreference(id, name), () => null);
  const set = useCallback((next: string) => writeWorkspacePreference(id, name, next), [id, name]);
  return [value, set] as const;
}

// Claim shared legacy settings once. Other workspaces start with defaults.
export function migrateLegacyPreferences(workspaceId: string) {
  try {
    if (readWorkspacePreference(workspaceId, "scribe-note-sort") === null) {
      const previous = JSON.parse(localStorage.getItem("scribe-note-sort") ?? "{}");
      const own = previous && typeof previous === "object" && !Array.isArray(previous)
        ? Object.fromEntries(Object.entries(previous).filter(([view]) => view.startsWith(`${workspaceId}:`))) : {};
      if (Object.keys(own).length) writeWorkspacePreference(workspaceId, "scribe-note-sort", JSON.stringify(own));
    }
    const ownerKey = "scribe-preferences-legacy-owner-v1";
    const completedKey = "scribe-preferences-legacy-complete-v1";
    const owner = localStorage.getItem(ownerKey);
    if (owner && owner !== workspaceId) return;
    if (owner === workspaceId && localStorage.getItem(completedKey) === "true") return;
    if (!owner) localStorage.setItem(ownerKey, workspaceId);
    for (const name of ["scribe-theme", "scribe-accent", "scribe-font-family", "scribe-profile-avatar", "scribe-sidebar-collapsed", "scribe-keyboard-shortcuts", "scribe-writing-preferences", "scribe-reminder-shortcuts"]) {
      const previous = localStorage.getItem(name);
      if (previous !== null && readWorkspacePreference(workspaceId, name) === null) writeWorkspacePreference(workspaceId, name, previous);
    }
    localStorage.setItem(completedKey, "true");
  } catch { /* Preserve existing data if device storage is unavailable. */ }
}
