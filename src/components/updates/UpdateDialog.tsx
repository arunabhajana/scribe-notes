import { useEffect, useRef } from 'react';
import { Download, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useUpdates, updateActions } from '../../features/updates/updateStore';
import { ChangeSections } from './WhatsNewDialog';
import { openReleasePage } from '../../features/updates/releaseLink';

export function UpdateDialog() {
  const state = useUpdates();
  const ref = useRef<HTMLDialogElement>(null);
  const installing = state.phase === 'installing';
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  const progress = state.total ? Math.min(100, Math.round(state.downloaded / state.total * 100)) : undefined;
  return <dialog ref={ref} className="scribe-update-dialog" aria-labelledby="app-update-title" onCancel={event => { event.preventDefault(); updateActions.close(); }}>
    <header className="update-dialog-header"><span className="update-icon"><Download size={22} /></span><button className="update-close" type="button" disabled={installing} onClick={updateActions.close} aria-label="Close update"><X size={18} /></button></header>
    <div className="update-eyebrow">A LITTLE BETTER, EVERY RELEASE</div>
    <h2 id="app-update-title">{state.phase === 'ready' ? 'Your update is ready' : installing ? 'Preparing to restart' : `Scribe ${state.version ?? ''} is available`}</h2>
    <p className="release-summary">{state.summary}</p>
    {state.changelog && <details className="update-details"><summary>See what’s changing</summary><ChangeSections log={state.changelog} /></details>}
    {state.phase === 'downloading' && <div className="update-progress" role="status"><progress max={100} value={progress} aria-label="Update download" /><span>{progress === undefined ? 'Downloading and verifying…' : `Downloading… ${progress}%`}</span></div>}
    {(state.phase === 'ready' || installing) && <p className="update-help">Scribe will close briefly to install the update, then reopen. Your notes and preferences stay on this device.</p>}
    {state.error && <><p className="update-error" role="alert">{state.error}</p><button type="button" className="update-secondary" onClick={() => void openReleasePage().catch(() => undefined)}>View releases</button></>}
    <footer><button type="button" className="update-secondary" disabled={installing} onClick={updateActions.later}>{state.phase === 'downloading' ? 'Continue in background' : 'Later'}</button>
      {state.phase === 'available' && <button type="button" className="update-primary" onClick={() => void updateActions.download()}><Download size={15} />{state.error ? 'Retry download' : 'Download update'}</button>}
      {(state.phase === 'ready' || installing) && <button type="button" className="update-primary" disabled={installing} onClick={() => void updateActions.install()}>{installing ? <LoaderCircle className="update-spin" size={15} /> : <RefreshCw size={15} />}{installing ? 'Preparing…' : 'Restart and install'}</button>}
    </footer>
  </dialog>;
}
