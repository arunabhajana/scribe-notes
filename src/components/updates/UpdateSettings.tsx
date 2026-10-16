import { useId, useState } from 'react';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { useUpdates, updateActions } from '../../features/updates/updateStore';
import { WhatsNewDialog } from './WhatsNewDialog';
import { openReleasePage } from '../../features/updates/releaseLink';
import { AutomaticUpdatesDialog } from './AutomaticUpdatesDialog';
import { useWorkspaceId } from '../../features/settings/workspacePreferences';
import { UpdateDiagnostics } from './UpdateDiagnostics';

// Keep diagnostics available for troubleshooting, but hide the UI in this release.
const showUpdateDiagnostics = false;

export function UpdateSettings({ localOnly = false }: { localOnly?: boolean }) {
  const state = useUpdates();
  const [showNotes, setShowNotes] = useState(false);
  const [consentWorkspace, setConsentWorkspace] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState('');
  const workspaceId = useWorkspaceId();
  const automaticDescriptionId = useId();
  const busy = state.phase === 'checking' || state.phase === 'installing';
  return <div className="update-settings" id="setting-app-updates">
    <div className="update-settings-row"><div><strong>App updates</strong><p>{state.version ? `Scribe ${state.version}${state.phase === 'ready' ? ' is ready to install.' : ' is available.'}` : state.checkedAt && !state.error && !state.notice ? 'You’re up to date.' : 'Get the latest improvements from GitHub Releases.'}</p></div>
      {state.version ? <button type="button" className="update-primary" disabled={busy} onClick={updateActions.open}><Download size={15} />{state.phase === 'ready' ? 'Install update' : state.phase === 'downloading' ? 'View download' : 'View update'}</button> : <button type="button" className="update-secondary" disabled={busy} onClick={() => void updateActions.check()}><RefreshCw size={15} className={busy ? 'update-spin' : ''} />{busy ? 'Checking…' : 'Check for updates'}</button>}
    </div>
    {(state.error || state.notice) && <div className="update-feedback">{state.error ? <p className="update-error" role="alert">{state.error}</p> : <p className="update-notice" role="status">{state.notice}</p>}<button type="button" className="update-secondary" onClick={() => void openReleasePage().catch(() => undefined)}>View releases</button></div>}
    {showUpdateDiagnostics && state.diagnostic && <UpdateDiagnostics key={state.diagnostic} report={state.diagnostic} />}
    {state.version && <p className="update-help">{state.summary}</p>}
    <div className="update-auto"><div className="update-auto-copy"><strong>Automatically check for updates</strong><small id={automaticDescriptionId}>{localOnly ? 'Off by default for offline profiles. Enable to check GitHub using the internet.' : 'Check GitHub for new versions, even with cloud sync off.'} Downloads start when you choose to update.</small></div>
      <button type="button" className={`setting-switch update-auto-switch${state.automatic ? ' checked' : ''}`} role="switch" aria-checked={state.automatic} aria-label="Automatically check for updates" aria-describedby={automaticDescriptionId} disabled={!workspaceId} onClick={() => {
      setPreferenceError('');
      if (!state.automatic) setConsentWorkspace(workspaceId);
      else { try { updateActions.setAutomatic(false, workspaceId); } catch (cause) { setPreferenceError(cause instanceof Error ? cause.message : 'Could not save this preference.'); } }
    }}><span /></button></div>
    {preferenceError && <p className="update-error" role="alert">{preferenceError}</p>}
    <div className="update-settings-row" id="setting-whats-new"><div><strong>What’s New</strong><p>Explore features, improvements and fixes in each release.</p></div><button type="button" className="update-secondary" onClick={() => setShowNotes(true)}><Sparkles size={15} />What’s New</button></div>
    {showNotes && <WhatsNewDialog onClose={() => setShowNotes(false)} />}
    {consentWorkspace && consentWorkspace === workspaceId && <AutomaticUpdatesDialog localOnly={localOnly} onClose={() => setConsentWorkspace(null)} onConfirm={() => {
      updateActions.setAutomatic(true, consentWorkspace); setConsentWorkspace(null); void updateActions.check(false);
    }} />}
  </div>;
}
