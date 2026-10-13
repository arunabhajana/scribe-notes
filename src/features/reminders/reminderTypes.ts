export type NoteReminder = {
  noteId: string;
  dueAt: string | null;
  leadMinutes: number;
  updatedAt: string;
};
export type ReminderOperation = NoteReminder & { mutationId: string };
export type ReminderCache = {
  userId: string;
  reminders: Record<string, NoteReminder>;
  pending: Record<string, ReminderOperation>;
  cursor: string | null;
};
export type ReminderReply = {
  reminders: NoteReminder[];
  resolved: NoteReminder[];
  acknowledged: string[];
  cursor: string;
  full: boolean;
  hasMore: boolean;
};
export function formatReminderTime(dueAt: string) {
  return new Date(dueAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
