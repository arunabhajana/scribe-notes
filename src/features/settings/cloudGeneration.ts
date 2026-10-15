import { supabase } from "../auth/supabaseClient";
import { offlineStore } from "../notes/offlineStore";
import { reminderStore } from "../reminders/reminderStore";
import { disableCloudSync } from "./cloudSyncPreference";

const observed = new Map<string, string>();
const key = (id: string) => `scribe-cloud-generation:${id}`;
export const CLOUD_RESET_EVENT = "scribe:cloud-data-reset";
export const CLOUD_RESET_MESSAGE = "Cloud data was deleted. Sync is off to prevent old notes uploading again. Review Cloud sync in General settings before reconnecting.";
export function cloudGeneration(id: string) {
  if (!observed.has(id)) observed.set(id, localStorage.getItem(key(id)) ?? "0");
  return observed.get(id)!;
}
export function saveCloudGeneration(id: string, generation: string) {
  if (!/^\d+$/.test(generation)) throw new Error("Could not read the cloud data version.");
  observed.set(id, generation);
  localStorage.setItem(key(id), generation);
}
export function handleCloudReset(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (!message.includes("SCRIBE_DATA_RESET")) return false;
  disableCloudSync(id);
  window.dispatchEvent(new CustomEvent(CLOUD_RESET_EVENT, { detail: id }));
  return true;
}
// Called only AFTER the user confirms the normal upload disclosure.
export async function prepareCloudReconnect(id: string) {
  if (!supabase) throw new Error("Sign in before enabling cloud sync.");
  const { data: auth } = await supabase.auth.getSession();
  if (auth.session?.user.id !== id) throw new Error("The signed-in account changed.");
  const { data, error } = await supabase.rpc("get_sync_generation").abortSignal(AbortSignal.timeout(15_000));
  if (error || typeof data !== "string" || !/^\d+$/.test(data)) throw new Error("Could not check cloud data. Check your connection and apply the data-deletion migration before enabling sync.");
  if (data !== cloudGeneration(id)) {
    await offlineStore.rebaseAfterCloudReset(id);
    await reminderStore.rebaseAfterCloudReset(id);
    saveCloudGeneration(id, data);
  }
}
