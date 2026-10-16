import { readWorkspacePreference, writeWorkspacePreference } from '../settings/workspacePreferences';

const name = 'scribe-automatic-updates-v2';
export const updatePreferenceName = name;
export function automaticUpdatesEnabled(workspaceId: string | null, localOnly: boolean): boolean {
  if (!workspaceId) return false;
  const saved = readWorkspacePreference(workspaceId, name);
  if (saved !== null) return saved === 'true';
  // The previous installation-wide flag must never opt an offline profile in.
  if (localOnly) return false;
  try { return localStorage.getItem('scribe-updates:auto:v1') !== 'false'; } catch { return true; }
}
export function saveAutomaticUpdates(workspaceId: string, enabled: boolean) {
  writeWorkspacePreference(workspaceId, name, String(enabled));
  if (readWorkspacePreference(workspaceId, name) !== String(enabled)) throw new Error('Could not save this preference. Keep automatic checks off and try again.');
}
