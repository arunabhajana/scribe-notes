import type { Note, NoteFolder } from "../../types/note";
import type { SyncBatch, SyncReply } from "./syncProtocol";
import { encodeSyncOperations } from "./syncProtocol";

type SyncState = { userId: string; cursor: string | null; inFlight?: SyncBatch };

export type OutboxOperation = {
  key: [string, "note" | "folder", string];
  userId: string;
  entity: "note" | "folder";
  entityId: string;
  kind: "upsert" | "delete";
  snapshot?: Note | NoteFolder;
  /** null means this row was created locally and has no cloud version yet. */
  baseUpdatedAt: string | null;
  baseVersion?: number;
  queuedUpdatedAt: string;
  revisionId: string;
  sequence: number;
};

type CacheNote = Note & { key: string; userId: string };
type CacheFolder = NoteFolder & { key: string; userId: string };

const databaseName = "scribe-offline-v1";
const databaseVersion = 3;
let databasePromise: Promise<IDBDatabase> | undefined;

function ensureStore(
  db: IDBDatabase,
  transaction: IDBTransaction,
  name: string,
  options: IDBObjectStoreParameters,
) {
  return db.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : db.createObjectStore(name, options);
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) return;
      const notes = ensureStore(db, transaction, "notes", { keyPath: "key" });
      if (notes && !notes.indexNames.contains("userId"))
        notes.createIndex("userId", "userId");
      const folders = ensureStore(db, transaction, "folders", {
        keyPath: "key",
      });
      if (folders && !folders.indexNames.contains("userId"))
        folders.createIndex("userId", "userId");
      const outbox = ensureStore(db, transaction, "outbox", { keyPath: "key" });
      if (outbox) {
        if (!outbox.indexNames.contains("userId"))
          outbox.createIndex("userId", "userId");
        if (!outbox.indexNames.contains("sequence"))
          outbox.createIndex("sequence", "sequence");
      }
      ensureStore(db, transaction, "syncLeases", { keyPath: "userId" });
      ensureStore(db, transaction, "syncState", { keyPath: "userId" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local notes storage."));
    request.onblocked = () => undefined;
  }).catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });
  databasePromise = promise;
  return promise;
}

const rowKey = (userId: string, id: string) => `${userId}:${id}`;
function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("Local notes transaction failed."));
  });
}

