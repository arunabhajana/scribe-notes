import { invoke, isTauri } from "@tauri-apps/api/core";
import { supabase } from "./supabaseClient";
import { readLocalProfile } from "./localProfile";
import { advanceWorkspaceGeneration, cancelWorkspaceDeletion, finishWorkspaceDataReset, markWorkspaceDeletion } from "./workspaceDeletionState";
import { deleteWorkspaceData, inspectWorkspaceData } from "./workspaceDataDeletion";
import { inspectOnlineAccount } from "./onlineAccountDeletion";
import { offlineStore } from "../notes/offlineStore";
import { reminderStore } from "../reminders/reminderStore";
import { disableCloudSync } from "../settings/cloudSyncPreference";
import { setCaptureEnabled, waitForCaptureAccount } from "../capture/captureBridge";

import { pendingDataDeletion, saveDataDeletion as save, type DataDeletionTarget, type DataScope, type PendingDataDeletion } from "./dataDeletionState";
export type { DataDeletionTarget, DataScope, PendingDataDeletion } from "./dataDeletionState";
const runtime = crypto.randomUUID();
const errors: Record<string, string> = {
  incorrect_password: "That password is incorrect. Try again.", incorrect_code: "That code did not match. Enter a new authenticator code.",
  password_required: "Enter your account password.", set_password_first: "Set an account password using a password reset email, then return here.",
  authenticator_required: "Enter a current code from your account’s authenticator.", too_many_attempts: "Too many verification attempts. Wait 15 minutes before retrying.",
  security_changed: "Your account security changed. Reload the data summary before trying again.", sign_in_required: "Sign in to this account again before deleting data.",
  session_verification_required: "Your session needs verification. Close this dialog and sign in again.",
  deletion_unavailable: "Data deletion is unavailable. Apply the data-deletion SQL migration and deploy the delete-data Edge Function.",
  deletion_already_pending: "Another request is processing. Wait a few minutes before trying again.",
  auth_configuration_required: "Account verification requires a security check this flow does not support. Your data has been kept.",
  auth_service_unavailable: "Account verification is temporarily unavailable. Your data has been kept.",
  verification_timed_out: "Verification took too long. Your data has been kept; try again.", request_failed: "Verification could not finish. Your data has been kept. Check your connection and retry.",
  origin_not_allowed: "The deletion service does not allow this app’s origin. Check its allowed-origins setting.", invalid_scope: "Choose which data to delete.",
};
async function endpoint(body: Record<string, unknown>, token?: string) {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !publicKey) throw new Error("Cloud account services are not configured.");
  const response = await fetch(`${url}/functions/v1/delete-data`, { method: "POST", headers: { "Content-Type": "application/json", apikey: publicKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000), cache: "no-store" });
  if (response.status === 404) return { code: "deletion_unavailable" };
  return await response.json() as { code?: string; status?: string; scope?: DataScope; generation?: string };
}
export async function inspectDataDeletion(target: DataDeletionTarget) {
  if (target.localOnly) {
    if (readLocalProfile()?.id !== target.id) throw new Error("This offline profile changed. Reopen Settings.");
    return { local: await inspectWorkspaceData(target.id), cloud: null };
  }
  return inspectOnlineAccount(target.id);
}
export type DataDeletionSummary = Awaited<ReturnType<typeof inspectDataDeletion>>;
function reject(pending: PendingDataDeletion) {
  cancelWorkspaceDeletion(pending.target.id); save(null);
  if (!pending.target.localOnly) void endpoint({ action: "ack", receipt: pending.receipt }).catch(() => undefined);
}
export async function requestDataDeletion(target: DataDeletionTarget, scope: DataScope, password: string, factorId: string, code: string) {
  if (pendingDataDeletion() || localStorage.getItem("scribe-account-deletion:v1")) throw new Error("Finish the pending deletion first.");
  if (target.localOnly && (scope !== "local" || readLocalProfile()?.id !== target.id)) throw new Error("The offline profile changed.");
  let token: string | undefined;
  if (!target.localOnly) {
    const auth = await supabase?.auth.getSession();
    if (auth?.data.session?.user.id !== target.id || !password) throw new Error("Enter your password while signed in to this account.");
    token = auth.data.session.access_token;
  }
  const receipt = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const pending: PendingDataDeletion = { target, scope, receipt, phase: target.localOnly ? "confirmed" : "verifying", requestedAt: Date.now(), runtime };
  save(pending); disableCloudSync(target.id); markWorkspaceDeletion(target.id, target.localOnly ? "pending" : "verifying");
  if (!target.localOnly) {
    try {
      const response = await endpoint({ action: "delete", receipt, expectedUserId: target.id, scope, password, factorId, code }, token);
      if (response.status === "complete" && response.scope === scope) save({ ...pending, phase: "confirmed" });
      else if (response.code && Object.hasOwn(errors, response.code)) { reject(pending); throw new Error(errors[response.code]); }
      else throw new Error("The result is not confirmed. Check deletion status before continuing; local data has been kept.");
    } catch (cause) {
      throw new Error(cause instanceof Error ? cause.message : "Connection interrupted. Check deletion status before continuing.", { cause });
    }
  }
  await continueDataDeletion();
}
async function continueDeletion() {
  let pending = pendingDataDeletion();
  if (!pending) return;
  const id = pending.target.id;
  if (pending.phase === "verifying") {
    const response = await endpoint({ action: "status", receipt: pending.receipt });
    if (response.status === "failed" || response.status === "unknown" && Date.now() - pending.requestedAt > 5 * 60_000) {
      reject(pending); throw new Error("This deletion did not complete. Reload the summary and verify again to retry.");
    }
    if (response.status !== "complete" || response.scope !== pending.scope) throw new Error("Deletion is not confirmed yet. Wait a moment and check again. Your local data stays protected.");
    pending = { ...pending, phase: "confirmed" }; save(pending);
  }
  if (pending.phase === "confirmed") {
    markWorkspaceDeletion(id, "pending");
    if (isTauri()) {
      await waitForCaptureAccount(); await setCaptureEnabled(false);
      await invoke("prepare_workspace_data_reset", { userId: id });
    }
    if (pending.scope !== "cloud") await deleteWorkspaceData(id, true);
    advanceWorkspaceGeneration(id);
    save({ ...pending, phase: "restart", runtime });
    return;
  }
  if (pending.phase === "restart" && pending.runtime !== runtime) {
    if (pending.scope !== "cloud") {
      await offlineStore.reopenEmptyWorkspace(id);
      await reminderStore.reopenEmptyWorkspace(id);
    }
    finishWorkspaceDataReset(id); save(null);
    if (!pending.target.localOnly) void endpoint({ action: "ack", receipt: pending.receipt }).catch(() => undefined);
  }
}
export async function restartAfterDataDeletion() {
  if (pendingDataDeletion()?.phase !== "restart") throw new Error("Finish the deletion before restarting.");
  if (isTauri()) await invoke("restart_after_data_reset"); else window.location.reload();
}

let continuing: Promise<void> | null = null;
export async function continueDataDeletion() {
  if (continuing) return continuing;
  const task = continueDeletion(); continuing = task;
  try { await task; } finally { if (continuing === task) continuing = null; }
}
