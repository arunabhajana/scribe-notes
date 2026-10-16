import { invoke } from '@tauri-apps/api/core';
import { Update } from '@tauri-apps/plugin-updater';

// Use the SDK resource unchanged so its signature checks and installer behavior
// remain in force. Our main-window command also retains structured check errors.
export async function checkNativeUpdate(): Promise<Update | null> {
  const metadata = await invoke<ConstructorParameters<typeof Update>[0] | null>('check_app_update');
  return metadata ? new Update(metadata) : null;
}
