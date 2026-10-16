import { useState } from 'react';

export function UpdateDiagnostics({ report }: { report: string }) {
  const [feedback, setFeedback] = useState('');
  return <details className="update-diagnostics">
    <summary>Update debug details</summary>
    <p>These details stay in the app. No notes, passwords or account identifiers are included.</p>
    <pre>{report}</pre>
    <button type="button" className="update-secondary" onClick={async () => {
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(report);
        setFeedback('Copied debug details.');
      } catch { setFeedback('Could not copy. Select the details above to copy them manually.'); }
    }}>Copy debug details</button>
    {feedback && <p role="status">{feedback}</p>}
  </details>;
}
