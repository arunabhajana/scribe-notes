import { useCallback, useMemo } from "react";
import { readWorkspacePreference, useWorkspaceId, useWorkspacePreference, writeWorkspacePreference } from "./workspacePreferences";

const defaults = { launch: false, minimizeToTray: false, quickCapture: true, spellcheck: true, reminders: true, desktop: true, sounds: false, size: "Medium", reminderLead: "10 minutes" };
const key = "scribe-writing-preferences";
function parse(raw: string | null): typeof defaults {
  try {
    const saved = JSON.parse(raw ?? "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;
    return { ...defaults, ...Object.fromEntries(Object.entries(defaults).filter(([name, value]) => typeof saved[name] === typeof value).map(([name]) => [name, saved[name]])) };
  } catch { return defaults; }
}
export function useWritingPreferences() {
  const id = useWorkspaceId();
  const [raw] = useWorkspacePreference(key);
  const current = useMemo(() => parse(raw), [raw]);
  const update = useCallback((value: Partial<typeof defaults>) => {
    writeWorkspacePreference(id, key, JSON.stringify({ ...parse(readWorkspacePreference(id, key)), ...value }));
  }, [id]);
  return [current, update] as const;
}
