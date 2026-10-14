import { Bell, CheckCircle2, CloudOff, X } from "lucide-react";
import type { InAppNotification, NotificationTarget } from "../../features/notifications/desktopNotifications";
import { AppLogo } from "../AppLogo";
import { formatReminderTime } from "../../features/reminders/reminderTypes";
import "./appNotifications.css";
import { useEffect } from "react";

export function AppNotifications({ alerts, onDismiss, onOpen }: {
  alerts: InAppNotification[]; onDismiss: (id: string) => Promise<void>; onOpen: (target: NotificationTarget) => void;
}) {
  const syncAlert = alerts.find((alert) => alert.kind === "sync-error" || alert.kind === "sync-restored");
  const restoredId = syncAlert?.kind === "sync-restored" ? syncAlert.id : null;
  useEffect(() => {
    if (!restoredId) return;
    const timer = window.setTimeout(() => { void onDismiss(restoredId); }, 6000);
    return () => window.clearTimeout(timer);
  }, [restoredId, onDismiss]);
  const captureId = alerts.find((alert) => alert.kind === "quick-capture")?.id;
  useEffect(() => {
    if (!captureId) return;
    const timer = window.setTimeout(() => { void onDismiss(captureId); }, 8000);
    return () => window.clearTimeout(timer);
  }, [captureId, onDismiss]);
  const cards = alerts.filter((alert) => alert.kind !== "sync-error" && alert.kind !== "sync-restored");
  if (!alerts.length) return null;
  return <section className="app-notification-stack" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
    {syncAlert && <div className="app-sync-notice" role="status">
      {syncAlert.kind === "sync-error" ? <CloudOff size={17} /> : <CheckCircle2 size={17} />}
      <div><strong>{syncAlert.title}</strong><p>{syncAlert.body}</p></div>
      <button type="button" className="app-notification-close" aria-label="Dismiss sync notification" onClick={() => { void onDismiss(syncAlert.id); }}><X size={15} /></button>
    </div>}
    {cards.length > 3 && <span className="app-notification-count">{cards.length} notifications · dismiss to see more</span>}
    {cards.slice(-3).reverse().map((alert) => <article className={`app-notification is-${alert.kind}`} key={alert.id}>
      <header><AppLogo variant="transparent" /><span>Scribe</span>
        <span className="app-notification-category">{alert.kind === "reminder" ? <><Bell size={12} />Reminder</> : alert.kind === "sync-error" ? <><CloudOff size={12} />Sync error</> : <><CheckCircle2 size={12} />{alert.kind === "sync-restored" ? "Sync restored" : "Captured"}</>}</span>
        <button type="button" className="app-notification-close" aria-label="Dismiss notification" data-tooltip="Dismiss notification" onClick={() => { void onDismiss(alert.id); }}><X size={15} /></button>
      </header>
      <h3>{alert.title}</h3>
      <p>{alert.kind === "reminder" ? "You scheduled a reminder for this note." : alert.body}</p>
      {alert.kind === "reminder" && alert.dueAt && <time dateTime={new Date(alert.dueAt).toISOString()}>{alert.body === "Note reminder" ? "Scheduled for" : alert.body + " ·"} {formatReminderTime(new Date(alert.dueAt).toISOString())}</time>}
      <div className="app-notification-actions">
        {alert.noteId && <button type="button" className="notification-open" onClick={() => onOpen({ userId: alert.userId, noteId: alert.noteId! })}>Open note</button>}
        {alert.kind === "reminder" && <span data-tooltip="Snooze is coming soon" tabIndex={0}><button type="button" disabled>Snooze</button></span>}
        <button type="button" onClick={() => { void onDismiss(alert.id); }}>Dismiss</button>
      </div>
    </article>)}
  </section>;
}
