import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';
import { useSyncExternalStore } from 'react';
import { updateChangelog } from './changelogs';
import { prepareUpdateInstall } from './installSafety';
import type { Changelog } from '../../../scripts/lib/changelog.mts';
import { automaticUpdatesEnabled, saveAutomaticUpdates } from './updatePreference';
import { updateCheckFailure } from './updateErrors';
import { checkNativeUpdate } from './nativeUpdater';
import { formatUpdateDiagnostic } from './updateDiagnostics';

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing';
type State = {
  phase: Phase; version: string | null; summary: string; changelog: Changelog | null;
  downloaded: number; total: number | null; error: string | null; checkedAt: number | null;
  configured: boolean | null; automatic: boolean; toast: boolean; dialog: boolean;
  workspaceId: string | null; localOnly: boolean; notice: string | null; diagnostic: string | null;
  showChangelog: boolean;
};
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* In-memory controls still work. */ } };
const checkKey = () => `scribe-updates:last-check:v2:${state.workspaceId ?? 'entry'}`;
let state: State = { phase: 'idle', version: null, summary: '', changelog: null, downloaded: 0, total: null,
  error: null, checkedAt: null, configured: null, automatic: false, toast: false, dialog: false,
  workspaceId: null, localOnly: false, notice: null, diagnostic: null, showChangelog: false };
const listeners = new Set<() => void>();
let update: Update | null = null;
let busy = false;
let scopeRevision = 0;
export const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;
// In-memory throttling permits a fresh check on every application launch.
// Persisted timestamps from the previous session must not suppress startup.
let lastAutomaticAttempt = 0;
function patch(next: Partial<State>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useUpdates() { return useSyncExternalStore(subscribe, () => state); }

export const updateActions = {
  setWorkspace(workspaceId: string | null, localOnly: boolean) {
    const automatic = automaticUpdatesEnabled(workspaceId, localOnly);
    if (state.workspaceId === workspaceId && state.localOnly === localOnly && state.automatic === automatic) return;
    scopeRevision++;
    const changed = state.workspaceId !== workspaceId || state.localOnly !== localOnly;
    if (changed) lastAutomaticAttempt = 0;
    patch({ workspaceId, localOnly, automatic, ...(changed ? { error: null, notice: null, diagnostic: null, checkedAt: null, toast: false } : {}) });
  },
  async check(manual = true, fresh = false) {
    if (busy) return false;
    if (state.phase === 'ready' || state.phase === 'installing') return;
    if (!isTauri()) { if (manual) patch({ configured: false, error: null, diagnostic: null, notice: 'Update checks are available in the installed Windows app.' }); return; }
    if (!navigator.onLine) { if (manual) patch({ error: 'You’re offline. Connect to the internet to check for updates. Your local notes are still available.', notice: null, diagnostic: null }); return; }
    if (!manual) {
      if (!state.automatic) return;
      const age = Date.now() - lastAutomaticAttempt;
      if (!fresh && lastAutomaticAttempt > 0 && age >= 0 && age < UPDATE_CHECK_INTERVAL) return;
    }
    busy = true;
    const revision = scopeRevision;
    const requestCheckKey = checkKey();
    const previousPhase = state.phase;
    const started = performance.now();
    lastAutomaticAttempt = Date.now();
    let stage = 'configuration';
    patch({ phase: 'checking', error: null, notice: null, diagnostic: null });
    try {
      const configured = await invoke<boolean>('updater_configured');
      if (revision !== scopeRevision) { patch({ phase: previousPhase }); return; }
      patch({ configured });
      if (!configured) {
        patch({ phase: previousPhase, notice: manual ? 'Updates are not configured in this build. Install an official signed release to receive updates.' : null });
        return;
      }
      stage = 'check';
      const candidate = await checkNativeUpdate();
      if (revision !== scopeRevision) { if (candidate) await candidate.close().catch(() => undefined); patch({ phase: previousPhase }); return; }
      if (update) await update.close().catch(() => undefined);
      update = candidate;
      const now = Date.now();
      write(requestCheckKey, String(now));
      if (candidate) {
        const log = updateChangelog(candidate.rawJson.changelog, candidate.version);
        patch({ phase: 'available', version: candidate.version, summary: log?.summary ?? candidate.body?.slice(0, 240) ?? 'A new version of Scribe is ready.',
          changelog: log, checkedAt: now, toast: manual || read('scribe-updates:later:v1') !== candidate.version });
        if (read('scribe-updates:later:v1') !== candidate.version) {
          // Native delivery obeys desktop notification settings and only shows
          // a banner in the background. A delivery failure never breaks updates.
          void invoke('show_update_notification', { version: candidate.version, summary: state.summary.slice(0, 1000) }).catch(() => undefined);
        }
      } else patch({ phase: 'idle', version: null, summary: '', changelog: null, toast: false, checkedAt: now });
    } catch (cause) {
      if (revision !== scopeRevision) { patch({ phase: previousPhase }); return; }
      const failure = updateCheckFailure(cause);
      patch({ phase: previousPhase, error: failure.kind === 'error' ? failure.message : null, notice: failure.kind === 'info' ? failure.message : null,
        diagnostic: formatUpdateDiagnostic(cause, performance.now() - started, stage, state.localOnly, state.automatic) });
    } finally {
      busy = false;
      void invoke('set_update_check_schedule', { enabled: Boolean(state.workspaceId && state.automatic) }).catch(() => undefined);
    }
  },
  later() {
    if (state.version) write('scribe-updates:later:v1', state.version);
    patch({ toast: false, dialog: false });
  },
  open(showChangelog = false) { patch({ dialog: true, toast: false, showChangelog }); },
  close() { if (state.phase !== 'installing') patch({ dialog: false }); },
  setAutomatic(value: boolean, expectedWorkspaceId = state.workspaceId) {
    if (!expectedWorkspaceId || state.workspaceId !== expectedWorkspaceId) throw new Error('The workspace changed. Reopen About to change this preference.');
    saveAutomaticUpdates(expectedWorkspaceId, value);
    scopeRevision++;
    patch({ automatic: value });
  },
  async download() {
    if (!update || busy || state.phase !== 'available') return;
    busy = true;
    patch({ phase: 'downloading', error: null, downloaded: 0, total: null, toast: false, dialog: true });
    try {
      await update.download(event => {
        if (event.event === 'Started') patch({ total: event.data.contentLength ?? null });
        if (event.event === 'Progress') patch({ downloaded: state.downloaded + event.data.chunkLength });
      }, { timeout: 120_000 });
      patch({ phase: 'ready', toast: !state.dialog });
    } catch {
      patch({ phase: 'available', toast: !state.dialog, error: 'Download or verification failed. Nothing was installed. Check your connection and retry; if it continues, choose View releases to get the official installer.' });
    } finally { busy = false; }
  },
  async install() {
    if (!update || busy || state.phase !== 'ready') return;
    busy = true;
    patch({ phase: 'installing', error: null });
    let releaseCapture: (() => Promise<unknown>) | undefined;
    try {
      // Freeze capture before checking visibility and draining writes.
      await invoke('prepare_app_update');
      releaseCapture = () => invoke('finish_app_update');
      await prepareUpdateInstall();
      await update.install({ restartAfterInstall: true });
    } catch (cause) {
      patch({ phase: 'ready', error: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : 'Installation could not start. Keep Scribe open and try again.' });
    } finally {
      if (releaseCapture) await releaseCapture().catch(() => undefined);
      busy = false;
    }
  },
};
