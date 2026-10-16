import { ArrowUpRight, Download } from 'lucide-react';
import './updates.css';

export function UpdateToast({ version, summary, ready = false, error, onUpdate, onLater }: {
  version: string; summary: string; ready?: boolean; error?: string | null; onUpdate: () => void; onLater: () => void;
}) {
  return <aside className="update-toast" role="status" aria-label="Scribe update available">
    <span className="update-toast-icon"><Download size={20} /></span><div><strong>{error ? 'Your update needs attention' : `Scribe ${version} is ${ready ? 'ready to install' : 'available'}`}</strong><p>{error ?? summary}</p>
      <div className="update-toast-actions"><button type="button" className="update-primary" onClick={onUpdate}>Update now <ArrowUpRight size={13} /></button><button type="button" className="update-secondary" onClick={onLater}>Later</button></div>
    </div>
  </aside>;
}