export const offlineStore = {
  async loadFolders(userId: string): Promise<NoteFolder[]> {
    const db = await openDatabase();
    const request = db.transaction("folders", "readonly").objectStore("folders").index("userId").getAll(userId) as IDBRequest<CacheFolder[]>;
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result.map(({ key: _key, userId: _owner, ...folder }) => { void _key; void _owner; return folder; }).sort((a, b) => a.sortOrder - b.sortOrder));
      request.onerror = () => reject(request.error);
    });
  },
  async getNote(userId: string, id: string): Promise<Note | null> {
    const db = await openDatabase();
    const request = db.transaction("notes", "readonly").objectStore("notes").get(rowKey(userId, id)) as IDBRequest<CacheNote | undefined>;
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (!request.result) { resolve(null); return; }
        const { key: _key, userId: _userId, ...note } = request.result;
        void _key; void _userId;
        resolve(note);
      };
      request.onerror = () => reject(request.error);
    });
  },
  // Only use for a definite server rollback (such as quota rejection), never
  // for network failures where the server might have committed the receipt.
  async rejectBatch(userId: string, batchId: string) {
    const db = await openDatabase();
    const tx = db.transaction("syncState", "readwrite", { durability: "strict" });
    const done = transactionDone(tx);
    const store = tx.objectStore("syncState");
    const request = store.get(userId) as IDBRequest<SyncState | undefined>;
    request.onsuccess = () => {
      const state = request.result;
      if (state?.inFlight?.id === batchId) store.put({ ...state, inFlight: undefined });
    };
    await done;
  },
  async prepareBatch(userId: string): Promise<{ batch: SyncBatch; cursor: string | null }> {
    const db = await openDatabase();
    const tx = db.transaction(["outbox", "syncState"], "readwrite", { durability: "strict" });
    const done = transactionDone(tx);
    const stateRequest = tx.objectStore("syncState").get(userId) as IDBRequest<SyncState | undefined>;
    const queueRequest = tx.objectStore("outbox").index("userId").getAll(userId) as IDBRequest<OutboxOperation[]>;
    const result = new Promise<{ batch: SyncBatch; cursor: string | null }>((resolve, reject) => {
      let remaining = 2;
      const ready = () => {
        if (--remaining) return;
        const state = stateRequest.result ?? { userId, cursor: null };
        const rank = (op: OutboxOperation) => op.entity === "note" && op.kind === "delete" ? -1 : op.entity === "folder" ? (op.kind === "delete" ? 2 : 0) : 1;
        const batch: SyncBatch = state.inFlight ?? {
          id: crypto.randomUUID(),
          operations: queueRequest.result.sort((a, b) => rank(a) - rank(b) || a.sequence - b.sequence).slice(0, 50),
        };
        batch.payload ??= encodeSyncOperations(batch.operations);
        // Persist the exact request BEFORE sending it. Ambiguous failures replay
        // this batch even if the user has since edited/deleted the same entity.
        tx.objectStore("syncState").put({ ...state, inFlight: batch });
        resolve({ batch, cursor: state.cursor });
      };
      stateRequest.onsuccess = queueRequest.onsuccess = ready;
      tx.addEventListener("abort", () => reject(tx.error ?? new Error("Could not prepare sync batch.")), { once: true });
    });
    return (await Promise.all([result, done]))[0];
  },

  async commitBatch(userId: string, batch: SyncBatch, reply: SyncReply) {
    const db = await openDatabase();
    const tx = db.transaction(["notes", "folders", "outbox", "syncState"], "readwrite", { durability: "strict" });
    const done = transactionDone(tx);
    const requests = ["notes", "folders", "outbox"].map((store) =>
      tx.objectStore(store).index("userId").getAll(userId));
    const stateRequest = tx.objectStore("syncState").get(userId) as IDBRequest<SyncState | undefined>;
    let conflicts = 0;
    let remaining = requests.length + 1;
    const ready = () => {
      if (--remaining) return;
      // A lease can expire during suspension. Ignore duplicate/stale replies
      // already committed by another window rather than rewinding its cursor.
      if (stateRequest.result?.inFlight?.id !== batch.id) return;
      if (reply.results.length !== batch.operations.length ||
        new Set(reply.results.map((result) => result.revisionId)).size !== batch.operations.length) { tx.abort(); return; }
      const notes = new Map<string, Note>((requests[0].result as CacheNote[]).map((note) => [note.id, note]));
      const folders = new Map<string, NoteFolder>((requests[1].result as CacheFolder[]).map((folder) => [folder.id, folder]));
      const pending = new Map<string, OutboxOperation>((requests[2].result as OutboxOperation[]).map((op) => [`${op.entity}:${op.entityId}`, op]));
      if (reply.full) {
        notes.clear();
        folders.clear();
      }
      const apply = (entity: "note" | "folder", id: string, snapshot: Note | NoteFolder | null) => {
        if (entity === "note") { if (snapshot) notes.set(id, snapshot as Note); else notes.delete(id); }
        else { if (snapshot) folders.set(id, snapshot as NoteFolder); else folders.delete(id); }
      };
      for (const change of reply.changes) apply(change.entity, change.id, change.snapshot);
      for (const result of reply.results) {
        const sent = batch.operations.find((op) => op.revisionId === result.revisionId);
        if (!sent) { tx.abort(); return; }
        const key = `${sent.entity}:${sent.entityId}`;
        const latest = pending.get(key);
        if (result.status === "conflict") {
          // Equal content is already converged, even if revisions differ.
          const comparable = (snapshot: Note | NoteFolder | null | undefined) => {
            if (!snapshot) return null;
            if (sent.entity === "note") {
              const note = snapshot as Note;
              return JSON.stringify([note.title, note.body, note.folderId, note.pinned, note.isDraft, note.deletedAt]);
            }
            const folder = snapshot as NoteFolder;
            return JSON.stringify([folder.name, folder.icon, folder.color, folder.sortOrder]);
          };
          if (latest?.kind === "upsert" && result.snapshot && comparable(latest.snapshot) === comparable(result.snapshot)) {
            pending.delete(key);
            if (!reply.changes.some((change) => change.entity === sent.entity && change.id === sent.entityId)) apply(sent.entity, sent.entityId, result.snapshot);
            continue;
          }
          conflicts++;
          // Preserve the newest local edits in the SAME transaction that retires
          // their old queue entry. A crash cannot strand an unsaved conflict copy.
          if (latest?.kind === "upsert" && latest.snapshot) {
            const id = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            const copy = { ...latest.snapshot, id, version: undefined, createdAt: timestamp, updatedAt: timestamp };
            if (sent.entity === "note") {
              const note = copy as Note;
              note.title = `${note.title || "Untitled note"} (conflict copy)`;
              note.deletedAt = null;
            } else (copy as NoteFolder).name += ` (conflict ${id.slice(0, 6)})`;
            pending.set(`${sent.entity}:${id}`, {
              ...latest, key: [userId, sent.entity, id], entityId: id, snapshot: copy,
              baseUpdatedAt: null, baseVersion: undefined, revisionId: crypto.randomUUID(), sequence: Date.now(),
            });
          }
          pending.delete(key);
          if (!reply.changes.some((change) => change.entity === sent.entity && change.id === sent.entityId))
            apply(sent.entity, sent.entityId, result.snapshot);
        } else if (latest?.revisionId === sent.revisionId) {
          pending.delete(key);
          // A receipt may describe an earlier version than this pull (another
          // device edited after our request). The incremental change wins.
          if (!reply.changes.some((change) => change.entity === sent.entity && change.id === sent.entityId))
            apply(sent.entity, sent.entityId, result.snapshot);
        } else if (latest) {
          pending.set(key, { ...latest, snapshot: latest.snapshot ? { ...latest.snapshot, version: result.snapshot?.version } : latest.snapshot, baseUpdatedAt: result.snapshot?.updatedAt ?? null, baseVersion: result.snapshot?.version });
        }
      }
      // Folder references in conflict copies/pending notes may have disappeared.
      for (const op of pending.values()) if (op.entity === "folder" && op.kind === "upsert")
        folders.set(op.entityId, op.snapshot as NoteFolder);
      for (const op of pending.values()) if (op.entity === "folder" && op.kind === "delete") folders.delete(op.entityId);
      for (const op of pending.values()) {
        if (op.entity === "note" && op.kind === "upsert") {
          const note = op.snapshot as Note;
          if (note.folderId && !folders.has(note.folderId)) op.snapshot = { ...note, folderId: null };
        }
        apply(op.entity, op.entityId, op.kind === "delete" ? null : op.snapshot!);
      }
      for (const note of notes.values()) if (note.folderId && !folders.has(note.folderId)) note.folderId = null;
      // Replace only this account's records, atomically with cursor + outbox.
      for (let index = 0; index < 3; index++) {
        const store = tx.objectStore(["notes", "folders", "outbox"][index]);
        for (const row of requests[index].result as { key: IDBValidKey }[]) store.delete(row.key);
      }
      for (const note of notes.values()) tx.objectStore("notes").put({ ...note, userId, key: rowKey(userId, note.id) });
      for (const folder of folders.values()) tx.objectStore("folders").put({ ...folder, userId, key: rowKey(userId, folder.id) });
      for (const op of pending.values()) tx.objectStore("outbox").put(op);
      tx.objectStore("syncState").put({ userId, cursor: reply.cursor } satisfies SyncState);
    };
    for (const request of requests) request.onsuccess = ready;
    stateRequest.onsuccess = ready;
    await done;
    return { ...(await offlineStore.load(userId)), conflicts };
  },
  async load(
    userId: string,
  ): Promise<{
    notes: Note[];
    folders: NoteFolder[];
    outbox: OutboxOperation[];
  }> {
    const db = await openDatabase();
    const tx = db.transaction(["notes", "folders", "outbox"], "readonly");
    const done = transactionDone(tx);
    const notesRequest = tx
      .objectStore("notes")
      .index("userId")
      .getAll(userId) as IDBRequest<CacheNote[]>;
    const foldersRequest = tx
      .objectStore("folders")
      .index("userId")
      .getAll(userId) as IDBRequest<CacheFolder[]>;
    const outboxRequest = tx
      .objectStore("outbox")
      .index("userId")
      .getAll(userId) as IDBRequest<OutboxOperation[]>;
    const [notes, folders, outbox] = await Promise.all([
      new Promise<CacheNote[]>((resolve, reject) => {
        notesRequest.onsuccess = () => resolve(notesRequest.result);
        notesRequest.onerror = () => reject(notesRequest.error);
      }),
      new Promise<CacheFolder[]>((resolve, reject) => {
        foldersRequest.onsuccess = () => resolve(foldersRequest.result);
        foldersRequest.onerror = () => reject(foldersRequest.error);
      }),
      new Promise<OutboxOperation[]>((resolve, reject) => {
        outboxRequest.onsuccess = () => resolve(outboxRequest.result);
        outboxRequest.onerror = () => reject(outboxRequest.error);
      }),
    ]);
    await done;
    const noteMap = new Map(notes.map((row) => {
        const note = { ...row } as Partial<CacheNote>;
        delete note.key;
        delete note.userId;
        return [row.id, note as Note] as const;
      }));
    const folderMap = new Map(folders.map((row) => {
        const folder = { ...row } as Partial<CacheFolder>;
        delete folder.key;
        delete folder.userId;
        return [row.id, folder as NoteFolder] as const;
      }));
    // Reconcile pre-v3 caches too; queued snapshots/deletes are authoritative.
    for (const operation of outbox) {
      if (operation.entity === "note") {
        if (operation.kind === "delete") noteMap.delete(operation.entityId);
        else noteMap.set(operation.entityId, operation.snapshot as Note);
      } else if (operation.kind === "delete") folderMap.delete(operation.entityId);
      else folderMap.set(operation.entityId, operation.snapshot as NoteFolder);
    }
    for (const note of noteMap.values()) if (note.folderId && !folderMap.has(note.folderId)) note.folderId = null;
    return {
      notes: [...noteMap.values()],
      folders: [...folderMap.values()],
      outbox: outbox.sort((a, b) => a.sequence - b.sequence),
    };
  },

  async putNote(
    userId: string,
    note: Note,
    baseUpdatedAt: string | null,
    created = false,
  ) {
    const db = await openDatabase();
    const tx = db.transaction(["notes", "outbox"], "readwrite", { durability: "strict" });
    const cache = tx.objectStore("notes");
    const cached = cache.get(rowKey(userId, note.id)) as IDBRequest<CacheNote | undefined>;
    const store = tx.objectStore("outbox");
    const key: OutboxOperation["key"] = [userId, "note", note.id];
    const get = store.get(key) as IDBRequest<OutboxOperation | undefined>;
    let remaining = 2;
    const ready = () => {
      if (--remaining) return;
      const previous = get.result;
      // The durable cache can have a newer acknowledgement than the rendered
      // editor. Never replace that server revision with stale UI metadata.
      const version = previous ? previous.baseVersion : created ? undefined : cached.result?.version ?? note.version;
      const snapshot = { ...note, version };
      cache.put({ ...snapshot, userId, key: rowKey(userId, note.id) } satisfies CacheNote);
      store.put({ key, userId, entity: "note", entityId: note.id, kind: "upsert", snapshot,
        baseUpdatedAt: previous ? previous.baseUpdatedAt : created ? null : cached.result?.updatedAt ?? baseUpdatedAt,
        baseVersion: version, queuedUpdatedAt: note.updatedAt, revisionId: crypto.randomUUID(), sequence: previous?.sequence ?? Date.now(),
      } satisfies OutboxOperation);
    };
    get.onsuccess = cached.onsuccess = ready;
    await transactionDone(tx);
  },

  async putFolder(
    userId: string,
    folder: NoteFolder,
    baseUpdatedAt: string | null,
    created = false,
  ) {
    const db = await openDatabase();
    const tx = db.transaction(["folders", "outbox"], "readwrite", { durability: "strict" });
    tx.objectStore("folders").put({
      ...folder,
      userId,
      key: rowKey(userId, folder.id),
    } satisfies CacheFolder);
    const store = tx.objectStore("outbox");
    const key: OutboxOperation["key"] = [userId, "folder", folder.id];
    const get = store.get(key) as IDBRequest<OutboxOperation | undefined>;
    get.onsuccess = () => {
      const previous = get.result;
      store.put({
        key,
        userId,
        entity: "folder",
        entityId: folder.id,
        kind: "upsert",
        snapshot: folder,
        baseUpdatedAt: previous ? previous.baseUpdatedAt : (created ? null : baseUpdatedAt),
        baseVersion: previous ? previous.baseVersion : folder.version,
        queuedUpdatedAt: folder.updatedAt,
        revisionId: crypto.randomUUID(),
        sequence: previous?.sequence ?? Date.now(),
      } satisfies OutboxOperation);
    };
    await transactionDone(tx);
  },

  async deleteEntity(
    userId: string,
    entity: OutboxOperation["entity"],
    entityId: string,
    baseUpdatedAt: string | null,
    baseVersion?: number,
  ) {
    const db = await openDatabase();
    const cacheName = entity === "note" ? "notes" : "folders";
    const tx = db.transaction([cacheName, "outbox"], "readwrite", { durability: "strict" });
    tx.objectStore(cacheName).delete(rowKey(userId, entityId));
    const store = tx.objectStore("outbox");
    const key: OutboxOperation["key"] = [userId, entity, entityId];
    const get = store.get(key) as IDBRequest<OutboxOperation | undefined>;
    get.onsuccess = () => {
      // Keep deletes even for local creates: the create may already be in flight.
      // The batch receipt determines whether the server saw the earlier create.
        store.put({
          key,
          userId,
          entity,
          entityId,
          kind: "delete",
          baseUpdatedAt: get.result ? get.result.baseUpdatedAt : baseUpdatedAt,
          baseVersion: get.result ? get.result.baseVersion : baseVersion,
          queuedUpdatedAt: new Date().toISOString(),
          revisionId: crypto.randomUUID(),
          sequence: get.result?.sequence ?? Date.now(),
        } satisfies OutboxOperation);
    };
    await transactionDone(tx);
  },

  async deleteFolderAndDetach(userId: string, folder: NoteFolder, notes: { before: Note; after: Note }[]) {
    const db = await openDatabase();
    const tx = db.transaction(["notes", "folders", "outbox"], "readwrite", { durability: "strict" });
    const done = transactionDone(tx);
    const store = tx.objectStore("outbox");
    tx.objectStore("folders").delete(rowKey(userId, folder.id));
    for (const { before, after } of notes) {
      tx.objectStore("notes").put({ ...after, userId, key: rowKey(userId, after.id) });
      const key: OutboxOperation["key"] = [userId, "note", after.id];
      const get = store.get(key) as IDBRequest<OutboxOperation | undefined>;
      get.onsuccess = () => store.put({
        key, userId, entity: "note", entityId: after.id, kind: "upsert", snapshot: after,
        baseUpdatedAt: get.result ? get.result.baseUpdatedAt : before.updatedAt,
        baseVersion: get.result ? get.result.baseVersion : before.version,
        revisionId: crypto.randomUUID(), queuedUpdatedAt: after.updatedAt, sequence: get.result?.sequence ?? Date.now(),
      } satisfies OutboxOperation);
    }
    const key: OutboxOperation["key"] = [userId, "folder", folder.id];
    const get = store.get(key) as IDBRequest<OutboxOperation | undefined>;
    get.onsuccess = () => store.put({
      key, userId, entity: "folder", entityId: folder.id, kind: "delete",
      baseUpdatedAt: get.result ? get.result.baseUpdatedAt : folder.updatedAt,
      baseVersion: get.result ? get.result.baseVersion : folder.version,
      revisionId: crypto.randomUUID(), queuedUpdatedAt: new Date().toISOString(), sequence: get.result?.sequence ?? Date.now(),
    } satisfies OutboxOperation);
    await done;
  },

  async acquireSyncLease(userId: string, ownerId: string, durationMs = 30_000) {
    const db = await openDatabase();
    const tx = db.transaction("syncLeases", "readwrite", { durability: "strict" });
    const store = tx.objectStore("syncLeases");
    const get = store.get(userId) as IDBRequest<
      { userId: string; ownerId: string; expiresAt: number } | undefined
    >;
    let acquired = false;
    get.onsuccess = () => {
      const lease = get.result;
      const now = Date.now();
      if (!lease || lease.expiresAt <= now || lease.ownerId === ownerId) {
        store.put({ userId, ownerId, expiresAt: now + durationMs });
        acquired = true;
      }
    };
    await transactionDone(tx);
    return acquired;
  },

  async releaseSyncLease(userId: string, ownerId: string) {
    const db = await openDatabase();
    const tx = db.transaction("syncLeases", "readwrite", { durability: "strict" });
    const store = tx.objectStore("syncLeases");
    const get = store.get(userId) as IDBRequest<
      { userId: string; ownerId: string } | undefined
    >;
    get.onsuccess = () => {
      if (get.result?.ownerId === ownerId) store.delete(userId);
    };
    await transactionDone(tx);
  },

};
