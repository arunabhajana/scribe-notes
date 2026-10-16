const guards = new Map<symbol, () => void | Promise<void>>();
export function registerUpdateGuard(guard: () => void | Promise<void>) {
  const key = Symbol();
  guards.set(key, guard);
  return () => { guards.delete(key); };
}
export async function prepareUpdateInstall() {
  for (const guard of [...guards.values()]) await guard();
}
