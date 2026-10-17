import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { registerUpdateGuard } from '../../features/updates/installSafety';
import './workspaceTools.css';

export function WorkspaceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    const stop = registerUpdateGuard(() => { throw new Error('Finish the open note dialog before installing an update.'); });
    return () => { stop(); dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="workspace-dialog" aria-label={title} data-sync-editing="true" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></header>
    <div className="workspace-dialog-content">{children}</div>
  </dialog>;
}
