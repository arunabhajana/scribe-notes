import { useEffect, useRef, useState } from 'react';
import { Globe, X } from 'lucide-react';
import { openLegalPage, privacyUrl } from '../../features/auth/accountTerms';

export function AutomaticUpdatesDialog({ localOnly, onConfirm, onClose }: {
  localOnly: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="scribe-update-dialog automatic-updates-dialog" aria-labelledby="automatic-updates-title" aria-describedby="automatic-updates-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="update-dialog-header"><span className="update-icon"><Globe size={22} /></span><button className="update-close" type="button" aria-label="Close automatic update explanation" onClick={onClose}><X size={18} /></button></header>
    <h2 id="automatic-updates-title">Enable automatic update checks?</h2>
    <p className="release-summary" id="automatic-updates-description">Scribe will use the internet to look for new versions while you use {localOnly ? 'this offline profile' : 'this workspace'}.</p>
    <ul className="update-consent-details">
      <li>Scribe contacts GitHub Releases on each launch and every 30 minutes while running, including in the system tray. GitHub receives your IP address and standard network request information.</li>
      <li>Your notes, display name and Scribe sign-in details are not included in update requests. This does not enable cloud sync or upload your notes.</li>
      <li>If desktop notifications are enabled, a new version can show a Windows notification while Scribe is in the background, with shortcuts to the install screen and changelog.</li>
      <li>Downloads and installation still require your action. You can turn checks off in About at any time, or check manually instead.</li>
    </ul>
    <p className="update-help">This choice is saved for this workspace on this device. {localOnly && 'Your offline notes remain available without an internet connection.'}</p>
    <a className="update-privacy-link" href={privacyUrl} onClick={event => { event.preventDefault(); void openLegalPage(privacyUrl).catch(() => setError('Could not open the privacy page. Please try again.')); }}>How Scribe Handles Your Data</a>
    {error && <p className="update-error" role="alert">{error}</p>}
    <footer><button ref={cancel} type="button" className="update-secondary" onClick={onClose}>Keep checks off</button><button type="button" className="update-primary" onClick={() => { try { onConfirm(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this preference. Try again.'); } }}>Enable checks</button></footer>
  </dialog>;
}
