import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { configureDesktopNotifications, notificationTarget, notifySyncError, notifySyncRestored, getInAppNotifications, dismissInAppNotification, type InAppNotification, type NotificationTarget } from "../features/notifications/desktopNotifications";
import type { Note } from "../types/note";
import type { NoteReminder } from "../features/reminders/reminderTypes";

export function useDesktopNotifications({ userId, notes, reminders, ready, desktop, enabled, sounds, cloudSyncError, cloudSyncHealthy }: {
  userId: string | null; notes: Note[]; reminders: Record<string, NoteReminder>; ready: boolean;
  desktop: boolean; enabled: boolean; sounds: boolean; cloudSyncError: string | null;
  cloudSyncHealthy: boolean;
}) {
  const [issue, setIssue] = useState<{ userId: string | null; message: string } | null>(null);
  const [focused, setFocused] = useState(() => document.hasFocus() && document.visibilityState === "visible");
  useEffect(() => {
    let active = true;
    let revision = 0;
    let stop: (() => void) | undefined;
    const update = () => {
      const requested = ++revision;
      if (isTauri()) void getCurrentWindow().isFocused().then((value) => {
        if (active && requested === revision) {
          setFocused(value && document.visibilityState === "visible");
          if (value) window.dispatchEvent(new Event("scribe:notification-focus"));
        }
      }).catch(() => { if (active) setFocused(false); });
      else setFocused(document.hasFocus() && document.visibilityState === "visible");
    };
    if (isTauri()) void getCurrentWindow().onFocusChanged(({ payload }) => {
      if (active) {
        revision++;
        setFocused(payload && document.visibilityState === "visible");
        if (payload) window.dispatchEvent(new Event("scribe:notification-focus"));
      }
    }).then((unlisten) => { if (active) { stop = unlisten; update(); } else unlisten(); }).catch(update);
    else update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => { active = false; stop?.(); window.removeEventListener("focus", update); window.removeEventListener("blur", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  const clearError = useCallback(() => setIssue(null), []);
  const [inbox, setInbox] = useState<{ userId: string | null; alerts: InAppNotification[] }>({ userId: null, alerts: [] });
  const config = JSON.stringify({ userId, enabled: userId !== null, desktop, remindersEnabled: enabled,
    sound: sounds, reminders: ready ? notes.flatMap((note) => {
      const reminder = reminders[note.id];
      if (note.deletedAt || !reminder?.dueAt) return [];
      const dueAt = Date.parse(reminder.dueAt); const updatedAt = Date.parse(reminder.updatedAt);
      return Number.isFinite(dueAt) && Number.isFinite(updatedAt)
        ? [{ noteId: note.id, title: note.title.slice(0, 500), dueAt, updatedAt, leadMinutes: reminder.leadMinutes }] : [];
    }) : [] });
  const recovery = useRef<{ userId: string | null; failed: boolean; error: string | null }>({ userId: null, failed: false, error: null });
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let stops: (() => void)[] = [];
    const account = (JSON.parse(config) as { userId: string | null }).userId;
    const refresh = () => {
      if (account) void getInAppNotifications(account).then((alerts) => {
        if (active) setInbox({ userId: account, alerts });
      }).catch(() => undefined);
    };
    const configure = () => {
      void configureDesktopNotifications(JSON.parse(config)).catch(() => {
        if (active) setIssue({ userId: account, message: "Desktop notifications couldn't start. Quit and reopen Scribe to restart the notification service." });
      });
    };
    // Subscribe first, so a due reminder's immediate delivery error isn't lost.
    void Promise.allSettled([listen<{ userId: string | null; message: string }>("scribe:notification-error", ({ payload }) => {
      if (active && payload.userId === account) setIssue(payload);
    }), listen<InAppNotification>("scribe:in-app-notification", ({ payload }) => {
      if (active && payload.userId === account) refresh();
    })]).then((results) => {
      const listeners = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (!active) { listeners.forEach((stop) => stop()); return; }
      stops = listeners;
      configure();
      refresh();
    });
    window.addEventListener("focus", configure);
    window.addEventListener("focus", refresh);
    window.addEventListener("scribe:notification-focus", refresh);
    return () => { active = false; stops.forEach((stop) => stop()); window.removeEventListener("focus", configure); window.removeEventListener("focus", refresh); window.removeEventListener("scribe:notification-focus", refresh); };
  }, [config]);
  useEffect(() => {
    if (recovery.current.userId !== userId) recovery.current = { userId, failed: false, error: null };
    if (!userId) return;
    const state = recovery.current;
    if (cloudSyncError) {
      if (state.error === cloudSyncError) return;
      state.failed = true; state.error = cloudSyncError;
      void configureDesktopNotifications(JSON.parse(config)).then(() => notifySyncError(userId)).catch(() => undefined);
    } else if (state.failed && cloudSyncHealthy) {
      state.failed = false; state.error = null;
      void configureDesktopNotifications(JSON.parse(config)).then(() => notifySyncRestored(userId)).catch(() => undefined);
    }
  }, [userId, cloudSyncError, cloudSyncHealthy, config]);
  const dismiss = useCallback(async (id: string) => {
    if (!userId) return;
    try {
      await dismissInAppNotification(userId, id);
      setInbox((current) => current.userId === userId ? { ...current, alerts: current.alerts.filter((alert) => alert.id !== id) } : current);
    } catch { setIssue({ userId, message: "Couldn't dismiss the notification. Please try again." }); }
  }, [userId]);
  return { error: issue?.userId === userId ? issue.message : null, clearError, alerts: focused && inbox.userId === userId ? inbox.alerts : [], dismiss };
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
