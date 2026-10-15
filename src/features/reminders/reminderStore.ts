import type { NoteReminder, ReminderCache, ReminderReply } from "./reminderTypes";
import { assertWorkspaceWritable } from "../auth/workspaceDeletionState";

export const REMINDERS_CHANGED_EVENT = "scribe:reminders-changed";
let database: Promise<IDBDatabase> | undefined;
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("scribe-reminders");
channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (typeof event.data === "string") window.dispatchEvent(new CustomEvent(REMINDERS_CHANGED_EVENT, { detail: event.data }));
});

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("scribe-reminders-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("accounts", { keyPath: "userId" });
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
  });
  return database;
}
const empty = (userId: string): ReminderCache => ({ userId, reminders: {}, pending: {}, cursor: null });

async function transaction(userId: string, update?: (cache: ReminderCache) => ReminderCache) {
  const db = await openDatabase();
  if (update) assertWorkspaceWritable(userId);
  return new Promise<ReminderCache>((resolve, reject) => {
    const tx = db.transaction("accounts", update ? "readwrite" : "readonly", { durability: "strict" });
    const store = tx.objectStore("accounts");
    const request = store.get(userId) as IDBRequest<(ReminderCache & { deleted?: boolean }) | undefined>;
    let result: ReminderCache;
    request.onsuccess = () => {
      if (request.result?.deleted) {
        if (update) { tx.abort(); return; }
        result = empty(userId); return;
      }
      result = request.result ?? empty(userId);
      if (update) { result = update(result); store.put(result); }
    };
    tx.oncomplete = () => {
      if (update) {
        window.dispatchEvent(new CustomEvent(REMINDERS_CHANGED_EVENT, { detail: userId }));
        channel?.postMessage(userId);
      }
      resolve(result);
    };
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Could not save reminders on this device."));
  });
}

export const reminderStore = {
  async deleteWorkspace(userId: string) {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("accounts", "readwrite", { durability: "strict" });
      // A content-free tombstone also rejects writes from suspended windows.
      tx.objectStore("accounts").put({ userId, deleted: true });
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Could not delete local reminders."));
    });
  },
  load: (userId: string) => transaction(userId),
  async set(userId: string, noteId: string, dueAt: string | null, leadMinutes: number) {
    const reminder: NoteReminder = { noteId, dueAt, leadMinutes, updatedAt: new Date().toISOString() };
    return transaction(userId, (cache) => ({
      ...cache,
      reminders: { ...cache.reminders, [noteId]: reminder },
      pending: { ...cache.pending, [noteId]: { ...reminder, mutationId: crypto.randomUUID() } },
    }));
  },
  commit(userId: string, reply: ReminderReply) {
    return transaction(userId, (cache) => {
      const stale = cache.cursor !== null && BigInt(reply.cursor) < BigInt(cache.cursor);
      const reminders = reply.full && !stale ? {} as Record<string, NoteReminder> : { ...cache.reminders };
      if (!stale) for (const reminder of [...reply.reminders, ...reply.resolved]) reminders[reminder.noteId] = reminder;
      const pending = { ...cache.pending };
      for (const [id, operation] of Object.entries(pending)) {
        if (reply.acknowledged.includes(operation.mutationId)) {
          delete pending[id];
          // Its row may be in a later pull page. Keep the locally saved display
          // until that page arrives rather than briefly losing the reminder.
          reminders[id] ??= cache.reminders[id];
        }
        else reminders[id] = operation;
      }
      return { ...cache, reminders, pending, cursor: stale ? cache.cursor : reply.cursor };
    });
  },
};
