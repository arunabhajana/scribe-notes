import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";
import { cancelWorkspaceDeletion, markWorkspaceDeletion } from "./workspaceDeletionState";
import { deleteWorkspaceData, inspectWorkspaceData } from "./workspaceDataDeletion";

export type AccountDeletionTarget = { id: string; email: string; displayName: string };
export type PendingAccountDeletion = { userId: string; receipt: string; requestedAt: number; remoteDeleted: boolean };
export type CloudDeletionSummary = { userId: string; notes: number; drafts: number; trash: number; folders: number; reminders: number; cloudBytes: number; sessions: number; identities: number; hasPassword: boolean; factors: { id: string; name: string; type: string }[] };
const journalKey = "scribe-account-deletion:v1";
const changed = "scribe-account-deletion-changed";
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
function snapshot() { try { return localStorage.getItem(journalKey); } catch { return null; } }
function parse(raw: string | null): PendingAccountDeletion | null {
  try {
    const value = JSON.parse(raw ?? "null");
    return value && uuid.test(value.userId) && /^[\da-f]{64}$/.test(value.receipt) && Number.isFinite(value.requestedAt) && typeof value.remoteDeleted === "boolean" ? value : null;
  } catch { return null; }
}
function subscribe(notify: () => void) {
  window.addEventListener(changed, notify); window.addEventListener("storage", notify);
  return () => { window.removeEventListener(changed, notify); window.removeEventListener("storage", notify); };
}
export function usePendingAccountDeletion() { return parse(useSyncExternalStore(subscribe, snapshot, () => null)); }
export function readPendingAccountDeletion() { return parse(snapshot()); }
function savePending(value: PendingAccountDeletion | null) {
  if (value) localStorage.setItem(journalKey, JSON.stringify(value)); else localStorage.removeItem(journalKey);
  window.dispatchEvent(new Event(changed));
}
function rejectPending(id: string) {
  // Only the journal's own workspace can be unfrozen.
  if (parse(snapshot())?.userId !== id) return;
  cancelWorkspaceDeletion(id); savePending(null);
}
export async function inspectOnlineAccount(id: string) {
  if (!supabase) throw new Error("Sign in to delete your account.");
  const [cloud, local] = await Promise.all([
    supabase.rpc("get_account_deletion_summary").abortSignal(AbortSignal.timeout(15_000)), inspectWorkspaceData(id),
  ]);
  if (cloud.error) throw new Error("Could not load account data. Check your connection. The account deletion migration must also be applied in Supabase.");
  const value = cloud.data as CloudDeletionSummary;
  if (!value || value.userId !== id || !Array.isArray(value.factors) || typeof value.hasPassword !== "boolean" || ![value.notes, value.drafts, value.trash, value.folders, value.reminders, value.cloudBytes, value.sessions, value.identities].every(number => Number.isSafeInteger(number) && number >= 0)) throw new Error("Account details changed. Close this dialog and try again.");
  return { cloud: value, local };
}
export type OnlineDeletionSummary = Awaited<ReturnType<typeof inspectOnlineAccount>>;

