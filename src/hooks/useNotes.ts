import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { User } from "@supabase/supabase-js";
import { sortNotes } from "../features/notes/noteSorting";
import { useNoteSortPreferences } from "./useNoteSortPreferences";
import { NOTES_SYNCED_EVENT } from "../features/notes/syncProtocol";
import { supabase } from "../features/auth/supabaseClient";
import { notesRepository } from "../features/notes/notesRepository";
import { CLOUD_STORAGE_CHANGED_EVENT, CLOUD_STORAGE_LIMIT_MESSAGE, isCloudStorageLimitError } from "../features/settings/cloudStorage";
import {
  offlineStore,
} from "../features/notes/offlineStore";
import type {
  FolderColor,
  FolderIconName,
  Note,
  NoteFolder,
  NotePatch,
  NoteSection,
} from "../types/note";

const makeId = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const CLOUD_BATCH_INTERVAL_MS = 15_000;
const CLOUD_PULL_INTERVAL_MS = 60_000;
const folderOrderStorageKey = (userId: string) =>
  `scribe-folder-order:${userId}`;
const unfiledOrderStorageKey = (userId: string) =>
  `scribe-unfiled-position:${userId}`;
function applyLocalFolderOrder(userId: string, folders: NoteFolder[]) {
  let savedIds: string[] = [];
  let savedUnfiledPosition: number | null = null;
  try {
    const saved = localStorage.getItem(folderOrderStorageKey(userId));
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    if (Array.isArray(parsed))
      savedIds = parsed.filter((id): id is string => typeof id === "string");
    const position =
      localStorage.getItem(unfiledOrderStorageKey(userId)) ??
      localStorage.getItem("scribe-unfiled-position");
    if (position !== null && Number.isFinite(Number(position)))
      savedUnfiledPosition = Number(position);
  } catch {
    /* An unreadable local preference falls back to creation order. */
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ordered = savedIds
    .map((id) => byId.get(id))
    .filter((folder): folder is NoteFolder => Boolean(folder));
  const seen = new Set(ordered.map((folder) => folder.id));
  ordered.push(...folders.filter((folder) => !seen.has(folder.id)));
  const orderedFolders = ordered.map((folder, sortOrder) => ({
    ...folder,
    sortOrder,
  }));
  return {
    folders: orderedFolders,
    unfiledPosition: Math.max(
      0,
      Math.min(orderedFolders.length, savedUnfiledPosition ?? 0),
    ),
  };
}
function saveLocalFolderOrder(
  userId: string,
  folders: NoteFolder[],
  unfiledPosition: number,
) {
  try {
    localStorage.setItem(
      folderOrderStorageKey(userId),
      JSON.stringify(folders.map((folder) => folder.id)),
    );
    localStorage.setItem(
      unfiledOrderStorageKey(userId),
      String(unfiledPosition),
    );
  } catch {
    /* Keep the in-memory order if this device blocks local storage. */
  }
}
const UNFILED_ID = "system:unfiled";
function combinedFolderOrder(folders: NoteFolder[], unfiledPosition: number) {
  const order = folders.map((folder) => folder.id);
  order.splice(
    Math.max(0, Math.min(folders.length, unfiledPosition)),
    0,
    UNFILED_ID,
  );
  return order;
}
function applyCombinedFolderOrder(order: string[], folders: NoteFolder[]) {
  const known = new Map(folders.map((folder) => [folder.id, folder]));
  const customIds = order.filter((id) => id !== UNFILED_ID && known.has(id));
  for (const folder of folders)
    if (!customIds.includes(folder.id)) customIds.push(folder.id);
  const unfiledPosition = Math.max(0, order.indexOf(UNFILED_ID));
  return {
    folders: customIds.map((id, sortOrder) => ({
      ...known.get(id)!,
      sortOrder,
    })),
    unfiledPosition: Math.min(customIds.length, unfiledPosition),
  };
}
const messageFor = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "The database request failed without an error message.";
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return `${message}. The Scribe database migration has not been applied to this Supabase project yet.`;
  }
  return message;
};

