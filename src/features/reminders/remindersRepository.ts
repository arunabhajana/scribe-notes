import { supabase } from "../auth/supabaseClient";
import type { ReminderOperation, ReminderReply } from "./reminderTypes";

export async function syncReminders(userId: string, operations: ReminderOperation[], cursor: string | null): Promise<ReminderReply> {
  if (!supabase) throw new Error("Cloud sync is not configured.");
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError || auth.session?.user.id !== userId) throw new Error("The signed-in account changed.");
  const { data, error } = await supabase.rpc("sync_note_reminders", {
    p_operations: operations.map(({ mutationId, noteId, dueAt, leadMinutes }) => ({ mutationId, noteId, dueAt, leadMinutes })),
    p_cursor: cursor,
  }).setHeader("Authorization", `Bearer ${auth.session.access_token}`).abortSignal(AbortSignal.timeout(20_000));
  if (error) throw error;
  if (!data || !Array.isArray(data.reminders) || !Array.isArray(data.resolved) || !Array.isArray(data.acknowledged) ||
      typeof data.cursor !== "string" || !/^\d+$/.test(data.cursor) || typeof data.full !== "boolean" || typeof data.hasMore !== "boolean" ||
      !data.acknowledged.every((id: unknown) => typeof id === "string") ||
      ![...data.reminders, ...data.resolved].every((row: Record<string, unknown>) => row && typeof row.noteId === "string" &&
        (row.dueAt === null || typeof row.dueAt === "string" && Number.isFinite(Date.parse(row.dueAt))) &&
        typeof row.updatedAt === "string" && Number.isFinite(Date.parse(row.updatedAt)) &&
        typeof row.leadMinutes === "number" && Number.isInteger(row.leadMinutes) && row.leadMinutes >= 0 && row.leadMinutes <= 60)) {
    throw new Error("The server returned an unreadable reminder response.");
  }
  return data as ReminderReply;
}
