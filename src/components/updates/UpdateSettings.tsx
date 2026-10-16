import { useState } from 'react';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { useUpdates, updateActions } from '../../features/updates/updateStore';
import { WhatsNewDialog } from './WhatsNewDialog';
import { openReleasePage } from '../../features/updates/releaseLink';

export function UpdateSettings() {
  const state = useUpdates();
  const [showNotes, setShowNotes] = useState(false);
  const busy = state.phase === 'checking' || state.phase === 'installing';
  return <div className="update-settings" id="setting-app-updates">
    <div className="update-settings-row"><div><strong>App updates</strong><p>{state.version ? `Scribe ${state.version}${state.phase === 'ready' ? ' is ready to install.' : ' is available.'}` : state.checkedAt ? 'You’re up to date.' : 'Get the latest improvements from GitHub Releases.'}</p></div>
      {state.version ? <button type="button" className="update-primary" disabled={busy} onClick={updateActions.open}><Download size={15} />{state.phase === 'ready' ? 'Install update' : state.phase === 'downloading' ? 'View download' : 'View update'}</button> : <button type="button" className="update-secondary" disabled={busy} onClick={() => void updateActions.check()}><RefreshCw size={15} className={busy ? 'update-spin' : ''} />{busy ? 'Checking…' : 'Check for updates'}</button>}
    </div>
    {state.error && <><p className="update-error" role="alert">{state.error}</p><button type="button" className="update-secondary" onClick={() => void openReleasePage().catch(() => undefined)}>View releases</button></>}
    {state.version && <p className="update-help">{state.summary}</p>}
    <label className="update-auto"><input type="checkbox" checked={state.automatic} onChange={event => updateActions.setAutomatic(event.target.checked)} /><span><strong>Automatically check for updates</strong><small>Contacts GitHub, including when cloud sync is off. Downloads start when you choose to update. Applies to this installation.</small></span></label>
    <div className="update-settings-row" id="setting-whats-new"><div><strong>What’s New</strong><p>Explore features, improvements and fixes in each release.</p></div><button type="button" className="update-secondary" onClick={() => setShowNotes(true)}><Sparkles size={15} />What’s New</button></div>
    {showNotes && <WhatsNewDialog onClose={() => setShowNotes(false)} />}
  </div>;
}
