import { syncId, syncCursor, syncDate } from "../notes/syncValidation";
import { cloudGeneration, handleCloudReset } from "../settings/cloudGeneration";
import { supabase } from "../auth/supabaseClient";
import type { ReminderOperation, ReminderReply } from "./reminderTypes";
import { cloudSyncSignal } from "../settings/cloudSyncPreference";

export async function syncReminders(userId: string, operations: ReminderOperation[], cursor: string | null): Promise<ReminderReply> {
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError || auth.session?.user.id !== userId) throw new Error("The signed-in account changed.");
  const signal = cloudSyncSignal(userId);
  const { data, error } = await supabase.rpc("sync_note_reminders", {
    p_operations: operations.map(({ mutationId, noteId, dueAt, leadMinutes }) => ({ mutationId, noteId, dueAt, leadMinutes })),
    p_cursor: cursor, p_generation: cloudGeneration(userId),
  }).setHeader("Authorization", `Bearer ${auth.session.access_token}`).abortSignal(signal);
  if (error) { handleCloudReset(userId, error); throw error; }
  if (!data || !Array.isArray(data.reminders) || !Array.isArray(data.resolved) || !Array.isArray(data.acknowledged) ||
      !syncCursor(data.cursor) || typeof data.full !== "boolean" || typeof data.hasMore !== "boolean" ||
      data.reminders.length > 10_000 || data.resolved.length > 50 || data.acknowledged.length > 50 || !data.acknowledged.every(syncId) ||
      ![...data.reminders, ...data.resolved].every((row: Record<string, unknown>) => row && syncId(row.noteId) &&
        (row.dueAt === null || syncDate(row.dueAt)) &&
        syncDate(row.updatedAt) &&
        typeof row.leadMinutes === "number" && Number.isInteger(row.leadMinutes) && row.leadMinutes >= 0 && row.leadMinutes <= 60)) {
    throw new Error("The server returned an unreadable reminder response.");
  }
  return data as ReminderReply;
}
