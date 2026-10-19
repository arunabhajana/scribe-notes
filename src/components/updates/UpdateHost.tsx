import { useEffect, useLayoutEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { updateNotificationAction } from '../../features/updates/updateNotification';
import { appVersion } from '../../features/updates/changelogs';
import { useUpdates, updateActions, UPDATE_CHECK_INTERVAL } from '../../features/updates/updateStore';
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
    if (!isTauri()) return;
    if (!workspaceId || !state.automatic) {
      void invoke('set_update_check_schedule', { enabled: false }).catch(() => undefined);
      return;
    }
    let active = true;
    let stop: (() => void) | undefined;
    let timer: number;
    let checking = false;
    const check = async (fresh = false) => {
      if (!active || checking) return;
      checking = true;
      window.clearTimeout(timer);
      const result = await updateActions.check(false, fresh);
      checking = false;
      if (active) timer = window.setTimeout(() => void check(result === false && fresh), result === false ? 2000 : UPDATE_CHECK_INTERVAL);
    };
    // Native timing continues while Windows throttles a hidden WebView. The
    // browser timer is a fallback, and focus/online catch up after sleep/offline.
    void listen<boolean>('scribe:check-for-updates', ({ payload }) => void check(payload === true)).then(unlisten => { if (active) stop = unlisten; else unlisten(); }).catch(() => undefined);
    void invoke('set_update_check_schedule', { enabled: true }).catch(() => undefined);
    const catchUp = () => void check();
    window.addEventListener('online', catchUp);
    window.addEventListener('focus', catchUp);
    timer = window.setTimeout(() => void check(), 1500);
    return () => {
      active = false; window.clearTimeout(timer); stop?.();
      window.removeEventListener('online', catchUp); window.removeEventListener('focus', catchUp);
    };
  }, [workspaceId, state.automatic]);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let stop: (() => void) | undefined;
    const accept = (urls: string[]) => {
      for (const url of urls) {
        const action = updateNotificationAction(url);
        if (!active || !action) continue;
        setWhatsNew(false);
        updateActions.open(action === 'changelog');
        const window = getCurrentWindow();
        void window.unminimize().then(() => window.show()).then(() => window.setFocus()).catch(() => undefined);
      }
    };
    void onOpenUrl(accept).then(unlisten => { if (active) stop = unlisten; else unlisten(); }).catch(() => undefined);
    void getCurrent().then(urls => { if (urls) accept(urls); }).catch(() => undefined);
    return () => { active = false; stop?.(); };
  }, []);
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
