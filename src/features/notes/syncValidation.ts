const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const syncId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
export const syncDate = (value: unknown): value is string => typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
export const syncCursor = (value: unknown): value is string => typeof value === "string" && /^\d{1,20}$/.test(value);
export type FolderRow = { version?: number; id: string; name: string; icon: string; color: string; created_at: string; updated_at: string };
export type NoteRow = { version?: number; id: string; title: string; content: unknown; folder_id: string | null; is_pinned: boolean; created_at: string; updated_at: string; deleted_at: string | null; is_draft: boolean };
type Entity = "note" | "folder";
type WireReply = {
  cursor: string; full: boolean; hasMore: boolean;
  changes: { entity: Entity; id: string; snapshot: NoteRow | FolderRow | null }[];
  results: { revisionId: string; status: "applied" | "conflict"; entity: Entity; snapshot: NoteRow | FolderRow | null }[];
};
function snapshot(entity: unknown, row: unknown) {
  if (entity !== "note" && entity !== "folder") return false;
  if (row === null) return true;
  if (!record(row) || !syncId(row.id) || !syncDate(row.created_at) || !syncDate(row.updated_at) ||
    row.version !== undefined && (!Number.isSafeInteger(row.version) || Number(row.version) < 1)) return false;
  return entity === "note"
    ? typeof row.title === "string" && row.title.length <= 8192 && (row.folder_id === null || syncId(row.folder_id)) &&
      typeof row.is_pinned === "boolean" && typeof row.is_draft === "boolean" && (row.deleted_at === null || syncDate(row.deleted_at)) && Object.hasOwn(row, "content")
    : typeof row.name === "string" && row.name.length <= 120 && typeof row.icon === "string" && typeof row.color === "string";
}
/** Reject a malformed response before any part can reach the durable local cache. */
export function validateNotesReply(value: unknown): asserts value is WireReply {
  if (!record(value) || !syncCursor(value.cursor) || typeof value.full !== "boolean" || typeof value.hasMore !== "boolean" ||
      !Array.isArray(value.changes) || value.changes.length > 10_000 || !Array.isArray(value.results) || value.results.length > 50 ||
      !value.changes.every(change => record(change) && syncId(change.id) && snapshot(change.entity, change.snapshot) &&
        (change.snapshot === null || (change.snapshot as Record<string, unknown>).id === change.id)) ||
      !value.results.every(result => record(result) && syncId(result.revisionId) && ["applied", "conflict"].includes(String(result.status)) && snapshot(result.entity, result.snapshot))) {
    throw new Error("Cloud sync returned unreadable data. Your local notes have been kept. Retry sync or contact support.");
  }
}
