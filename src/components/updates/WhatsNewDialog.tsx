import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { Changelog, ChangeType } from '../../../scripts/lib/changelog.mts';
import { appVersion, changelogs } from '../../features/updates/changelogs';
import './updates.css';
import { VersionDropdown } from './VersionDropdown';

const labels: Record<ChangeType, string> = { feature: 'Feature', improved: 'Improved', fixed: 'Fixed', security: 'Security', changed: 'Changed' };

export function ChangeSections({ log }: { log: Changelog }) {
  return <div className="change-sections">{log.sections.map(section => <section key={section.type}>
    <span className={`change-chip change-${section.type}`}>{labels[section.type]}</span>
    <ul>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
  </section>)}</div>;
}

export function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [version, setVersion] = useState(appVersion);
  const log = changelogs.find(entry => entry.version === version);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="scribe-update-dialog whats-new-dialog" aria-labelledby="whats-new-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="update-dialog-header"><span className="update-icon"><Sparkles size={22} /></span><button className="update-close" type="button" onClick={onClose} aria-label="Close What’s New"><X size={18} /></button></header>
    <div className="update-eyebrow">MADE FOR YOUR EVERYDAY</div>
    <h2 id="whats-new-title">What’s new in Scribe</h2>
    <div className="update-version-select"><span>Version</span><VersionDropdown value={version} onChange={setVersion} options={changelogs.map(entry => ({ value: entry.version, label: `${entry.version}${entry.version === appVersion ? ' · Installed' : ''}` }))} /></div>
    {log ? <><h3 className="release-title">{log.title}</h3><p className="release-summary">{log.summary}</p><ChangeSections log={log} /></> : <p className="release-summary">Release notes are not available for this version.</p>}
    <footer><button type="button" className="update-primary" onClick={onClose}>Done</button></footer>
  </dialog>;
}
