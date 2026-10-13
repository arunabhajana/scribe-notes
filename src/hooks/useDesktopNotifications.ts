import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { configureDesktopNotifications, notificationTarget, notifySyncError, type NotificationTarget } from "../features/notifications/desktopNotifications";
import type { Note } from "../types/note";
import type { NoteReminder } from "../features/reminders/reminderTypes";

export function useDesktopNotifications({ userId, notes, reminders, ready, desktop, enabled, sounds, cloudSyncError }: {
  userId: string | null; notes: Note[]; reminders: Record<string, NoteReminder>; ready: boolean;
  desktop: boolean; enabled: boolean; sounds: boolean; cloudSyncError: string | null;
}) {
  const [issue, setIssue] = useState<{ userId: string | null; message: string } | null>(null);
  const clearError = useCallback(() => setIssue(null), []);
  const config = JSON.stringify({ userId, enabled: desktop && userId !== null, remindersEnabled: enabled,
    sound: sounds, reminders: ready ? notes.flatMap((note) => {
      const reminder = reminders[note.id];
      if (note.deletedAt || !reminder?.dueAt) return [];
      const dueAt = Date.parse(reminder.dueAt); const updatedAt = Date.parse(reminder.updatedAt);
      return Number.isFinite(dueAt) && Number.isFinite(updatedAt)
        ? [{ noteId: note.id, title: note.title, dueAt, updatedAt, leadMinutes: reminder.leadMinutes }] : [];
    }) : [] });
  const previousError = useRef<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    const account = (JSON.parse(config) as { userId: string | null }).userId;
    const configure = () => {
      void configureDesktopNotifications(JSON.parse(config)).catch(() => {
        if (active) setIssue({ userId: account, message: "Desktop notifications couldn't start. Quit and reopen Scribe to restart the notification service." });
      });
    };
    // Subscribe first, so a due reminder's immediate delivery error isn't lost.
    void listen<{ userId: string | null; message: string }>("scribe:notification-error", ({ payload }) => {
      if (active && payload.userId === account) setIssue(payload);
    }).then((stop) => {
      if (!active) { stop(); return; }
      unlisten = stop;
      configure();
    }).catch(() => {
      if (active) configure();
    });
    window.addEventListener("focus", configure);
    return () => { active = false; unlisten?.(); window.removeEventListener("focus", configure); };
  }, [config]);
  useEffect(() => {
    if (!userId || !desktop || !cloudSyncError) { previousError.current = null; return; }
    const episode = `${userId}:${cloudSyncError}`;
    if (previousError.current === episode) return;
    previousError.current = episode;
    void notifySyncError(userId).catch((error: unknown) => console.warn("Could not show a sync notification", error));
  }, [userId, desktop, cloudSyncError]);
  return { error: issue?.userId === userId ? issue.message : null, clearError };
}

export function useNotificationActivation(onOpen: (target: NotificationTarget) => void) {
  const callback = useRef(onOpen);
  useEffect(() => { callback.current = onOpen; }, [onOpen]);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    const accept = (urls: string[]) => {
      for (const url of urls) { const target = notificationTarget(url); if (target && active) callback.current(target); }
    };
    void onOpenUrl(accept).then((stop) => { if (active) unlisten = stop; else stop(); }).catch(() => undefined);
    void getCurrent().then((urls) => { if (urls) accept(urls); }).catch(() => undefined);
    return () => { active = false; unlisten?.(); };
  }, []);
}
