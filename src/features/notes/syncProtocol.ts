import type { Note, NoteFolder } from "../../types/note";
import type { OutboxOperation } from "./offlineStore";
import { markdownToDocument } from "./richTextDocument";

export type SyncBatch = {
  id: string;
  operations: OutboxOperation[];
  /** Exact wire payload survives retries and app upgrades. */
  payload?: Record<string, unknown>[];
};
export function encodeSyncOperations(operations: OutboxOperation[]) {
  return operations.map((operation) => {
    const note = operation.snapshot as Note | undefined;
    const folder = operation.snapshot as NoteFolder | undefined;
    return {
      revisionId: operation.revisionId, entity: operation.entity, id: operation.entityId, kind: operation.kind,
      baseVersion: operation.baseVersion ?? null, baseUpdatedAt: operation.baseUpdatedAt,
      snapshot: operation.kind === "delete" ? null : operation.entity === "note" ? {
        title: note!.title, content: markdownToDocument(note!.body), folder_id: note!.folderId,
        is_pinned: note!.pinned, is_draft: note!.isDraft, deleted_at: note!.deletedAt, created_at: note!.createdAt,
      } : { name: folder!.name, icon: folder!.icon, color: folder!.color, created_at: folder!.createdAt },
    };
  });
}
export type SyncChange = {
  entity: "note" | "folder";
  id: string;
  snapshot: Note | NoteFolder | null;
};
export type SyncReply = {
  cursor: string;
  full: boolean;
  hasMore: boolean;
  changes: SyncChange[];
  results: {
    revisionId: string;
    status: "applied" | "conflict";
    snapshot: Note | NoteFolder | null;
  }[];
};
