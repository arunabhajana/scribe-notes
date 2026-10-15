import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, X } from "lucide-react";
import { openLegalPage, privacyUrl } from "../../features/auth/accountTerms";
import "./cloudSync.css";

export function CloudSyncDialog({ enabling, onConfirm, onClose }: { enabling: boolean; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const close = () => { if (!busy.current) onClose(); };
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog className="cloud-sync-dialog" ref={dialog} aria-labelledby="cloud-sync-title" aria-describedby="cloud-sync-description" onCancel={event => { event.preventDefault(); close(); }}>
    <header><span className="cloud-sync-dialog-icon">{enabling ? <Cloud size={22} /> : <CloudOff size={22} />}</span><button className="cloud-sync-close" type="button" aria-label="Close" onClick={close} disabled={working}><X size={18} /></button></header>
    <h2 id="cloud-sync-title">{enabling ? "Enable cloud sync?" : "Turn off cloud sync?"}</h2>
    <p id="cloud-sync-description">{enabling ? "Keep this device’s workspace in sync with your account." : "Keep working locally on this device. Your notes and reminders will stay available here."}</p>
    <ul>{enabling ? <>
      <li>Notes, titles, formatting, folders, pins, drafts, Trash and reminders will be uploaded to Supabase and kept in sync.</li>
      <li>Existing cloud notes and changes from other synced devices will download here. Pending local changes will also upload. If cloud data was deleted, enabling sync again can restore notes kept on this device.</li>
      <li>Your account has 2 MB of cloud storage. Cloud notes are not end-to-end encrypted, and Scribe does not maintain project backups.</li>
    </> : <>
      <li>New notes, edits, folders and reminders will no longer upload or download on this device.</li>
      <li>Other devices will not receive your new changes. Local edits will sync if you enable cloud sync again.</li>
      <li>Local reminders and Quick Capture keep working. Changes to reminder schedules will not reach your other devices.</li>
    </>}</ul>
    <div className="cloud-sync-retention"><strong>Turning sync off does not delete cloud data.</strong><p>Previously uploaded data stays in your account until deleted. Use Delete Data in Account settings to remove cloud data, local data, or both.</p></div>
    <p className="cloud-sync-account-note">This setting applies to this account on this device. Sign-in, account security and storage checks still use the internet.</p>
    <a href={privacyUrl} onClick={event => { event.preventDefault(); void openLegalPage(privacyUrl).catch(() => setError("Could not open the privacy page.")); }}>How Scribe Handles Your Data</a>
    {error && <p className="cloud-sync-error" role="alert">{error}</p>}
    <footer><button ref={cancel} className="cloud-sync-cancel" type="button" onClick={close} disabled={working}>Cancel</button><button className="cloud-sync-confirm" type="button" disabled={working} onClick={() => {
      if (busy.current) return;
      busy.current = true; setWorking(true); setError("");
      void Promise.resolve().then(onConfirm).catch(cause => setError(cause instanceof Error ? cause.message : "Could not save this setting. Please try again.")).finally(() => { busy.current = false; setWorking(false); });
    }}>{working ? "Please wait…" : enabling ? "Enable cloud sync" : "Turn off sync"}</button></footer>
  </dialog>;
}
