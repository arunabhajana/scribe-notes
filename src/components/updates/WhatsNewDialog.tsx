import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, X } from 'lucide-react';
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

function ChangeCard({ item, type }: { item: string; type: ChangeType }) {
  const [expanded, setExpanded] = useState(false);
  const [expandable, setExpandable] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element || expanded) return;
    let active = true;
    const measure = () => { if (active) setExpandable(element.scrollHeight > element.clientHeight + 1); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [item, expanded]);
  return <article className="whats-new-card">
    <span className={`whats-new-card-icon change-${type}`} aria-hidden="true">{type === 'fixed' ? <Check size={16} /> : <ArrowUpRight size={16} />}</span>
    <div><p ref={paragraph} id={id} className={!expanded ? 'whats-new-card-preview' : ''}>{item}</p>
      {expandable && <button type="button" className="whats-new-expand" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Read more'}</button>}
    </div>
  </article>;
}

function ChangeCards({ log }: { log: Changelog }) {
  return <div className="whats-new-sections">{log.sections.map(section => <section key={section.type} aria-label={labels[section.type]}>
    <div className="whats-new-section-heading"><span className={`change-chip change-${section.type}`}>{labels[section.type]}</span><span>{section.items.length} {section.items.length === 1 ? 'change' : 'changes'}</span></div>
    <div className="whats-new-cards">{section.items.map((item, index) => <ChangeCard key={index} item={item} type={section.type} />)}</div>
  </section>)}</div>;
}

export function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(appVersion);
  const log = changelogs.find(entry => entry.version === version);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="scribe-update-dialog whats-new-dialog" aria-labelledby="whats-new-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="whats-new-header">
      <div className="whats-new-heading-row"><h2 id="whats-new-title">What’s new</h2><div className="whats-new-header-actions"><span className="whats-new-installed">{appVersion}<span>Installed</span></span><button className="update-close" type="button" onClick={onClose} aria-label="Close What’s New"><X size={18} /></button></div></div>
      <p className="whats-new-tagline">A smoother, more reliable experience. Here’s what’s improved.</p>
      <div className="update-version-select"><span>Release</span><VersionDropdown value={version} onChange={value => { setVersion(value); if (content.current) content.current.scrollTop = 0; }} options={changelogs.map(entry => ({ value: entry.version, label: `${entry.version}${entry.version === appVersion ? ' · Installed' : ''}` }))} /></div>
    </header>
    <div ref={content} className="whats-new-content" tabIndex={0} role="region" aria-label={`Changes in version ${version}`}>
      {log ? <><h3 className="whats-new-release-title">{log.title}</h3><ChangeCards key={version} log={log} /></> : <p className="release-summary">Release notes are not available for this version.</p>}
    </div>
    <footer><button type="button" className="update-primary" onClick={onClose}>Done</button></footer>
  </dialog>;
}
