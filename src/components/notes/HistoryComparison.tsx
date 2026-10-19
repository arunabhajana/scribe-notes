import { useMemo } from 'react';
import { compareText, type TextChange } from '../../features/notes/textComparison';

function TextVersion({ changes, side }: { changes: TextChange[]; side: 'earlier' | 'current' }) {
  return <>{changes.filter(change => change.kind !== (side === 'earlier' ? 'added' : 'removed')).map((change, index) => change.kind === 'same' ? <span key={index}>{change.text}</span> : <mark className={`history-${change.kind}`} key={index}>{change.text}</mark>)}</>;
}

export function HistoryComparison({ earlier, current }: { earlier: { title: string; body: string }; current: { title: string; body: string } }) {
  const title = useMemo(() => compareText(earlier.title, current.title), [earlier.title, current.title]);
  const body = useMemo(() => compareText(earlier.body, current.body), [earlier.body, current.body]);
  const same = earlier.title === current.title && earlier.body === current.body;
  return <div className="history-comparison">
    <p className="workspace-muted">{same ? 'This version matches the current text.' : 'Highlighted text differs between versions. Large rewrites are grouped to keep comparison responsive.'}</p>
    <div className="history-comparison-columns">
      {(['earlier', 'current'] as const).map(side => <section key={side} aria-label={side === 'earlier' ? 'Earlier text' : 'Current text'}>
        <h3>{side === 'earlier' ? 'Earlier version' : 'Current note'}</h3>
        <small className={`history-legend history-${side === 'earlier' ? 'removed' : 'added'}`}>{side === 'earlier' ? 'Earlier-only text' : 'Current-only text'}</small>
        <h4><TextVersion changes={title} side={side}/>{!(side === 'earlier' ? earlier.title : current.title) && 'Untitled note'}</h4>
        <pre><TextVersion changes={body} side={side}/>{!(side === 'earlier' ? earlier.body : current.body) && 'Empty note'}</pre>
      </section>)}
    </div>
  </div>;
}
