import { useCallback, useSyncExternalStore } from "react";

const changed = "scribe-cloud-sync-preference-changed";
const keyFor = (userId: string) => `scribe-cloud-sync:v1:${userId}`;
const requests = new Map<string, AbortController>();

export function isCloudSyncEnabled(userId: string) {
  try { return localStorage.getItem(keyFor(userId)) === "enabled"; }
  catch { return false; }
}

// Check at the network boundary too: stale timers must not upload after opt-out.
export function cloudSyncSignal(userId: string) {
  if (!isCloudSyncEnabled(userId)) throw new Error("Cloud sync is disabled on this device.");
  let controller = requests.get(userId);
  if (!controller || controller.signal.aborted) {
    controller = new AbortController(); requests.set(userId, controller);
  }
  return AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]);
}

function subscribe(notify: () => void) {
  const update = () => {
    for (const [userId, controller] of requests) if (!isCloudSyncEnabled(userId)) { controller.abort(); requests.delete(userId); }
    notify();
  };
  window.addEventListener(changed, update);
  window.addEventListener("storage", update);
  return () => { window.removeEventListener(changed, update); window.removeEventListener("storage", update); };
}

export function useCloudSyncPreference(userId: string | undefined) {
  const enabled = useSyncExternalStore(subscribe, () => Boolean(userId && isCloudSyncEnabled(userId)), () => false);
  const setEnabled = useCallback((value: boolean) => {
    if (!userId) throw new Error("Sign in before changing cloud sync.");
    localStorage.setItem(keyFor(userId), value ? "enabled" : "disabled");
    if (!value) { requests.get(userId)?.abort(); requests.delete(userId); }
    window.dispatchEvent(new Event(changed));
  }, [userId]);
  return { enabled, setEnabled };
}
