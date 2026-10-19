import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-react';
import { FIND_LIMIT } from '../../features/notes/findText';

export type NoteFindState = { query: string; matchCase: boolean; index: number; request: number };
export function NoteFindBar({ value, count, onChange, onNavigate, onClose }: {
  value: NoteFindState; count: number; onChange: (value: NoteFindState) => void; onNavigate: (direction: number) => void; onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return <div className="note-find-bar" role="search" aria-label="Find in this note" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Enter') { event.preventDefault(); onNavigate(event.shiftKey ? -1 : 1); }
  }}>
    <input ref={input} maxLength={5000} aria-label="Find in note" placeholder="Find in this note…" value={value.query} onChange={event => onChange({ ...value, query: event.target.value, index: 0, request: value.request + 1 })}/>
    <span className="note-find-count" role="status" aria-live="polite">{value.query ? count ? `${Math.min(value.index + 1, count)} / ${count}${count >= FIND_LIMIT ? '+' : ''}` : 'No matches' : ''}</span>
    <button type="button" aria-label="Match case" aria-pressed={value.matchCase} title="Match case" onClick={() => onChange({ ...value, matchCase: !value.matchCase, index: 0, request: value.request + 1 })}><CaseSensitive size={16}/></button>
    <button type="button" aria-label="Previous match" title="Previous match · Shift+Enter" disabled={!count} onClick={() => onNavigate(-1)}><ArrowUp size={15}/></button>
    <button type="button" aria-label="Next match" title="Next match · Enter" disabled={!count} onClick={() => onNavigate(1)}><ArrowDown size={15}/></button>
    <button type="button" aria-label="Close find" title="Close · Escape" onClick={onClose}><X size={16}/></button>
  </div>;
}
