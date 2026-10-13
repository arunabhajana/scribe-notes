import { useSyncExternalStore } from "react";

const defaults = { launch: false, minimizeToTray: false, spellcheck: true, reminders: true, desktop: true, sounds: false, size: "Medium", reminderLead: "10 minutes" };
const key = "scribe-writing-preferences";
function read() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) ?? "{}") }; }
  catch { return defaults; }
}
let current: typeof defaults = read();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
window.addEventListener("storage", (event) => {
  if (event.key === key) { current = read(); listeners.forEach((listener) => listener()); }
});
function update(value: Partial<typeof defaults>) {
  const next = { ...current, ...value };
  localStorage.setItem(key, JSON.stringify(next));
  current = next;
  listeners.forEach((listener) => listener());
}
export function useWritingPreferences() {
  return [useSyncExternalStore(subscribe, () => current), update] as const;
}
