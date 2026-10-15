import { readLocalProfile, removeLocalProfile } from "./localProfile";
import { deleteWorkspaceData, inspectWorkspaceData } from "./workspaceDataDeletion";

function verifyProfile(id: string) {
  if (readLocalProfile()?.id !== id) throw new Error("The offline profile changed. Reopen Settings before deleting it.");
}
export async function inspectOfflineProfile(id: string) {
  verifyProfile(id);
  const summary = await inspectWorkspaceData(id);
  verifyProfile(id);
  return { ...summary, bytes: summary.bytes + new TextEncoder().encode(JSON.stringify(readLocalProfile())).byteLength };
}
export type OfflineProfileSummary = Awaited<ReturnType<typeof inspectOfflineProfile>>;
export async function deleteOfflineProfile(id: string) {
  verifyProfile(id);
  await deleteWorkspaceData(id);
  verifyProfile(id);
  removeLocalProfile(id);
}
