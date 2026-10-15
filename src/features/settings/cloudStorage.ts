import { supabase } from "../auth/supabaseClient";

export const CLOUD_STORAGE_LIMIT_BYTES = 2 * 1024 * 1024;
export const CLOUD_STORAGE_CHANGED_EVENT = "scribe-cloud-storage-changed";
export const CLOUD_STORAGE_LIMIT_MESSAGE = "Cloud storage limit reached (2 MB). Your changes are saved locally. Permanently delete unwanted notes or shorten their content to free cloud space, then sync again.";
export const isCloudStorageLimitError = (error: unknown) =>
  error instanceof Error && error.message.includes("SCRIBE_STORAGE_LIMIT_REACHED");

export type CloudStorageUsage = {
  usedBytes: number;
  noteBytes: number;
  folderBytes: number;
  reminderBytes?: number;
  limitBytes: number;
};

export async function getCloudStorageUsage(): Promise<CloudStorageUsage> {
  if (!supabase) throw new Error("Sign in to view cloud storage usage.");
  const { data, error } = await supabase.rpc("get_cloud_storage_usage")
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) throw new Error("Could not load cloud usage. Check your connection and make sure the storage quota migration is applied.");
  const usage = data as CloudStorageUsage | null;
  if (!usage || ![usage.usedBytes, usage.noteBytes, usage.folderBytes, usage.limitBytes]
    .every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    || usage.limitBytes === 0) throw new Error("Cloud storage usage is unavailable. Try reopening Settings.");
  return usage;
}
