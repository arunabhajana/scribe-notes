import { useEffect, useLayoutEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { appVersion } from '../../features/updates/changelogs';
import { useUpdates, updateActions } from '../../features/updates/updateStore';
import { UpdateDialog } from './UpdateDialog';
import { WhatsNewDialog } from './WhatsNewDialog';
import { useWorkspaceId, useWorkspacePreference } from '../../features/settings/workspacePreferences';
import { updatePreferenceName } from '../../features/updates/updatePreference';
import { accentColors, type AccentColor } from '../../features/settings/accentColors';
import type { CSSProperties } from 'react';
import { UpdateToast } from './UpdateToast';

const seenKey = 'scribe-updates:seen-version:v1';

export function UpdateHost({ blocked, localOnly }: { blocked: boolean; localOnly: boolean }) {
  const state = useUpdates();
  const [whatsNew, setWhatsNew] = useState(false);
  const [theme] = useWorkspacePreference('scribe-theme');
  const [accent] = useWorkspacePreference('scribe-accent');
  const palette = accentColors[accent as AccentColor] ?? accentColors.violet;
  const workspaceId = useWorkspaceId();
  const [automaticPreference] = useWorkspacePreference(updatePreferenceName);
  useLayoutEffect(() => { updateActions.setWorkspace(workspaceId, localOnly); }, [workspaceId, localOnly, automaticPreference]);
  useEffect(() => {
    if (!isTauri()) return;
    // First installation establishes a baseline; upgrades show bundled notes once.
    let previous: string | null;
    try { previous = localStorage.getItem(seenKey); if (!previous) localStorage.setItem(seenKey, appVersion); } catch { return; }
    if (previous && previous !== appVersion) {
      const timer = window.setTimeout(() => setWhatsNew(true), 1800);
      return () => window.clearTimeout(timer);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void updateActions.check(false), 12_000);
    const interval = window.setInterval(() => void updateActions.check(false), 60 * 60 * 1000);
    const online = () => void updateActions.check(false);
    window.addEventListener('online', online);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener('online', online); };
  }, [workspaceId, state.automatic]);
  const closeWhatsNew = () => {
    try { localStorage.setItem(seenKey, appVersion); } catch { /* Notes remain accessible in About. */ }
    setWhatsNew(false);
  };
  return <div className={`update-layer ${theme === 'light' ? 'theme-light' : 'theme-dark'}`} style={{ '--accent': palette.color } as CSSProperties}>
    {!blocked && state.toast && state.version && <UpdateToast version={state.version} summary={state.summary} ready={state.phase === 'ready'} error={state.error} onUpdate={() => { updateActions.open(); void updateActions.download(); }} onLater={updateActions.later} />}
    {!blocked && state.dialog && <UpdateDialog />}
    {!blocked && whatsNew && !state.dialog && <WhatsNewDialog onClose={closeWhatsNew} />}
  </div>;
}
