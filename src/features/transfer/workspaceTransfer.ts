import { offlineStore } from "../notes/offlineStore";
import { reminderStore } from "../reminders/reminderStore";
import { assertWorkspaceWritable } from "../auth/workspaceDeletionState";
import { digest } from "./transferDigest";
import { LOCAL_IMPORT_EVENT, type ImportJob, type PortableData, type TransferSource } from "./transferTypes";
import { waitForWorkspaceWrites } from "./localWriteBarrier";

export async function loadExportSource(userId: string): Promise<TransferSource> {
  assertWorkspaceWritable(userId);
  await waitForWorkspaceWrites(userId);
  // An unfinished imported file must not prevent backing up existing notes.
  await resumeWorkspaceImports(userId).catch(() => undefined);
  const [data, reminders] = await Promise.all([offlineStore.load(userId), reminderStore.load(userId)]);
  // Folder order is a workspace preference; preserve the visible order in backups.
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`scribe-folder-order:${userId}`) ?? "[]");
    if (Array.isArray(value)) {
      const rank = new Map(value.filter((id): id is string => typeof id === "string").map((id, index) => [id, index]));
      data.folders.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      data.folders = data.folders.map((folder, sortOrder) => ({ ...folder, sortOrder }));
    }
  } catch { /* Invalid ordering preferences fall back to saved folder order. */ }
  let captureDrafts = 0;
  try {
    const draft = JSON.parse(localStorage.getItem(`scribe-quick-capture-draft:${userId}`) ?? "null");
    if (draft && typeof draft.title === "string" && typeof draft.body === "string" && (draft.title.trim() || draft.body.trim()) && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(draft.id) && !data.notes.some(note => note.id === draft.id)) {
      const now = new Date().toISOString();
      data.notes.push({ id: draft.id, title: draft.title || "Quick Capture draft", body: draft.body, folderId: data.folders.some(folder => folder.id === draft.folderId) ? draft.folderId : null, pinned: false, isDraft: true, deletedAt: null, createdAt: now, updatedAt: now });
      captureDrafts = 1;
      if (draft.reminder && typeof draft.reminder.dueAt === "string" && Number.isFinite(Date.parse(draft.reminder.dueAt)) && Number.isInteger(draft.reminder.leadMinutes) && draft.reminder.leadMinutes >= 0 && draft.reminder.leadMinutes <= 60) reminders.reminders[draft.id] = { noteId: draft.id, dueAt: draft.reminder.dueAt, leadMinutes: draft.reminder.leadMinutes, updatedAt: now };
    }
  } catch { /* A corrupt recovery draft cannot prevent exporting saved notes. */ }
  const ids = new Set(data.notes.map(note => note.id));
  return { notes: data.notes, folders: data.folders, reminders: Object.values(reminders.reminders).filter(reminder => ids.has(reminder.noteId) && reminder.dueAt), kind: "workspace", name: "This workspace", captureDrafts };
}
export async function importFingerprint(data: PortableData, restoreReminders: boolean) {
  // Ignore export timestamps and regenerated Markdown timestamps. Re-selecting
  // the same portable content/settings is detected even after app restart.
  return digest(JSON.stringify({ notes: [...data.notes].sort((a, b) => a.id.localeCompare(b.id)).map(note => ({ id: note.id, title: note.title, body: note.body, folderId: note.folderId, pinned: note.pinned, isDraft: note.isDraft, deleted: Boolean(note.deletedAt) })),
    folders: [...data.folders].sort((a, b) => a.id.localeCompare(b.id)).map(folder => ({ id: folder.id, name: folder.name, icon: folder.icon, color: folder.color, order: folder.sortOrder })),
    reminders: restoreReminders ? [...data.reminders].sort((a, b) => a.noteId.localeCompare(b.noteId)).map(reminder => ({ id: reminder.noteId, due: reminder.dueAt, lead: reminder.leadMinutes })) : [] }));
}
const recovering = new Map<string, Promise<void>>();
async function finishImport(job: ImportJob) {
  assertWorkspaceWritable(job.userId);
  await reminderStore.importBatch(job.userId, job.reminders);
  await offlineStore.commitImport(job.userId, job.id);
  window.dispatchEvent(new CustomEvent(LOCAL_IMPORT_EVENT, { detail: job.userId }));
}
export async function resumeWorkspaceImports(userId: string) {
  const previous = recovering.get(userId);
  if (previous) return previous;
  const task = (async () => { for (const job of await offlineStore.pendingImports(userId)) await finishImport(job); })();
  recovering.set(userId, task);
  try { await task; } finally { if (recovering.get(userId) === task) recovering.delete(userId); }
}
export async function importWorkspaceData(userId: string, data: PortableData, restoreReminders: boolean, allowCopies: boolean) {
  assertWorkspaceWritable(userId);
  await resumeWorkspaceImports(userId);
  const fingerprint = await importFingerprint(data, restoreReminders);
  const current = await offlineStore.load(userId);
  const noteIds = new Map(data.notes.map(note => [note.id, crypto.randomUUID()]));
  const folderIds = new Map(data.folders.map(folder => [folder.id, crypto.randomUUID()]));
  const now = new Date().toISOString();
  const baseOrder = current.folders.reduce((largest, folder) => Math.max(largest, folder.sortOrder + 1), 0);
  const folders = [...data.folders].sort((a, b) => a.sortOrder - b.sortOrder).map((folder, index) => ({ ...folder, version: undefined, id: folderIds.get(folder.id)!, sortOrder: baseOrder + index }));
  const notes = data.notes.map(note => ({ ...note, version: undefined, id: noteIds.get(note.id)!, folderId: note.folderId ? folderIds.get(note.folderId) ?? null : null }));
  const reminders = restoreReminders ? data.reminders.filter(reminder => reminder.dueAt && Date.parse(reminder.dueAt) > Date.now() && noteIds.has(reminder.noteId)).map(reminder => ({ ...reminder, noteId: noteIds.get(reminder.noteId)!, updatedAt: now })) : [];
  const job = await offlineStore.prepareImport({ id: crypto.randomUUID(), userId, fingerprint, createdAt: now, notes, folders, reminders }, allowCopies);
  await finishImport(job);
  return { notes: job.notes.length, folders: job.folders.length, reminders: job.reminders.filter(reminder => reminder.dueAt && Date.parse(reminder.dueAt) > Date.now()).length };
}
