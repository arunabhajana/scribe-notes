import type { Note, NoteFolder } from "../../types/note";
import type { NoteReminder } from "../reminders/reminderTypes";

export const TRANSFER_LIMIT = 50 * 1024 * 1024;
export const TRANSFER_RECORD_LIMIT = 10_000;
export const LOCAL_IMPORT_EVENT = "scribe:local-import";
export type PortableData = { notes: Note[]; folders: NoteFolder[]; reminders: NoteReminder[] };
export type TransferSource = PortableData & { kind: "backup" | "markdown" | "workspace"; name: string; captureDrafts?: number };
export type ImportJob = PortableData & { id: string; userId: string; fingerprint: string; createdAt: string };
export type ImportReceipt = { key: string; userId: string; fingerprint: string; importedAt: string; notes: number; folders: number };
export type TransferTarget = { noteIds?: string[]; id: string; displayName: string; localOnly: boolean; cloudSync: boolean; mode: "export" | "import" };
export const transferSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
