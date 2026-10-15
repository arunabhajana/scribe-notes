import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, X } from "lucide-react";

export function LoadingSpinner() {
  return <LoaderCircle className="loading-spinner" size={17} aria-hidden="true" />;
}

export function NotesSkeleton() {
  return <div className="notes-skeleton" role="status" aria-label="Loading Notes" aria-busy="true">
    {[0, 1, 2, 3].map((item) => <div className="skeleton-card" key={item} aria-hidden="true">
      <span className="skeleton-block skeleton-title" />
      <span className="skeleton-block" /><span className="skeleton-block skeleton-short" />
      <span className="skeleton-block skeleton-meta" />
    </div>)}
  </div>;
}

export function EditorSkeleton() {
  return <section className="editor-pane editor-skeleton" role="status" aria-label="Loading Note content" aria-busy="true">
    <span className="skeleton-block skeleton-title" />
    {[0, 1, 2, 3, 4].map((item) => <span className={`skeleton-block ${item === 4 ? "skeleton-short" : ""}`} key={item} aria-hidden="true" />)}
  </section>;
}

export function StatusToast({ message, busy = false, onDismiss, actions }: {
  message: string;
  busy?: boolean;
  onDismiss?: () => void;
  actions?: { label: string; onClick: () => void }[];
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <div className={`status-toast ${busy ? "is-busy" : "is-error"}`} role={busy ? "status" : "alert"}>
    <span className="status-toast-icon">{busy ? <LoadingSpinner /> : <AlertCircle size={18} />}</span>
    <span>{message}{actions && <span className="status-toast-actions">{actions.map(action => <button type="button" key={action.label} onClick={action.onClick}>{action.label}</button>)}</span>}</span>
    <button type="button" aria-label="Dismiss notification" onClick={() => {
      setDismissed(true);
      onDismiss?.();
    }}><X size={15} /></button>
  </div>;
}

export function SyncFeedback({ error, syncing, loading, onDismiss, onRetry, onStorage, onTrash }: {
  error: string | null;
  syncing: boolean;
  loading: boolean;
  onDismiss: () => void;
  onRetry?: () => void;
  onStorage?: () => void;
  onTrash?: () => void;
}) {
  const [showSync, setShowSync] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (syncing && !error) {
      if (shownAt.current) return;
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setShowSync(true);
      }, 1000);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      shownAt.current = 0;
      setShowSync(false);
    }, Math.max(0, 2000 - (Date.now() - shownAt.current)));
    return () => window.clearTimeout(timer);
  }, [syncing, error]);
  return <div className="status-toast-stack">
    {error && <StatusToast key={error} message={error} onDismiss={onDismiss} actions={error.includes("Cloud storage") ? [
      ...(onStorage ? [{ label: "View storage", onClick: onStorage }] : []),
      ...(onTrash ? [{ label: "Open Trash", onClick: onTrash }] : []),
    ] : /cloud sync|reminder sync/i.test(error) && onRetry ? [{ label: "Retry sync", onClick: onRetry }] : undefined} />}
    {showSync && <StatusToast busy message={loading ? "Loading your Notes…" : "Syncing your Notes…"} />}
  </div>;
}