export function useNotes(
  user: User | null,
  configured: boolean,
  offlineMode = false,
) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [unfiledPosition, setUnfiledPosition] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<NoteSection>("all");
  const [folderId, setFolderId] = useState<string | null>(null);
  const sortKey = `${user?.id ?? "local"}:${section === "all" && folderId ? `folder:${folderId}` : section}`;
  const { sortOrder, setSortOrder } = useNoteSortPreferences(sortKey);
  const [search, setSearch] = useState("");
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<{ userId: string; message: string } | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [online, setOnline] = useState(true);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [notesForUser, setNotesForUser] = useState<string | null>(null);
  const [pulledForUser, setPulledForUser] = useState<string | null>(null);
  const syncLock = useRef(false);
  const syncOwnerId = useRef(makeId());
  const refreshingRef = useRef(false);
  const flushOutboxRef = useRef<(forcePull?: boolean) => void>(() => undefined);
  const retryAt = useRef(0);
  const failureCount = useRef(0);
  const lastPullAt = useRef(0);
  const lastSyncCursor = useRef<string | null>(null);
  const pendingRealtimeSequence = useRef<bigint | null>(null);
  const realtimeDebounce = useRef<number | null>(null);
  const lastCloudError = useRef<string | null>(null);
  const lastLocalError = useRef<string | null>(null);
  const editGeneration = useRef(new Map<string, number>());
  const localRetries = useRef(new Map<string, { run: () => Promise<void>; running: boolean; ownerId: string }>());
  const activeUserId = useRef(user?.id);
  const notesRef = useRef(notes);
  useEffect(() => {
    activeUserId.current = user?.id;
    notesRef.current = notes;
  }, [notes, user?.id]);
  const loading = Boolean(
    user && configured && !error && (loadedForUser !== user.id ||
      (!notes.length && pulledForUser !== user.id && online && !offlineMode)),
  );
  const syncStatus: "on-device" | "syncing" | "synced" | "offline" | "error" =
    !user || !configured
      ? "on-device"
      : offlineMode || !online
        ? "offline"
        : loading || pendingWrites > 0
          ? "syncing"
          : error
            ? "error"
            : hasPendingSync
              ? "on-device"
              : "synced";
  const clearError = useCallback(() => setError(null), []);
  const showError = useCallback((message: string) => setError(message), []);
  const persistLocally = useCallback((ownerId: string, key: string, run: () => Promise<void>) => {
    const taskKey = `${ownerId}:${key}`;
    const task = { run, running: true, ownerId };
    localRetries.current.set(taskKey, task);
    if (activeUserId.current === ownerId) setHasPendingSync(true);
    const execute = () => {
      task.running = true;
      void task.run().then(() => {
        if (localRetries.current.get(taskKey) === task) localRetries.current.delete(taskKey);
        if (activeUserId.current === ownerId) {
          setHasPendingSync(true);
          if (![...localRetries.current.values()].some((pending) => pending.ownerId === ownerId)) {
            const recoveredError = lastLocalError.current;
            lastLocalError.current = null;
            setError((current) => current === recoveredError ? null : current);
          }
        }
      }).catch((cause: unknown) => {
        if (localRetries.current.get(taskKey) === task && activeUserId.current === ownerId) {
          lastLocalError.current = `Local save failed; keep Scribe open while it retries. These latest changes are not yet protected against a crash: ${messageFor(cause)}`;
          setError(lastLocalError.current);
        }
      }).finally(() => { task.running = false; });
    };
    // Retried work still uses the newest task for this entity; an older failed
    // edit must never resurrect a note that was subsequently deleted.
    execute();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const [key, task] of [...localRetries.current]) if (!task.running) {
        localRetries.current.delete(key);
        persistLocally(task.ownerId, key.slice(task.ownerId.length + 1), task.run);
      }
    }, 3000);
    void navigator.storage?.persist?.().catch(() => undefined);
    return () => window.clearInterval(timer);
  }, [persistLocally]);
  const beginWrite = useCallback(() => {
    setPendingWrites((count) => count + 1);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      setPendingWrites((count) => Math.max(0, count - 1));
    };
  }, []);

  const editingInProgress = () => Boolean(document.querySelector('[data-sync-editing="true"], .editor-title-wrap.is-editing, .composer-window'));

  const flushOutbox = useCallback(async (forcePull = false) => {
    if (!user || !configured || offlineMode || !online || !navigator.onLine ||
      refreshingRef.current || notesForUser !== user.id || Date.now() < retryAt.current) return;
    if (editingInProgress() || syncLock.current) return;
    if (!forcePull && !hasPendingSync && Date.now() - lastPullAt.current < CLOUD_PULL_INTERVAL_MS) return;
    if ([...localRetries.current.values()].some((task) => task.ownerId === user.id)) return;
    syncLock.current = true;
    let finishWrite: (() => void) | undefined;
    let hasLease = false;
    let submittedBatchId: string | undefined;
    let cloudResponseReceived = false;
    const editsAtStart = new Map(editGeneration.current);
    try {
      hasLease = await offlineStore.acquireSyncLease(user.id, syncOwnerId.current, 60_000);
      if (!hasLease) return;
      const prepared = await offlineStore.prepareBatch(user.id);
      lastSyncCursor.current = prepared.cursor;
      if (activeUserId.current !== user.id || editingInProgress()) return;
      finishWrite = beginWrite();
      submittedBatchId = prepared.batch.id;
      const reply = await notesRepository.sync(user, prepared.batch, prepared.cursor);
      cloudResponseReceived = true;
      if (prepared.batch.operations.length || reply.changes.length) window.dispatchEvent(new Event(CLOUD_STORAGE_CHANGED_EVENT));
      finishWrite();
      finishWrite = undefined;
      // A user may enter edit mode while the request is in flight. Keep its
      // response away from the editor until that editing session has ended.
      while (activeUserId.current === user.id && editingInProgress()) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      }
      // Always acknowledge this account's durable queue, even if it signed out.
      const local = await offlineStore.commitBatch(user.id, prepared.batch, reply);
      if (prepared.batch.operations.some((operation) => operation.entity === "note")) {
        window.dispatchEvent(new CustomEvent(NOTES_SYNCED_EVENT, { detail: user.id }));
      }
      if (activeUserId.current !== user.id) return;
      setPulledForUser(user.id);
      const ordered = applyLocalFolderOrder(user.id, local.folders);
      setNotes((current) => {
        const merged = new Map(local.notes.map((note) => [note.id, note]));
        for (const [key, generation] of editGeneration.current) if (key.startsWith("note:") && generation !== editsAtStart.get(key)) {
          const id = key.slice(5);
          const latest = current.find((note) => note.id === id);
          if (latest) merged.set(id, { ...latest, version: merged.get(id)?.version ?? latest.version }); else merged.delete(id);
        }
        return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      setFolders((current) => {
        const merged = new Map(ordered.folders.map((folder) => [folder.id, folder]));
        for (const [key, generation] of editGeneration.current) if (key.startsWith("folder:") && generation !== editsAtStart.get(key)) {
          const id = key.slice(7);
          const latest = current.find((folder) => folder.id === id);
          if (latest) merged.set(id, latest); else merged.delete(id);
        }
        return [...merged.values()];
      });
      setUnfiledPosition(ordered.unfiledPosition);
      setFolderId((current) => current && (ordered.folders.some((folder) => folder.id === current) ||
        editGeneration.current.get(`folder:${current}`) !== editsAtStart.get(`folder:${current}`)) ? current : null);
      setHasPendingSync(local.outbox.length > 0);
      setSelectedId((current) => current && (local.notes.some((note) => note.id === current) ||
        (editGeneration.current.get(`note:${current}`) !== editsAtStart.get(`note:${current}`) && notesRef.current.some((note) => note.id === current)))
        ? current : local.notes.find((note) => !note.deletedAt)?.id ?? null);
      failureCount.current = 0;
      retryAt.current = 0;
      lastPullAt.current = reply.hasMore ? 0 : Date.now();
      lastSyncCursor.current = reply.cursor;
      const recoveredError = lastCloudError.current;
      setError((current) => current === recoveredError ? null : current);
      lastCloudError.current = null;
      setCloudSyncError(null);
      if (local.conflicts) setError("Another device changed the same data. Your edits were preserved in conflict copies; conflicting deletions were canceled.");
      if (reply.hasMore || (local.outbox.length && prepared.batch.operations.length === 50)) {
        // Drain large queues in bounded batches, leaving time for local edits.
        window.setTimeout(() => flushOutboxRef.current(), 500);
      }
    } catch (cause) {
      const quotaReached = isCloudStorageLimitError(cause);
      if (quotaReached && submittedBatchId) {
        await offlineStore.rejectBatch(user.id, submittedBatchId).catch(() => undefined);
        window.dispatchEvent(new Event(CLOUD_STORAGE_CHANGED_EVENT));
      }
      failureCount.current++;
      const delay = Math.min(120_000, 5000 * 2 ** Math.min(failureCount.current - 1, 5));
      retryAt.current = Date.now() + delay + Math.random() * 1500;
      if (activeUserId.current === user.id) {
        lastCloudError.current = quotaReached ? CLOUD_STORAGE_LIMIT_MESSAGE : `Cloud sync paused. Local changes are kept on this device and will retry automatically: ${messageFor(cause)}`;
        setError(lastCloudError.current);
        setCloudSyncError(submittedBatchId && !cloudResponseReceived ? { userId: user.id, message: lastCloudError.current } : null);
      }
    } finally {
      if (hasLease) await offlineStore.releaseSyncLease(user.id, syncOwnerId.current).catch(() => undefined);
      syncLock.current = false;
      finishWrite?.();
      const pendingSequence = pendingRealtimeSequence.current;
      const cursor = BigInt(lastSyncCursor.current ?? "0");
      if (pendingSequence !== null && pendingSequence <= cursor) pendingRealtimeSequence.current = null;
      else if (pendingSequence !== null && activeUserId.current === user.id)
        window.setTimeout(() => flushOutboxRef.current(true), 800);
    }
  }, [user, configured, offlineMode, online, notesForUser, beginWrite, hasPendingSync]);
  useEffect(() => { flushOutboxRef.current = (forcePull = false) => { void flushOutbox(forcePull); }; }, [flushOutbox]);

  useEffect(() => {
    const userId = user?.id;
    if (!isTauri() || !userId || !configured || loadedForUser !== userId) return;
    let active = true;
    const reconcile = async (id?: string) => {
      try {
        const found = id ? [await offlineStore.getNote(userId, id)] : (await offlineStore.load(userId)).notes;
        if (!active || activeUserId.current !== userId) return;
        const added = found.filter((note): note is Note => Boolean(note && !note.deletedAt && !notesRef.current.some((existing) => existing.id === note.id)));
        if (!added.length) return;
        for (const note of added) editGeneration.current.set(`note:${note.id}`, 1);
        setNotes((current) => [...added.filter((note) => !current.some((existing) => existing.id === note.id)), ...current]);
        setHasPendingSync(true);
        // Reuse the normal batching, lease and editing protection. No new sync
        // client or cloud read is started by the capture window.
        window.setTimeout(() => flushOutboxRef.current(), 180);
      } catch { if (active) setError("Could not load a captured note. It is saved locally; reopen Scribe to try again."); }
    };
    const listener = listen<{ userId: string; noteId: string }>("scribe:capture-saved", ({ payload }) => {
      if (payload.userId === userId) void reconcile(payload.noteId);
    });
    const onFocus = () => { void reconcile(); };
    window.addEventListener("focus", onFocus);
    // Covers a capture committed before this listener finished installing.
    void listener.then(() => { if (active) void reconcile(); });
    return () => { active = false; window.removeEventListener("focus", onFocus); void listener.then((unlisten) => unlisten()); };
  }, [user?.id, configured, loadedForUser]);

  useEffect(() => {
    const updateOnlineStatus = () => setOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const userId = user?.id;
    lastSyncCursor.current = null;
    pendingRealtimeSequence.current = null;
    if (!userId || !configured) return;
    refreshingRef.current = true;
    void offlineStore.load(userId).then((local) => {
      if (!active) return;
      const order = applyLocalFolderOrder(userId, local.folders);
      setNotes(local.notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setFolders(order.folders);
      setUnfiledPosition(order.unfiledPosition);
      setHasPendingSync(local.outbox.length > 0);
      setSelectedId((current) => current && local.notes.some((note) => note.id === current)
        ? current : local.notes.find((note) => !note.deletedAt)?.id ?? null);
      setNotesForUser(userId);
      setLoadedForUser(userId);
      lastPullAt.current = 0;
      retryAt.current = 0;
      refreshingRef.current = false;
    }).catch((cause: unknown) => {
      if (!active) return;
      refreshingRef.current = false;
      setError(`Could not open local notes storage: ${messageFor(cause)}. Cloud sync is paused to protect unsaved data.`);
    });
    return () => { active = false; refreshingRef.current = false; };
  }, [user?.id, configured]);

  useEffect(() => {
    if (loadedForUser !== user?.id || offlineMode || !online) return;
    retryAt.current = 0;
    flushOutboxRef.current();
    const timer = window.setInterval(() => flushOutboxRef.current(), CLOUD_BATCH_INTERVAL_MS);
    const onFocus = () => { if (Date.now() - lastPullAt.current >= CLOUD_PULL_INTERVAL_MS) flushOutboxRef.current(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [loadedForUser, user?.id, offlineMode, online]);

  useEffect(() => {
    const userId = user?.id;
    if (!supabase || !userId || !configured || offlineMode || loadedForUser !== userId) return;
    let active = true;
    const client = supabase;
    const channel = client
      .channel(`scribe-sync-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "sync_changes",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row || typeof row.sequence === "undefined") return;
        const sequence = BigInt(String(row.sequence));
        const cursor = BigInt(lastSyncCursor.current ?? "0");
        if (sequence <= cursor) return;
        if (pendingRealtimeSequence.current === null || sequence > pendingRealtimeSequence.current)
          pendingRealtimeSequence.current = sequence;
        if (realtimeDebounce.current !== null) window.clearTimeout(realtimeDebounce.current);
        realtimeDebounce.current = window.setTimeout(() => {
          realtimeDebounce.current = null;
          if (!active) return;
          const latestCursor = BigInt(lastSyncCursor.current ?? "0");
          if (pendingRealtimeSequence.current !== null && pendingRealtimeSequence.current <= latestCursor) {
            pendingRealtimeSequence.current = null;
            return;
          }
          flushOutboxRef.current(true);
        }, 350);
      })
      .subscribe();
    return () => {
      active = false;
      if (realtimeDebounce.current !== null) window.clearTimeout(realtimeDebounce.current);
      realtimeDebounce.current = null;
      void client.removeChannel(channel);
    };
  }, [user?.id, configured, offlineMode, loadedForUser]);

  useEffect(() => {
    if (loadedForUser !== user?.id || offlineMode || !online) return;
    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      if (editingInProgress()) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const pendingSequence = pendingRealtimeSequence.current;
        const cursor = BigInt(lastSyncCursor.current ?? "0");
        flushOutboxRef.current(pendingSequence !== null && pendingSequence > cursor);
      }, 180);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-sync-editing", "class"],
    });
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [loadedForUser, user?.id, offlineMode, online]);
  const clearUserData = useCallback(() => {
    setNotes([]);
    setFolders([]);
    setSelectedId(null);
    setLoadedForUser(null);
    setNotesForUser(null);
    setHasPendingSync(false);
    setSection("all");
    setFolderId(null);
    setSearch("");
  }, []);

  const selectedNote =
    notes.find(
      (note) =>
        note.id === selectedId &&
        (section === "trash" ? Boolean(note.deletedAt) : !note.deletedAt),
    ) ?? null;
  const visibleNotes = useMemo(
    () =>
      sortNotes(notes.filter((note) => {
        if (section === "trash") return note.deletedAt !== null;
        if (note.deletedAt) return false;
        if (section === "drafts" && !note.isDraft) return false;
        if (section === "pinned" && !note.pinned) return false;
        if (section === "unfiled" && note.folderId !== null) return false;
        if (section === "all" && folderId && note.folderId !== folderId)
          return false;
        const query = search.toLowerCase();
        return (
          !query ||
          note.title.toLowerCase().includes(query) ||
          note.body.toLowerCase().includes(query)
        );
      }), sortOrder),
    [notes, section, folderId, search, sortOrder],
  );

  const updateNote = useCallback(
    (id: string, patch: NotePatch) => {
      const previous = notesRef.current.find((note) => note.id === id);
      if (!previous) return;
      if (Object.entries(patch).every(([key, value]) => previous[key as keyof Note] === value)) return;
      editGeneration.current.set(`note:${id}`, (editGeneration.current.get(`note:${id}`) ?? 0) + 1);
      const updated = { ...previous, ...patch, updatedAt: now() };
      notesRef.current = notesRef.current.map((note) => note.id === id ? updated : note);
      setNotes((current) =>
        current.map((note) => (note.id === id ? updated : note)),
      );
      if (!user || !configured) return;
      persistLocally(user.id, `note:${id}`, () => offlineStore.putNote(user.id, updated, previous.updatedAt));

    },
    [user, configured, persistLocally],
  );

  const createNote = useCallback(
    (
      draft: Partial<
        Pick<Note, "title" | "body" | "folderId" | "pinned" | "isDraft">
      > = {},
    ) => {
      const timestamp = now();
      const note: Note = {
        id: makeId(),
        title: draft.title?.trim() ?? "",
        body: draft.body ?? "",
        folderId: draft.folderId !== undefined ? draft.folderId : folderId,
        pinned: draft.pinned ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        isDraft: draft.isDraft ?? false,
      };
      editGeneration.current.set(`note:${note.id}`, 1);
      notesRef.current = [note, ...notesRef.current];
      setNotes((current) => [note, ...current]);
      setSection("all");
      setFolderId(note.folderId);
      setSelectedId(note.id);
      if (user && configured) {
        persistLocally(user.id, `note:${note.id}`, () => offlineStore.putNote(user.id, note, null, true));
      }
      return note.id;
    },
    [folderId, user, configured, persistLocally],
  );

  const togglePinned = useCallback(
    (id: string) => {
      const note = notes.find((item) => item.id === id);
      if (note) updateNote(id, { pinned: !note.pinned });
    },
    [notes, updateNote],
  );

  const moveToTrash = useCallback(
    (id: string) => updateNote(id, { deletedAt: now() }),
    [updateNote],
  );
  const restoreFromTrash = useCallback(
    (id: string) => updateNote(id, { deletedAt: null }),
    [updateNote],
  );

  const permanentlyDelete = useCallback(
    (id: string) => {
      const previous = notes.find((note) => note.id === id);
      editGeneration.current.set(`note:${id}`, (editGeneration.current.get(`note:${id}`) ?? 0) + 1);
      notesRef.current = notesRef.current.filter((note) => note.id !== id);
      setNotes((current) => current.filter((note) => note.id !== id));
      if (user && configured) {
        persistLocally(user.id, `note:${id}`, () => offlineStore.deleteEntity(user.id, "note", id, previous?.updatedAt ?? null, previous?.version));
      }
    },
    [notes, user, configured, persistLocally],
  );

  const createFolder = useCallback(
    (name: string, icon: FolderIconName, color: FolderColor) => {
      const normalizedName = name.trim();
      if (
        !normalizedName ||
        folders.some(
          (item) => item.name.toLowerCase() === normalizedName.toLowerCase(),
        )
      )
        return false;
      const timestamp = now();
      const folder: NoteFolder = {
        id: makeId(),
        name: normalizedName,
        icon,
        color,
        sortOrder: folders.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      editGeneration.current.set(`folder:${folder.id}`, 1);
      setFolders((current) => [...current, folder]);
      if (user)
        saveLocalFolderOrder(user.id, [...folders, folder], unfiledPosition);
      setFolderId(folder.id);
      setSection("all");
      if (user && configured) {
        persistLocally(user.id, `folder:${folder.id}`, () => offlineStore.putFolder(user.id, folder, null, true));
      }
      return true;
    },
    [folders, user, configured, unfiledPosition, persistLocally],
  );

  const updateFolder = useCallback(
    (id: string, name: string, icon: FolderIconName, color: FolderColor) => {
      const normalizedName = name.trim();
      const previous = folders.find((item) => item.id === id);
      if (
        !previous ||
        !normalizedName ||
        folders.some(
          (item) =>
            item.id !== id &&
            item.name.toLowerCase() === normalizedName.toLowerCase(),
        )
      )
        return false;
      const updated = {
        ...previous,
        name: normalizedName,
        icon,
        color,
        updatedAt: now(),
      };
      editGeneration.current.set(`folder:${id}`, (editGeneration.current.get(`folder:${id}`) ?? 0) + 1);
      setFolders((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
      if (user && configured) {
        persistLocally(user.id, `folder:${id}`, () => offlineStore.putFolder(user.id, updated, previous.updatedAt));
      }
      return true;
    },
    [folders, user, configured, persistLocally],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      const previous = folders.find((item) => item.id === id);
      editGeneration.current.set(`folder:${id}`, (editGeneration.current.get(`folder:${id}`) ?? 0) + 1);
      const detachedNotes = notes
        .filter((note) => note.folderId === id)
        .map((note) => ({ ...note, folderId: null, updatedAt: now() }));
      for (const note of detachedNotes) editGeneration.current.set(`note:${note.id}`, (editGeneration.current.get(`note:${note.id}`) ?? 0) + 1);
      setFolders((current) => current.filter((item) => item.id !== id));
      const nextFolders = folders.filter((item) => item.id !== id);
      const nextUnfiledPosition = Math.max(
        0,
        Math.min(
          nextFolders.length,
          unfiledPosition -
            (folders.findIndex((item) => item.id === id) < unfiledPosition
              ? 1
              : 0),
        ),
      );
      setUnfiledPosition(nextUnfiledPosition);
      if (user) saveLocalFolderOrder(user.id, nextFolders, nextUnfiledPosition);
      setNotes((current) =>
        current.map(
          (note) =>
            detachedNotes.find((detached) => detached.id === note.id) ?? note,
        ),
      );
      setFolderId((current) => (current === id ? null : current));
      if (user && configured) {
        if (!previous) return;
        for (const note of detachedNotes) localRetries.current.delete(`${user.id}:note:${note.id}`);
        persistLocally(user.id, `folder:${id}`, () => offlineStore.deleteFolderAndDetach(user.id, previous,
          detachedNotes.flatMap((after) => {
            const latest = notesRef.current.find((note) => note.id === after.id);
            return latest ? [{ before: notes.find((note) => note.id === after.id)!, after: { ...latest, folderId: null, updatedAt: latest.updatedAt > after.updatedAt ? latest.updatedAt : after.updatedAt } }] : [];
          })));

      }
    },
    [folders, notes, user, configured, unfiledPosition, persistLocally],
  );

  const moveFolder = useCallback(
    (id: string, offset: -1 | 1) => {
      const order = combinedFolderOrder(folders, unfiledPosition);
      const index = order.indexOf(id);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      const next = applyCombinedFolderOrder(order, folders);
      setFolders(next.folders);
      setUnfiledPosition(next.unfiledPosition);
      if (user)
        saveLocalFolderOrder(user.id, next.folders, next.unfiledPosition);
    },
    [folders, unfiledPosition, user],
  );

  const reorderFolders = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const order = combinedFolderOrder(folders, unfiledPosition);
      const sourceIndex = order.indexOf(sourceId);
      const targetIndex = order.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      order.splice(sourceIndex, 1);
      order.splice(
        sourceIndex < targetIndex ? targetIndex - 1 : targetIndex,
        0,
        sourceId,
      );
      const next = applyCombinedFolderOrder(order, folders);
      setFolders(next.folders);
      setUnfiledPosition(next.unfiledPosition);
      if (user)
        saveLocalFolderOrder(user.id, next.folders, next.unfiledPosition);
    },
    [folders, unfiledPosition, user],
  );

  const selectSection = useCallback((nextSection: NoteSection) => {
    setSection(nextSection);
    setFolderId(null);
  }, []);
  const selectFolder = useCallback((nextId: string) => {
    if (nextId === "system:unfiled") {
      setSection("unfiled");
      setFolderId(null);
      return;
    }
    setSection("all");
    setFolderId((current) => (current === nextId ? null : nextId));
  }, []);

  return {
    notes,
    visibleNotes,
    sortOrder,
    setSortOrder,
    selectedNote,
    selectedId,
    setSelectedId,
    section,
    folderId,
    folder: folders.find((item) => item.id === folderId)?.name ?? "",
    clearError,
    syncStatus,
    showError,
    search,
    setSearch,
    folders,
    loading,
    cacheReady: Boolean(user && notesForUser === user.id),
    cloudReady: Boolean(user && pulledForUser === user.id),
    cloudSyncError: cloudSyncError?.userId === user?.id ? cloudSyncError?.message ?? null : null,
    error,
    createNote,
    updateNote,
    togglePinned,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
    createFolder,
    updateFolder,
    deleteFolder,
    moveFolder,
    reorderFolders,
    unfiledPosition,
    selectSection,
    selectFolder,
    clearUserData,
  };
}