const messages: Record<string, string> = {
  incorrect_password: "That password is incorrect. Try again.",
  password_required: "Enter your account password.",
  set_password_first: "Set a password using the password reset option in Account settings, then return here.",
  authenticator_required: "Verify with your current authenticator. Refresh this dialog if your security settings changed.",
  incorrect_code: "That code did not match. Enter the latest six-digit code from your authenticator.",
  too_many_attempts: "Too many attempts. Wait 15 minutes before trying again.",
  session_verification_required: "Your session needs verification. Close this dialog and sign in again.",
  sign_in_required: "Your session expired. Sign in again before deleting your account.",
  security_changed: "Your security settings changed. Reload the summary and try again.",
  deletion_already_pending: "Another deletion request is processing for this account. Wait five minutes before trying again.",
  deletion_unavailable: "Account deletion is unavailable. Make sure the Supabase migration and delete-account Edge Function are deployed.",
  verification_timed_out: "Verification took too long. Your account has not been deleted. Try again with a new authenticator code.",
  request_failed: "Verification could not finish. Your account and local data have been kept. Check your connection and try again.",
  auth_configuration_required: "Auth requires an additional security check that this deletion flow does not support yet. Contact support; your account has not been deleted.",
  auth_service_unavailable: "Account verification is temporarily unavailable. Your account has not been deleted. Try again later.",
  delete_failed: "Supabase could not delete the account. Your local data has been kept. Try again or contact support.",
  origin_not_allowed: "This app’s origin is not allowed by the deletion service. Check its allowed origins configuration.",
};
async function endpoint(body: Record<string, unknown>, token?: string) {
  const project = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!project || !key) throw new Error("Account deletion is not configured.");
  const response = await fetch(`${project}/functions/v1/delete-account`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90_000), cache: "no-store",
  });
  if (response.status === 404) return { ok: false, code: "deletion_unavailable", status: undefined };
  const result: { code?: string; status?: string } = await response.json();
  return { ok: response.ok, ...result };
}
export async function requestAccountDeletion(id: string, password: string, factorId: string, code: string) {
  if (!supabase || !password) throw new Error("Enter your account password.");
  if (parse(snapshot())) throw new Error("Finish the pending deletion request first.");
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== id) throw new Error("Sign in to this account again before deleting it.");
  const receipt = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const pending: PendingAccountDeletion = { userId: id, receipt, requestedAt: Date.now(), remoteDeleted: false };
  savePending(pending);
  markWorkspaceDeletion(id, "verifying");
  try {
    const response = await endpoint({ action: "delete", receipt, expectedUserId: id, password, factorId, code }, data.session.access_token);
    if (response.status === "deleted") { savePending({ ...pending, remoteDeleted: true }); return; }
    if (response.status === "pending") throw new Error("Deletion is processing. Check its status before continuing.");
    // An explicit failure response proves that this call did not delete the user.
    if (response.code && Object.hasOwn(messages, response.code)) {
      rejectPending(id); throw new Error(messages[response.code]);
    }
    throw new Error("The result could not be confirmed. Check deletion status before continuing. Your local data is kept until deletion is confirmed.");
  } catch (cause) {
    if (parse(snapshot())) throw new Error(cause instanceof Error && !/fetch|timeout|abort/i.test(cause.message) ? cause.message : "Connection interrupted. Check deletion status; your local data is kept until the server confirms deletion.", { cause });
    throw cause;
  }
}
export async function checkAccountDeletion(pending: PendingAccountDeletion) {
  if (pending.remoteDeleted) return true;
  const response = await endpoint({ action: "status", receipt: pending.receipt });
  if (response.status === "deleted") { savePending({ ...pending, remoteDeleted: true }); return true; }
  const age = Date.now() - pending.requestedAt;
  if (response.status === "failed" || (response.status === "unknown" && age > 5 * 60_000 && age < 6 * 24 * 60 * 60_000)) {
    rejectPending(pending.userId);
    throw new Error("This request did not complete. Your local data has been kept. Reload the summary and verify your password again to retry.");
  }
  throw new Error("Deletion has not been confirmed yet. Wait a moment, then check again. Keep Scribe open or return here after reconnecting.");
}
export async function finishAccountDeletion(pending: PendingAccountDeletion, signOutDeleted: (id: string) => Promise<void>) {
  const saved = parse(snapshot());
  if (!saved || saved.userId !== pending.userId || saved.receipt !== pending.receipt || !saved.remoteDeleted) throw new Error("Confirm the server deletion status first.");
  await deleteWorkspaceData(saved.userId);
  await signOutDeleted(saved.userId);
  savePending(null);
  // Cleanup is durable. A lost acknowledgement leaves only an account-free
  // status receipt, never note content, on the server.
  void endpoint({ action: "ack", receipt: saved.receipt }).catch(() => undefined);
}
