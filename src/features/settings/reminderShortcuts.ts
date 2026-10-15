import { useMemo } from "react";
import { readWorkspacePreference, useWorkspaceId, useWorkspacePreference, writeWorkspacePreference } from "./workspacePreferences";

type PresetSchedule = { minutes: number; time?: never } | { time: string; minutes?: never };
export type ReminderShortcut = { id: string; label: string } & PresetSchedule;
export type ReminderShortcutInput = { label: string } & PresetSchedule;
export type ReminderPreset = ReminderShortcut;
const storageKey = "scribe-reminder-shortcuts";
export const standardReminderPresets: ReminderPreset[] = [
  { id: "builtin-1h", label: "1 hr", minutes: 60 },
  { id: "builtin-3h", label: "3 hrs", minutes: 180 },
  { id: "builtin-6h", label: "6 hrs", minutes: 360 },
  { id: "builtin-tomorrow", label: "24 hrs", minutes: 1440 },
];
type Preferences = { shortcuts: ReminderShortcut[]; defaultId: string };
const defaults: Preferences = { shortcuts: [], defaultId: "builtin-1h" };
export function isPresetTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function formatPresetTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function reminderPresetDate(preset: ReminderPreset, now = new Date()): Date {
  const date = new Date(now);
  if (preset.time !== undefined) {
    const [hour, minute] = preset.time.split(":").map(Number);
    date.setHours(hour, minute, 0, 0);
    if (date.getTime() <= now.getTime() || date.getHours() !== hour || date.getMinutes() !== minute) {
      date.setDate(date.getDate() + 1);
      date.setHours(hour, minute, 0, 0);
    }
  } else date.setTime(date.getTime() + preset.minutes * 60_000);
  return date;
}
export function reminderPresetActionLabel(preset: ReminderPreset, now = new Date()) {
  if (preset.time === undefined) return `Remind in ${shortcutDuration(preset.minutes)}`;
  const due = reminderPresetDate(preset, now);
  const day = due.toDateString() === now.toDateString() ? "today" : "tomorrow";
  return `Remind ${day} at ${due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
export function shortcutDuration(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "hr" : "hrs"}`;
  return `${minutes} ${minutes === 1 ? "min" : "mins"}`;
}
function parsePreferences(raw: string | null): Preferences {
  try {
    if (raw === null) return defaults;
    const parsed: unknown = JSON.parse(raw);
    const value = parsed as Partial<Preferences> | null;
    const list = Array.isArray(parsed) ? parsed : value?.shortcuts;
    if (!Array.isArray(list)) return defaults;
    const ids = new Set<string>();
    const shortcuts = list.filter((value): value is ReminderShortcut => {
      if (!value || typeof value.id !== "string" || !value.id || ids.has(value.id) ||
        typeof value.label !== "string" || !value.label.trim() || value.label.length > 24 ||
        (value.time !== undefined ? !isPresetTime(value.time) : !Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 525600)) return false;
      ids.add(value.id); return true;
    }).filter((item) => !(
      item.id === "default-10" && item.minutes === 10 && item.label === "In 10 mins" ||
      item.id === "default-30" && item.minutes === 30 && item.label === "In 30 mins" ||
      item.id === "default-60" && item.minutes === 60 && item.label === "In 1 hr"
    )).map((item): ReminderShortcut => item.time !== undefined
      ? { id: item.id, label: item.label.trim(), time: item.time }
      : { id: item.id, label: item.label.trim(), minutes: item.minutes });
    const requested = Array.isArray(parsed) ? defaults.defaultId : value?.defaultId;
    const defaultId = [...standardReminderPresets, ...shortcuts].some((preset) => preset.id === requested) ? requested as string : defaults.defaultId;
    return { shortcuts, defaultId };
  } catch { return defaults; }
}
function read(workspaceId: string | null) { return parsePreferences(readWorkspacePreference(workspaceId, storageKey)); }
function persist(workspaceId: string | null, next: Preferences) {
  try { writeWorkspacePreference(workspaceId, storageKey, JSON.stringify(next)); }
  catch { return "Could not save presets on this device. Please try again."; }
  return null;
}
function save(workspaceId: string | null, input: ReminderShortcutInput, id?: string): string | null {
  const label = input.label.trim();
  if (!label || label.length > 24) return "Use a preset name of 1–24 characters.";
  if (input.time !== undefined) {
    if (!isPresetTime(input.time)) return "Choose a valid time.";
  } else if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 525600) return "Choose a duration between 1 minute and 365 days.";
  const preferences = read(workspaceId);
  const saved = preferences.shortcuts;
  if (id && !saved.some((item) => item.id === id)) return "This preset was removed. Add it again to save it.";
  if ([...standardReminderPresets, ...saved].some((item) => item.id !== id && item.label.toLowerCase() === label.toLowerCase())) return "A preset with that name already exists.";
  const replacement: ReminderShortcut = input.time !== undefined
    ? { id: id ?? crypto.randomUUID(), label, time: input.time }
    : { id: id ?? crypto.randomUUID(), label, minutes: input.minutes };
  return persist(workspaceId, { ...preferences, shortcuts: id ? saved.map((item) => item.id === id ? replacement : item) : [...saved, replacement] });
}
export function useReminderShortcuts() {
  const workspaceId = useWorkspaceId();
  const [raw] = useWorkspacePreference(storageKey);
  const preferences = useMemo(() => parsePreferences(raw), [raw]);
  const presets: ReminderPreset[] = [...standardReminderPresets, ...preferences.shortcuts];
  return { shortcuts: preferences.shortcuts, presets, defaultId: preferences.defaultId,
    defaultPreset: presets.find((preset) => preset.id === preferences.defaultId) ?? standardReminderPresets[0],
    setDefault: (id: string) => {
      const saved = read(workspaceId);
      if (![...standardReminderPresets, ...saved.shortcuts].some((preset) => preset.id === id)) return "Choose an available preset.";
      return persist(workspaceId, { ...saved, defaultId: id });
    },
    add: (input: ReminderShortcutInput) => save(workspaceId, input),
    update: (id: string, input: ReminderShortcutInput) => save(workspaceId, input, id),
    remove: (id: string) => {
      const saved = read(workspaceId);
      return persist(workspaceId, { shortcuts: saved.shortcuts.filter((item) => item.id !== id), defaultId: saved.defaultId === id ? defaults.defaultId : saved.defaultId });
    } };
}
