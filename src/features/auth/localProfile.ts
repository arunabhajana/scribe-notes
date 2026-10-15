import { useCallback, useSyncExternalStore } from "react";

export type LocalProfile = { id: string; displayName: string; avatarColor: string };
const key = "scribe-local-profile-v1";
const changed = "scribe-local-profile-changed";
function snapshot() { try { return localStorage.getItem(key); } catch { return null; } }
function subscribe(notify: () => void) {
  window.addEventListener(changed, notify); window.addEventListener("storage", notify);
  return () => { window.removeEventListener(changed, notify); window.removeEventListener("storage", notify); };
}
function parse(value: string | null): LocalProfile | null {
  try {
    const profile = JSON.parse(value ?? "null");
    return profile && typeof profile.id === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(profile.id)
      && typeof profile.displayName === "string" && profile.displayName.trim().length > 0 && profile.displayName.length <= 60
      && typeof profile.avatarColor === "string" && /^#[\da-f]{6}$/i.test(profile.avatarColor) ? profile : null;
  } catch { return null; }
}
export function useLocalProfile() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const profile = parse(raw);
  const save = useCallback((displayName: string, avatarColor?: string): string | null => {
    const name = displayName.trim();
    if (!name || name.length > 60) return "Enter a display name between 1 and 60 characters.";
    try {
      const existing = parse(snapshot());
      const next: LocalProfile = { id: existing?.id ?? crypto.randomUUID(), displayName: name, avatarColor: avatarColor ?? existing?.avatarColor ?? "#8970ed" };
      localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event(changed)); return null;
    } catch { return "Could not save your profile on this device. Check available storage and try again."; }
  }, []);
  return { profile, save };
}
