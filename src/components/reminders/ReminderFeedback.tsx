import { useEffect } from "react";
import { Check, X } from "lucide-react";

export function ReminderFeedback({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 2600);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  return <div className="status-toast-stack"><div className="status-toast is-success" role="status">
    <span className="status-toast-icon"><Check size={18} /></span><span>{message}</span>
    <button type="button" aria-label="Dismiss notification" onClick={onDismiss}><X size={15} /></button>
  </div></div>;
}
