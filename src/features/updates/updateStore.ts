import { invoke, isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { useSyncExternalStore } from 'react';
import { updateChangelog } from './changelogs';
import { prepareUpdateInstall } from './installSafety';
import type { Changelog } from '../../../scripts/lib/changelog.mts';

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing';
type State = {
  phase: Phase; version: string | null; summary: string; changelog: Changelog | null;
  downloaded: number; total: number | null; error: string | null; checkedAt: number | null;
  configured: boolean | null; automatic: boolean; toast: boolean; dialog: boolean;
};
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* In-memory controls still work. */ } };
const autoKey = 'scribe-updates:auto:v1';
const checkKey = 'scribe-updates:last-check:v1';
let state: State = { phase: 'idle', version: null, summary: '', changelog: null, downloaded: 0, total: null,
  error: null, checkedAt: null, configured: null, automatic: read(autoKey) !== 'false', toast: false, dialog: false };
const listeners = new Set<() => void>();
let update: Update | null = null;
let busy = false;
const cooldown = 6 * 60 * 60 * 1000;
function patch(next: Partial<State>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useUpdates() { return useSyncExternalStore(subscribe, () => state); }

export const updateActions = {
  async check(manual = true) {
    if (busy || state.phase === 'ready' || state.phase === 'installing') return;
    if (!isTauri()) { if (manual) patch({ configured: false, error: 'Update checks are available in the installed Windows app.' }); return; }
    if (!manual) {
      if (!state.automatic) return;
      const last = Number(read(checkKey));
      if (Number.isFinite(last) && last > 0 && Date.now() - last >= 0 && Date.now() - last < cooldown) return;
    }
    busy = true;
    const previousPhase = state.phase;
    patch({ phase: 'checking', error: null });
    try {
      const configured = await invoke<boolean>('updater_configured');
      patch({ configured });
      if (!configured) {
        patch({ phase: previousPhase, error: manual ? 'Updates are not configured in this build. Install an official release to receive signed updates.' : null });
        return;
      }
      const candidate = await check({ timeout: 20_000 });
      if (update) await update.close().catch(() => undefined);
      update = candidate;
      const now = Date.now();
      write(checkKey, String(now));
      if (candidate) {
        const log = updateChangelog(candidate.rawJson.changelog, candidate.version);
        patch({ phase: 'available', version: candidate.version, summary: log?.summary ?? candidate.body?.slice(0, 240) ?? 'A new version of Scribe is ready.',
          changelog: log, checkedAt: now, toast: manual || read('scribe-updates:later:v1') !== candidate.version });
      } else patch({ phase: 'idle', version: null, summary: '', changelog: null, toast: false, checkedAt: now });
    } catch {
      patch({ phase: previousPhase, error: 'Could not check for updates. Check your connection and try again from About.' });
    } finally { busy = false; }
  },
  later() {
    if (state.version) write('scribe-updates:later:v1', state.version);
    patch({ toast: false, dialog: false });
  },
  open() { patch({ dialog: true, toast: false }); },
  close() { if (state.phase !== 'installing') patch({ dialog: false }); },
  setAutomatic(value: boolean) { write(autoKey, String(value)); patch({ automatic: value }); },
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
