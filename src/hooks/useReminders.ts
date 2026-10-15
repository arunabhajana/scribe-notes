import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../features/auth/supabaseClient";
import { REMINDERS_CHANGED_EVENT, reminderStore } from "../features/reminders/reminderStore";
import { syncReminders } from "../features/reminders/remindersRepository";
import type { ReminderCache } from "../features/reminders/reminderTypes";
import { CLOUD_STORAGE_CHANGED_EVENT, CLOUD_STORAGE_LIMIT_MESSAGE } from "../features/settings/cloudStorage";
import { NOTES_SYNCED_EVENT } from "../features/notes/syncProtocol";
import { isCloudSyncEnabled } from "../features/settings/cloudSyncPreference";

export function useReminders(userId: string | null, offlineMode: boolean) {
  const [cache, setCache] = useState<ReminderCache | null>(null);
  const [issue, setIssue] = useState<{ userId: string; message: string; kind: "local" | "cloud" } | null>(null);
  const [syncingFor, setSyncingFor] = useState<string | null>(null);
  const wake = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = () => {
      void reminderStore.load(userId).then((value) => {
        if (active) setCache(value);
      }).catch(() => {
        if (active) setIssue({ userId, kind: "local", message: "Could not open local reminder storage. Please reopen Scribe and try again." });
      });
    };
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId) refresh();
    };
    refresh();
    window.addEventListener(REMINDERS_CHANGED_EVENT, changed);
    return () => { active = false; window.removeEventListener(REMINDERS_CHANGED_EVENT, changed); };
  }, [userId]);

  useEffect(() => {
    if (!userId || !supabase || offlineMode) return;
    let active = true;
    let busy = false;
    let requested = false;
    let retryAt = 0;
    let failures = 0;
    let lastPull = 0;
    let timer: number | undefined;
    const flush = async (force = false) => {
      if (!active || !isCloudSyncEnabled(userId) || !navigator.onLine) return;
      if (busy) { requested = true; return; }
      if (Date.now() < retryAt) return;
      busy = true;
      let cloudRequestPending = false;
      try {
        const local = await reminderStore.load(userId);
        if (!active) return;
        const operations = Object.values(local.pending).slice(0, 50);
        if (!force && !operations.length && Date.now() - lastPull < 300_000) return;
        setSyncingFor(userId);
        cloudRequestPending = true;
        const reply = await syncReminders(userId, operations, local.cursor);
        cloudRequestPending = false;
        // Finish acknowledging this account even if the user signed out meanwhile.
        const committed = await reminderStore.commit(userId, reply);
        if (reply.acknowledged.length) window.dispatchEvent(new Event(CLOUD_STORAGE_CHANGED_EVENT));
        if (!active) return;
        setCache(committed);
        setIssue(null);
        failures = 0;
        retryAt = 0;
        lastPull = Date.now();
        if (reply.hasMore || operations.length === 50) requested = true;
        // New notes may still be in the separate notes queue. Keep their reminders
        // pending until the note exists in the cloud; never drop the local choice.
        if (operations.length && !reply.acknowledged.length) retryAt = Date.now() + 15_000;
      } catch (cause) {
        if (!active || !isCloudSyncEnabled(userId)) return;
        failures++;
        retryAt = Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(failures - 1, 5));
        const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
        if (active) setIssue({ userId, kind: cloudRequestPending ? "cloud" : "local", message: !cloudRequestPending ? "Could not update local reminder storage. Please reopen Scribe and try again." : message.includes("SCRIBE_STORAGE_LIMIT_REACHED") ? CLOUD_STORAGE_LIMIT_MESSAGE : /schema cache|function .*does not exist/i.test(message)
          ? "Reminders are saved locally. Apply the reminder migration in Supabase to enable cloud sync."
          : "Reminder sync is paused. Your reminders are saved on this device. Check your connection and retry sync; Scribe also retries automatically." });
      } finally {
        busy = false;
        if (active) {
          setSyncingFor(null);
          if (requested) { requested = false; schedule(); }
        }
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void flush(true); }, 750);
    };
    wake.current = () => { retryAt = 0; void flush(true); };
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId) {
        // A commit emits this event too. Only queued edits need another write.
        void reminderStore.load(userId).then((value) => {
          if (active && Object.keys(value.pending).length) schedule();
        }).catch(() => undefined);
      }
    };
    const focused = () => { if (document.visibilityState === "visible") schedule(); };
    const notesSynced = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== userId || failures) return;
      void reminderStore.load(userId).then((value) => {
        if (active && Object.keys(value.pending).length) { retryAt = 0; schedule(); }
      }).catch(() => undefined);
    };
    window.addEventListener(REMINDERS_CHANGED_EVENT, changed);
    window.addEventListener(NOTES_SYNCED_EVENT, notesSynced);
    window.addEventListener("focus", focused);
    window.addEventListener("online", schedule);
    document.addEventListener("visibilitychange", focused);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void flush();
    }, 15_000);
    const subscription = supabase.channel(`reminders:${userId}`).on("postgres_changes", {
      event: "*", schema: "public", table: "note_reminders", filter: `user_id=eq.${userId}`,
    }, schedule).subscribe((status) => { if (status === "SUBSCRIBED") schedule(); });
    schedule();
    return () => {
      active = false;
      wake.current = () => undefined;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, changed);
      window.removeEventListener(NOTES_SYNCED_EVENT, notesSynced);
      window.removeEventListener("focus", focused);
      window.removeEventListener("online", schedule);
      document.removeEventListener("visibilitychange", focused);
      void supabase?.removeChannel(subscription);
    };
  }, [userId, offlineMode]);

  const save = useCallback(async (noteId: string, dueAt: string | null, leadMinutes = 0): Promise<string | null> => {
    if (!userId) return "Open your local profile or sign in before setting a reminder.";
    if (dueAt !== null && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now())) return "Choose a date and time in the future.";
    if (!Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > 60) return "Choose a valid reminder lead time.";
    try {
      await reminderStore.set(userId, noteId, dueAt, leadMinutes);
      wake.current();
      return null;
    } catch { return "Could not save the reminder on this device. Please try again."; }
  }, [userId]);

  return {
    retrySync: () => wake.current(),
    loading: Boolean(userId && cache?.userId !== userId),
    reminders: cache?.userId === userId ? cache.reminders : {},
    pending: cache?.userId === userId ? cache.pending : {},
    syncing: !offlineMode && syncingFor === userId && userId !== null,
    error: issue?.userId === userId && (!offlineMode || issue.kind === "local") ? issue.message : null,
    cloudSyncError: !offlineMode && issue?.userId === userId && issue.kind === "cloud" ? issue.message : null,
    clearError: () => setIssue(null),
    save,
  };
}
