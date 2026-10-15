import { digest } from "./transferDigest";
import type { Note, NoteFolder } from "../../types/note";
import type { NoteReminder } from "../reminders/reminderTypes";
import { TRANSFER_LIMIT, TRANSFER_RECORD_LIMIT, type PortableData, type TransferSource } from "./transferTypes";
import { createMarkdownZip, readMarkdownZip } from "./markdownZip";

const encoder = new TextEncoder();
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const icons = new Set(["folder", "briefcase", "book", "code", "heart", "idea", "music", "travel", "star"]);
const colors = new Set(["violet", "blue", "mint", "amber", "rose", "cyan"]);
const invalid = () => new Error("This is not a valid Scribe backup. Check the file and try again; no data has been changed.");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number) { if (typeof value !== "string" || value.length > max || value.includes("\0")) throw invalid(); return value; }
function id(value: unknown) { const result = string(value, 36); if (!uuid.test(result)) throw invalid(); return result.toLowerCase(); }
function boolean(value: unknown) { if (typeof value !== "boolean") throw invalid(); return value; }
function date(value: unknown) {
  const raw = string(value, 64);
  if (!/^\d{4}-\d\d-\d\dT/.test(raw) || !Number.isFinite(Date.parse(raw))) throw invalid();
  const parsed = new Date(raw);
  if (parsed.getUTCFullYear() < 1 || parsed.getUTCFullYear() > 9999) throw invalid();
  return parsed.toISOString();
}
function array(value: unknown) { if (!Array.isArray(value) || value.length > TRANSFER_RECORD_LIMIT) throw invalid(); return value as unknown[]; }
function unique(values: string[]) { if (new Set(values).size !== values.length) throw new Error("This backup has duplicate record IDs. Nothing was imported."); }
export function parseScribeBackup(raw: string): PortableData {
  if (encoder.encode(raw).length > TRANSFER_LIMIT) throw new Error("Choose a backup smaller than 50 MB.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw invalid(); }
  const root = object(parsed);
  if (root.format !== "scribe-backup") throw invalid();
  if (root.version !== 1) throw new Error("This backup version is not supported. Update Scribe before importing it.");
  date(root.exportedAt);
  const data = object(root.data);
  const folders: NoteFolder[] = array(data.folders).map(value => {
    const folder = object(value), name = string(folder.name, 120);
    if (!name.trim() || !icons.has(String(folder.icon)) || !colors.has(String(folder.color)) || !Number.isSafeInteger(folder.sortOrder) || Number(folder.sortOrder) < 0) throw invalid();
    return { id: id(folder.id), name, icon: folder.icon as NoteFolder["icon"], color: folder.color as NoteFolder["color"], sortOrder: Number(folder.sortOrder), createdAt: date(folder.createdAt), updatedAt: date(folder.updatedAt) };
  });
  unique(folders.map(folder => folder.id));
  const folderIds = new Set(folders.map(folder => folder.id));
  const notes: Note[] = array(data.notes).map(value => {
    const note = object(value), folderId = note.folderId === null ? null : id(note.folderId);
    if (folderId && !folderIds.has(folderId)) throw new Error("This backup references a missing folder. Nothing was imported.");
    return { id: id(note.id), title: string(note.title, 8192), body: string(note.body, 8 * 1024 * 1024), folderId,
      pinned: boolean(note.pinned), isDraft: boolean(note.isDraft), deletedAt: note.deletedAt === null ? null : date(note.deletedAt), createdAt: date(note.createdAt), updatedAt: date(note.updatedAt) };
  });
  unique(notes.map(note => note.id));
  const noteIds = new Set(notes.map(note => note.id));
  const reminders: NoteReminder[] = array(data.reminders).map(value => {
    const reminder = object(value), noteId = id(reminder.noteId);
    if (!noteIds.has(noteId) || !Number.isInteger(reminder.leadMinutes) || Number(reminder.leadMinutes) < 0 || Number(reminder.leadMinutes) > 60) throw invalid();
    return { noteId, dueAt: reminder.dueAt === null ? null : date(reminder.dueAt), leadMinutes: Number(reminder.leadMinutes), updatedAt: date(reminder.updatedAt) };
  });
  unique(reminders.map(reminder => reminder.noteId));
  return { notes, folders, reminders };
}
export function selectedData(source: PortableData, selectedIds: Set<string>, includeReminders: boolean, emptyFolders: boolean): PortableData {
  const notes = source.notes.filter(note => selectedIds.has(note.id));
  const noteIds = new Set(notes.map(note => note.id));
  const usedFolders = new Set(notes.map(note => note.folderId));
  return { notes, folders: source.folders.filter(folder => emptyFolders || usedFolders.has(folder.id)), reminders: includeReminders ? source.reminders.filter(reminder => noteIds.has(reminder.noteId) && reminder.dueAt) : [] };
}
function cleanNote(note: Note): Note { return { id: note.id, title: note.title, body: note.body, folderId: note.folderId, pinned: note.pinned, isDraft: note.isDraft, deletedAt: note.deletedAt, createdAt: note.createdAt, updatedAt: note.updatedAt }; }
export function makeBackup(data: PortableData) {
  if (data.notes.length > TRANSFER_RECORD_LIMIT || data.folders.length > TRANSFER_RECORD_LIMIT || data.reminders.length > TRANSFER_RECORD_LIMIT) throw new Error("Export up to 10,000 notes and folders at a time.");
  if (data.notes.some(note => note.title.includes("\0") || note.body.includes("\0"))) throw new Error("A note contains null characters. Remove them before exporting.");
  if (data.notes.some(note => note.title.length > 8192 || note.body.length > 8 * 1024 * 1024)) throw new Error("A note is too large for transfer. Split it into smaller notes before exporting.");
  // Whitelist portable fields. Never serialize owner IDs, auth, server versions,
  // outbox revisions, sync cursors, preferences, or notification history.
  const portable: PortableData = { notes: data.notes.map(cleanNote), folders: data.folders.map(folder => ({ id: folder.id, name: folder.name, icon: folder.icon, color: folder.color, sortOrder: folder.sortOrder, createdAt: folder.createdAt, updatedAt: folder.updatedAt })),
    reminders: data.reminders.map(reminder => ({ noteId: reminder.noteId, dueAt: reminder.dueAt, leadMinutes: reminder.leadMinutes, updatedAt: reminder.updatedAt })) };
  const serialized = JSON.stringify({ format: "scribe-backup", version: 1, exportedAt: new Date().toISOString(), data: portable }, null, 2);
  // Validate our own output before saving so every backup is importable.
  parseScribeBackup(serialized);
  const bytes = encoder.encode(serialized);
  if (bytes.length > TRANSFER_LIMIT) throw new Error("This backup exceeds 50 MB. Export a smaller selection.");
  return bytes;
}
function safeName(name: string) {
  // eslint-disable-next-line no-control-regex -- Strip forbidden Windows filename characters.
  let value = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").trim().slice(0, 70) || "Untitled";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value)) value = `_${value}`;
  return value;
}
export function makeMarkdown(data: PortableData) {
  const names = new Set<string>();
  const folderNames = new Map<string, string>();
  for (const folder of data.folders) {
    const base = safeName(folder.name); let name = base, index = 2;
    while (names.has(name.toLowerCase())) name = `${base} (${index++})`;
    names.add(name.toLowerCase()); folderNames.set(folder.id, name);
  }
  return createMarkdownZip(data.notes.map((note, index) => {
    if (note.title.includes("\0") || note.body.includes("\0")) throw new Error("A note contains null characters. Remove them before exporting.");
    if (note.title.length > 8192 || note.body.length > 8 * 1024 * 1024) throw new Error("A note is too large for transfer. Split it into smaller notes before exporting.");
    const title = note.title.replace(/[\r\n]+/g, " ").trim() || "Untitled";
    const folder = note.folderId ? folderNames.get(note.folderId) : null;
    return { name: `${folder ? `${folder}/` : ""}${String(index + 1).padStart(3, "0")} ${safeName(title)}.md`, text: `# ${title}\n\n${note.body}` };
  }));
}
async function stableId(value: string) {
  const hash = await digest(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
async function markdownData(files: { name: string; text: string }[]): Promise<PortableData> {
  if (!files.length) throw new Error("No Markdown files were found in this ZIP.");
  const folders = new Map<string, NoteFolder>();
  const notes: Note[] = [];
  const now = new Date().toISOString();
  const occurrences = new Map<string, number>();
  for (const file of files) {
    if (file.text.includes("\0")) throw new Error("Markdown files must contain text without null characters. Nothing was imported.");
    const name = file.name.replace(/\\/g, "/");
    const parent = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
    if (parent && !folders.has(parent)) folders.set(parent, { id: await stableId(`folder:${parent}`), name: parent.split("/").join(" / ").slice(0, 120), icon: "folder", color: "violet", sortOrder: folders.size, createdAt: now, updatedAt: now });
    const heading = /^# ([^\r\n]*)\r?\n(?:\r?\n)?/.exec(file.text);
    const title = (heading?.[1] ?? name.split("/").pop()!.replace(/\.(md|markdown)$/i, "")).trim() || "Untitled";
    const body = heading ? file.text.slice(heading[0].length) : file.text;
    if (title.length > 8192 || body.length > 8 * 1024 * 1024) throw new Error("A Markdown note is too large. Split it into smaller files before importing.");
    const contentKey = await digest(`${name}\n${file.text}`);
    const occurrence = occurrences.get(contentKey) ?? 0;
    occurrences.set(contentKey, occurrence + 1);
    notes.push({ id: await stableId(`${contentKey}:${occurrence}`), title, body, folderId: folders.get(parent)?.id ?? null, pinned: false, isDraft: false, deletedAt: null, createdAt: now, updatedAt: now });
  }
  unique(notes.map(note => note.id));
  return { notes, folders: [...folders.values()], reminders: [] };
}
export async function readTransferFiles(files: File[]): Promise<{ source: TransferSource; ignored: number }> {
  if (!files.length || files.length > TRANSFER_RECORD_LIMIT || files.reduce((total, file) => total + file.size, 0) > TRANSFER_LIMIT) throw new Error("Select up to 10,000 notes and 50 MB at a time.");
  if (files.length === 1 && /\.(scribe|json)$/i.test(files[0].name)) return { source: { ...parseScribeBackup(await files[0].text()), kind: "backup", name: files[0].name }, ignored: 0 };
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const zip = await readMarkdownZip(new Uint8Array(await files[0].arrayBuffer()));
    return { source: { ...await markdownData(zip.files), kind: "markdown", name: files[0].name }, ignored: zip.ignored };
  }
  if (files.some(file => !/\.(md|markdown)$/i.test(file.name))) throw new Error("Choose one Scribe backup or ZIP, or select several Markdown files together.");
  const entries = await Promise.all(files.map(async file => ({ name: file.name, text: await file.text() })));
  return { source: { ...await markdownData(entries), kind: "markdown", name: files.length === 1 ? files[0].name : `${files.length} Markdown files` }, ignored: 0 };
}
