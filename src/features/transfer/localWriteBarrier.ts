const barriers = new Map<string, () => Promise<void>>();
export function registerLocalWriteBarrier(userId: string, wait: () => Promise<void>) {
  barriers.set(userId, wait);
  return () => { if (barriers.get(userId) === wait) barriers.delete(userId); };
}
export async function waitForWorkspaceWrites(userId: string) {
  const wait = barriers.get(userId);
  if (!wait) throw new Error("This workspace is not ready. Return to Notes and try again.");
  await wait();
}
