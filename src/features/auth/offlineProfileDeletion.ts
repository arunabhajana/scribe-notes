import { invoke, isTauri } from "@tauri-apps/api/core";
import { offlineStore } from "../notes/offlineStore";
import { reminderStore } from "../reminders/reminderStore";
import { getInAppNotifications } from "../notifications/desktopNotifications";
import { setCaptureEnabled, waitForCaptureAccount } from "../capture/captureBridge";
import { readLocalProfile, removeLocalProfile } from "./localProfile";
import { markWorkspaceDeletion } from "./workspaceDeletionState";

const legacyPreferences = ["scribe-theme", "scribe-accent", "scribe-font-family", "scribe-profile-avatar", "scribe-sidebar-collapsed", "scribe-keyboard-shortcuts", "scribe-writing-preferences", "scribe-reminder-shortcuts"];
function ownStorageKeys(id: string) {
  const exact = new Set([`scribe-folder-order:${id}`, `scribe-unfiled-position:${id}`, `scribe-cloud-sync:v1:${id}`, `scribe-quick-capture-draft:${id}`]);
  const keys = Object.keys(localStorage).filter(key => key.startsWith(`scribe-preferences:v1:${id}:`) || exact.has(key));
  if (localStorage.getItem("scribe-preferences-legacy-owner-v1") === id) keys.push(...legacyPreferences.filter(key => localStorage.getItem(key) !== null));
  return keys;
}
function verifyProfile(id: string) {
  if (readLocalProfile()?.id !== id) throw new Error("The offline profile changed. Reopen Settings before deleting it.");
}
const byteSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export async function inspectOfflineProfile(id: string) {
  verifyProfile(id);
  const [data, stored, reminders, notifications] = await Promise.all([
    offlineStore.load(id), offlineStore.inspectWorkspace(id), reminderStore.load(id), getInAppNotifications(id),
  ]);
  verifyProfile(id);
  const keys = ownStorageKeys(id);
  const capture = localStorage.getItem(`scribe-quick-capture-draft:${id}`);
  return {
    notes: data.notes.filter(note => !note.deletedAt && !note.isDraft).length,
    drafts: data.notes.filter(note => !note.deletedAt && note.isDraft).length,
    trash: data.notes.filter(note => Boolean(note.deletedAt)).length,
    folders: data.folders.length,
    reminders: Object.values(reminders.reminders).filter(reminder => reminder.dueAt).length,
    captureDrafts: capture ? 1 : 0,
    notifications: notifications.length,
    preferences: keys.filter(key => key.startsWith(`scribe-preferences:v1:${id}:`) || legacyPreferences.includes(key)).length,
    bytes: stored.bytes + byteSize(reminders) + byteSize(notifications) + byteSize(readLocalProfile())
      + keys.reduce((total, key) => total + byteSize([key, localStorage.getItem(key)]), 0),
  };
}
export type OfflineProfileSummary = Awaited<ReturnType<typeof inspectOfflineProfile>>;

export async function deleteOfflineProfile(id: string) {
  verifyProfile(id);
  // Persist consent before any destructive work; an interrupted deletion is
  // resumable, and all stores reject late writes for this workspace UUID.
  markWorkspaceDeletion(id, "pending");
  if (isTauri()) {
    await setCaptureEnabled(false);
    await waitForCaptureAccount();
    await invoke("set_capture_account", { userId: null });
    await invoke("configure_desktop_notifications", { config: { userId: null, enabled: false, desktop: false, remindersEnabled: false, sound: false, reminders: [] } });
    await invoke("clear_workspace_notifications", { userId: id });
  }
  const results = await Promise.allSettled([offlineStore.deleteWorkspace(id), reminderStore.deleteWorkspace(id)]);
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  verifyProfile(id);
  for (const key of ownStorageKeys(id)) localStorage.removeItem(key);
  // Older sort maps may contain more than one workspace. Preserve their entries.
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
  // Keep migration ownership markers: another workspace must never inherit the
  // old profile's shared legacy preferences after this deletion.
  markWorkspaceDeletion(id, "deleted");
  removeLocalProfile(id);
}
