import { invoke, isTauri } from "@tauri-apps/api/core";
import { offlineStore } from "../notes/offlineStore";
import { reminderStore } from "../reminders/reminderStore";
import { getInAppNotifications } from "../notifications/desktopNotifications";
import { setCaptureEnabled, waitForCaptureAccount } from "../capture/captureBridge";
import { markWorkspaceDeletion } from "./workspaceDeletionState";

const legacyPreferences = ["scribe-theme", "scribe-accent", "scribe-font-family", "scribe-profile-avatar", "scribe-sidebar-collapsed", "scribe-keyboard-shortcuts", "scribe-writing-preferences", "scribe-reminder-shortcuts"];
function ownStorageKeys(id: string) {
  const exact = new Set([`scribe-folder-order:${id}`, `scribe-unfiled-position:${id}`, `scribe-cloud-sync:v1:${id}`, `scribe-quick-capture-draft:${id}`]);
  const keys = Object.keys(localStorage).filter(key => key.startsWith(`scribe-preferences:v1:${id}:`) || exact.has(key));
  if (localStorage.getItem("scribe-preferences-legacy-owner-v1") === id) keys.push(...legacyPreferences.filter(key => localStorage.getItem(key) !== null));
  return keys;
}
const byteSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export async function inspectWorkspaceData(id: string) {
  const [data, stored, reminders, notifications, imports] = await Promise.all([
    offlineStore.load(id), offlineStore.inspectWorkspace(id), reminderStore.load(id), getInAppNotifications(id), offlineStore.pendingImports(id),
  ]);
  const keys = ownStorageKeys(id);
  return {
    notes: data.notes.filter(note => !note.deletedAt && !note.isDraft).length,
    drafts: data.notes.filter(note => !note.deletedAt && note.isDraft).length,
    trash: data.notes.filter(note => Boolean(note.deletedAt)).length,
    folders: data.folders.length,
    reminders: Object.values(reminders.reminders).filter(reminder => reminder.dueAt).length,
    captureDrafts: localStorage.getItem(`scribe-quick-capture-draft:${id}`) ? 1 : 0,
    notifications: notifications.length,
    preferences: keys.filter(key => key.startsWith(`scribe-preferences:v1:${id}:`) || legacyPreferences.includes(key)).length,
    pendingImports: imports.reduce((total, job) => total + job.notes.length, 0),
    pendingChanges: data.outbox.length + Object.keys(reminders.pending).length,
    contentBytes: stored.bytes + byteSize(reminders) + byteSize(notifications) + keys.filter(key => key === `scribe-folder-order:${id}` || key === `scribe-unfiled-position:${id}` || key === `scribe-quick-capture-draft:${id}`).reduce((total,key) => total + byteSize([key,localStorage.getItem(key)]),0),
    bytes: stored.bytes + byteSize(reminders) + byteSize(notifications) + keys.reduce((total, key) => total + byteSize([key, localStorage.getItem(key)]), 0),
  };
}
export async function deleteWorkspaceData(id: string, preservePreferences = false) {
  markWorkspaceDeletion(id, "pending");
  if (isTauri()) {
    await waitForCaptureAccount();
    const active = await invoke<string | null>("get_capture_account");
    if (active && active !== id) throw new Error("Switch back to this workspace to finish removing its local data.");
    await setCaptureEnabled(false);
    await invoke("set_capture_account", { userId: null });
    await invoke("configure_desktop_notifications", { config: { userId: null, enabled: false, desktop: false, remindersEnabled: false, sound: false, reminders: [] } });
    await invoke("clear_workspace_notifications", { userId: id });
  }
  const results = await Promise.allSettled([offlineStore.deleteWorkspace(id), reminderStore.deleteWorkspace(id)]);
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  const contentKeys = new Set([`scribe-folder-order:${id}`, `scribe-unfiled-position:${id}`, `scribe-quick-capture-draft:${id}`]);
  for (const key of ownStorageKeys(id)) if (!preservePreferences || contentKeys.has(key)) localStorage.removeItem(key);
  const legacySort = localStorage.getItem("scribe-note-sort");
  if (legacySort) {
    let parsed: unknown;
    try { parsed = JSON.parse(legacySort); } catch { parsed = null; }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const remaining = Object.fromEntries(Object.entries(parsed).filter(([view]) => !view.startsWith(`${id}:`)));
      if (Object.keys(remaining).length) localStorage.setItem("scribe-note-sort", JSON.stringify(remaining));
      else localStorage.removeItem("scribe-note-sort");
    }
  }
  // Preserve migration ownership so another workspace cannot inherit old values.
  markWorkspaceDeletion(id, "deleted");
}
