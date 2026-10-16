import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, MousePointer2, X } from 'lucide-react';
import { useUpdates } from '../../features/updates/updateStore';
import { workspaceTourSteps, type TourRoute } from '../../features/onboarding/tourSteps';
import { findTourTarget, placeTourCard, useTourAnchor } from '../../features/onboarding/useTourAnchor';
import { closeContextMenu } from '../context-menu/contextMenuState';
import './workspaceTour.css';

type TourProps = {
  displayName: string; localOnly: boolean; shortcut: string; cloudSync: boolean;
  quickCapture: boolean; desktopNotifications: boolean; reminders: boolean;
  launch: boolean; tray: boolean; step: string; composerOpen: boolean;
  dark: boolean; accentColor: string;
  practiceNoteId?: string | null; practiceNoteAvailable?: boolean;
  onStepChange: (step: string) => void; onNavigate: (route: TourRoute) => void;
  onClose: () => void; onFinish: () => void;
};
const focusable = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';

export default function WorkspaceTour(props: TourProps) {
  const { step: stepId, localOnly, shortcut, onNavigate, onClose, onStepChange } = props;
  const steps = useMemo(() => workspaceTourSteps(localOnly, shortcut), [localOnly, shortcut]);
  const index = Math.max(0, steps.findIndex(step => step.id === stepId));
  const baseStep = steps[index];
  const continuingDraft = baseStep.id === 'new-note' && props.composerOpen;
  const step = continuingDraft ? { ...baseStep, target: '.composer-window', interactive: false, actionLabel: undefined,
    title: 'Continue the draft you already started.', description: 'Your draft is still here. We’ll use it to explore the editor. Skipping the tour keeps it open.' } : baseStep;
  const targetSelector = step.id === 'delete-note' && props.practiceNoteId ? `.note-card[data-context-note="${props.practiceNoteId}"]` : step.target;
  const anchor = useTourAnchor(targetSelector);
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 350, height: 320 });
  const updates = useUpdates();
  const position = placeTourCard(anchor, size, step.placement);
  const dockWidth = step.placement === 'settings' && anchor.rail ? Math.min(300, anchor.rail.width - 24) : undefined;

  useEffect(() => { if (step.route) onNavigate(step.route); }, [step.route, onNavigate]);
  useEffect(() => () => { if (step.id === 'delete-menu') closeContextMenu(); }, [step.id]);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const resize = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize(previous => previous.width === rect.width && previous.height === rect.height ? previous : { width: rect.width, height: rect.height });
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const element = anchor.element;
    if (!element || !targetSelector) return;
    const oldDescription = element.getAttribute('aria-describedby');
    element.setAttribute('aria-describedby', `${oldDescription ? `${oldDescription} ` : ''}workspace-tour-description`);
    const clicked = () => { if (step.clickTo) onStepChange(step.clickTo); };
    element.addEventListener('click', clicked);
    return () => {
      element.removeEventListener('click', clicked);
      if (oldDescription === null) element.removeAttribute('aria-describedby'); else element.setAttribute('aria-describedby', oldDescription);
    };
  }, [anchor.element, targetSelector, step.clickTo, onStepChange]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = findTourTarget(targetSelector);
      if (step.interactive && target?.matches('input, textarea')) target.focus({ preventScroll: true });
      else panel.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [step.id, targetSelector, step.interactive]);
  useEffect(() => {
    const allowed = () => {
      const target = findTourTarget(targetSelector);
      const controls = step.interactive && target ? [target, ...target.querySelectorAll<HTMLElement>(focusable)].filter(element => element.matches(focusable)) : [];
      return [...controls, ...panel.current?.querySelectorAll<HTMLElement>(focusable) ?? []].filter(element => element.getClientRects().length > 0);
    };
    const keydown = (event: KeyboardEvent) => {
      // Native consent/release dialogs use the browser's top layer. Let their
      // focus and Escape handling run, then continue at this same tour step.
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = allowed();
      if (!controls.length) return;
      event.preventDefault();
      const current = controls.indexOf(document.activeElement as HTMLElement);
      controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus({ preventScroll: true });
    };
    const focus = (event: FocusEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const target = event.target as Node;
      if (panel.current?.contains(target) || (step.interactive && findTourTarget(targetSelector)?.contains(target))) return;
      panel.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown, true); document.addEventListener('focusin', focus);
    return () => { document.removeEventListener('keydown', keydown, true); document.removeEventListener('focusin', focus); };
  }, [targetSelector, step.interactive, onClose]);

  const moveTo = (id: string) => {
    if (id === 'write') document.querySelector<HTMLButtonElement>('.composer-format-toolbar button[aria-label="Edit note"]')?.click();
    onStepChange(id);
  };
  const next = () => {
    if (step.id === 'finish') { props.onFinish(); return; }
    if (continuingDraft) { moveTo('write'); return; }
    if (step.id === 'delete-note') {
      const target = findTourTarget(targetSelector);
      if (target) {
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 24, clientY: rect.top + 24 }));
      }
      return;
    }
    if (step.actionLabel) { findTourTarget(targetSelector)?.click(); return; }
    moveTo(steps[index + 1].id);
  };
  const back = () => {
    let previous = index - 1;
    while (previous > 0 && (steps[previous].id === 'delete-menu' || (steps[previous].requiresComposer && !props.composerOpen) || (steps[previous].requiresPracticeNote && !props.practiceNoteAvailable))) previous--;
    moveTo(steps[previous].id);
  };
  let status = '';
  if (step.id === 'windows') status = `Quick Capture ${props.quickCapture ? 'on' : 'off'} · Startup ${props.launch ? 'on' : 'off'} · Tray ${props.tray ? 'on' : 'off'}`;
  if (step.id === 'notifications') status = `Reminders ${props.reminders ? 'on' : 'off'} · Desktop alerts ${props.desktopNotifications ? 'on' : 'off'}`;
  if (step.id === 'updates') status = `Automatic checks are ${updates.automatic ? 'on' : 'off'}`;
  if (step.id === 'transfer' && !localOnly) status = `Cloud sync is ${props.cloudSync ? 'on' : 'off'}`;
  const rect = anchor.rect;
  return createPortal(<div className={`workspace-tour-layer ${props.dark ? 'theme-dark' : 'theme-light'}`} data-tour-step={step.id} style={{ '--tour-accent': props.accentColor } as CSSProperties}>
    {rect ? <>
      <div className="tour-shade" style={{ inset: '0 0 auto 0', height: rect.top }} />
      <div className="tour-shade" style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }} />
      <div className="tour-shade" style={{ left: rect.right, right: 0, top: rect.top, height: rect.height }} />
      <div className="tour-shade" style={{ inset: `${rect.bottom}px 0 0 0` }} />
      <div className="tour-spotlight" aria-hidden="true" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
      {!step.interactive && <div className="tour-target-shield" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />}
    </> : <div className="tour-shade" style={{ inset: 0 }} />}
    <div ref={panel} className={`workspace-tour ${!targetSelector ? 'tour-centered' : ''}`} role="dialog" aria-labelledby="workspace-tour-title" aria-describedby="workspace-tour-description" tabIndex={-1} style={{ ...position, width: dockWidth }} onPointerDown={event => event.stopPropagation()}>
      <header><span className="tour-brand">{step.section}</span><button type="button" className="tour-icon-button" aria-label="Close tour" onClick={onClose}><X size={16} /></button></header>
      <div className="tour-body" key={step.id}>
        {step.id === 'welcome' && <p className="tour-greeting">Welcome to Scribe, {props.displayName}.</p>}
        {step.id === 'finish' && <span className="tour-step-icon"><Check size={24} /></span>}
        <h2 id="workspace-tour-title">{step.title}</h2><p id="workspace-tour-description">{step.description}</p>
        {step.interactive && <p className="tour-interaction"><MousePointer2 size={13} />Try the highlighted control</p>}
        {status && <p className="tour-current-status">{status}</p>}
        {targetSelector && !rect && <p className="tour-waiting" role="status">Finding this control… You can go back or skip at any time.</p>}
      </div>
      <footer><div className="tour-progress"><span>{index + 1} of {steps.length}</span><progress aria-label="Tour progress" value={index + 1} max={steps.length} /></div>
        <div className="tour-actions"><button type="button" className="tour-skip" onClick={onClose}>Skip tour</button>{index > 0 && <button type="button" className="tour-back" onClick={back} aria-label="Previous tour step"><ArrowLeft size={14} /></button>}
          <button type="button" className="tour-next" disabled={Boolean(step.actionLabel && !rect)} onClick={next}>{step.id === 'welcome' ? 'Show me around' : step.id === 'finish' ? 'Back to my notes' : continuingDraft ? 'Continue my draft' : step.actionLabel ?? 'Next'}<ArrowRight size={14} /></button></div>
        {step.id === 'new-note' && !props.composerOpen && <button type="button" className="tour-skip-practice" onClick={() => onStepChange('organize')}>Skip note practice</button>}
        {step.requiresPracticeNote && <button type="button" className="tour-skip-practice" onClick={() => onStepChange('organize')}>Keep this note</button>}
      </footer>
    </div>
  </div>, document.body);
}
