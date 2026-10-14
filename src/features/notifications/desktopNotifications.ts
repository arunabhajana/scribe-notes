import { invoke, isTauri } from "@tauri-apps/api/core";
import { waitForCaptureAccount } from "../capture/captureBridge";

export type ReminderNotificationPlan = { noteId: string; title: string; dueAt: number; updatedAt: number; leadMinutes: number };
export type DesktopNotificationConfig = {
  userId: string | null; enabled: boolean; desktop: boolean; remindersEnabled: boolean; sound: boolean; reminders: ReminderNotificationPlan[];
};
export type InAppNotification = { id: string; userId: string; kind: "reminder" | "sync-error" | "sync-restored" | "quick-capture"; title: string; body: string; noteId?: string; dueAt?: number; createdAt: number };
export async function getInAppNotifications(userId: string): Promise<InAppNotification[]> {
  await waitForCaptureAccount();
  return isTauri() ? invoke("get_in_app_notifications", { userId }) : [];
}
export async function dismissInAppNotification(userId: string, id: string) {
  if (isTauri()) await invoke("dismiss_in_app_notification", { userId, id });
}
export async function notifySyncRestored(userId: string) {
  if (isTauri()) await invoke("show_desktop_notification", { message: { kind: "syncRestored", userId } });
}
export async function configureDesktopNotifications(config: DesktopNotificationConfig) {
  await waitForCaptureAccount();
  if (isTauri()) await invoke("configure_desktop_notifications", { config });
}
export async function notifySyncError(userId: string) {
  if (isTauri()) await invoke("show_desktop_notification", { message: { kind: "syncError", userId } });
}
// Call this only AFTER quick capture's local save commits, when that feature is added.
export async function notifyQuickCaptureSaved(userId: string, inApp?: boolean) {
  if (isTauri()) await invoke("show_desktop_notification", { message: { kind: "quickCapture", userId, inApp } });
}

export type NotificationTarget = { userId: string; noteId: string | null };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export function notificationTarget(rawUrl: string): NotificationTarget | null {
  try {
    const url = new URL(rawUrl);
    const userId = url.searchParams.get("user");
    if (url.protocol !== "com.scribe.notes:" || url.hostname !== "notifications" || !userId || !uuid.test(userId)) return null;
    if (url.pathname === "/home") return { userId, noteId: null };
    const noteId = url.searchParams.get("note");
    return url.pathname === "/open-note" && noteId && uuid.test(noteId) ? { userId, noteId } : null;
  } catch { return null; }
}
