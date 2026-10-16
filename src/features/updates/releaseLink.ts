import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export async function openReleasePage() {
  const url = 'https://github.com/arunabhajana/scribe-notes/releases';
  if (isTauri()) await openUrl(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
