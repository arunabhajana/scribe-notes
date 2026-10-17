import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";
import { deleteOfflineProfile, inspectOfflineProfile, type OfflineProfileSummary } from "../../features/auth/offlineProfileDeletion";
import type { LocalProfile } from "../../features/auth/localProfile";
import { useWorkspacePreference } from "../../features/settings/workspacePreferences";
import "./deleteOfflineProfile.css";

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
export function DeleteOfflineProfileDialog({ profile, interrupted, onClose, onDeleted, onExport }: {
  profile: LocalProfile; interrupted: boolean; onClose: () => void; onDeleted: () => void; onExport: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [theme] = useWorkspacePreference("scribe-theme");
  const [summary, setSummary] = useState<OfflineProfileSummary | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (interrupted) return;
    let active = true;
    void inspectOfflineProfile(profile.id).then(value => { if (active) setSummary(value); })
      .catch(() => { if (active) setError("Could not read this profile’s data. Try loading the summary again."); });
    return () => { active = false; };
  }, [profile.id, revision, interrupted]);
  const close = () => { if (!busy.current && !interrupted) onClose(); };
  const submit = async () => {
    if (busy.current || (!interrupted && (!summary || confirmation.trim() !== "confirm"))) return;
    busy.current = true; setDeleting(true); setError("");
    try { await deleteOfflineProfile(profile.id); onDeleted(); }
    catch { setError("Deletion could not finish. This profile is paused to prevent new saves. Retry to remove the remaining data; other workspaces are unchanged."); }
    finally { busy.current = false; setDeleting(false); }
  };
  return <dialog ref={dialog} className={`offline-delete-dialog ${theme === "light" ? "is-light" : ""}`} aria-labelledby="offline-delete-title" aria-describedby="offline-delete-description" onCancel={event => { event.preventDefault(); close(); }}>
    <header><span className="offline-delete-icon"><Trash2 size={21} /></span>{!interrupted && <button className="offline-delete-close" type="button" aria-label="Close" onClick={close} disabled={deleting}><X size={18} /></button>}</header>
    <h2 id="offline-delete-title">{interrupted ? "Finish deleting this profile" : "Delete offline profile?"}</h2>
    <p id="offline-delete-description">{interrupted ? "Deletion was already confirmed. Finish removing this profile’s local data before continuing." : <>This permanently removes <strong>{profile.displayName}</strong> and its saved data from Scribe on this device.</>}</p>
    {summary ? <section className="offline-delete-summary" aria-label="Data to be deleted">
      <div className="offline-delete-total"><span>Estimated local data</span><strong>{sizeLabel(summary.bytes)}</strong></div>
      <dl>
        <div><dt>Notes</dt><dd>{summary.notes}</dd></div><div><dt>Drafts</dt><dd>{summary.drafts}</dd></div>
        <div><dt>Notes in Trash</dt><dd>{summary.trash}</dd></div><div><dt>Folders</dt><dd>{summary.folders}</dd></div>
        <div><dt>Reminders</dt><dd>{summary.reminders}</dd></div><div><dt>Quick Capture drafts</dt><dd>{summary.captureDrafts}</dd></div>
        <div><dt>Saved preferences</dt><dd>{summary.preferences}</dd></div><div><dt>Notification history</dt><dd>{summary.notifications}</dd></div>
      </dl>
      {summary.pendingImports > 0 && <small>{summary.pendingImports} notes in unfinished imports will also be removed.</small>}
      <small>Includes the profile and local save queue. Estimated data size, not disk space recovered.</small>
    </section> : !interrupted && !error ? <p className="offline-delete-loading" role="status"><LoaderCircle size={16} className="offline-delete-spinner" /> Reading saved data…</p> : null}
    {interrupted && !summary && <p>Removes this profile, notes (including Drafts and Trash), folders, reminders, preferences, Quick Capture draft, saved notification history, local note history and conflict reviews.</p>}
    <div className="offline-delete-scope"><strong>Other workspaces stay untouched.</strong><p>Saved data for other offline profiles and signed-in accounts, including their cloud data, will not be deleted.</p></div>
    {!interrupted && <>
      <p className="offline-delete-warning"><AlertTriangle size={16} /><span>Deletion cannot be undone. An export saved beforehand can be imported into an offline or online workspace later.</span></p>
      <div className="delete-export-first"><div><strong>Keep a copy of your notes</strong><small>A Scribe backup preserves note details. Profile settings and sign-in details are not included.</small></div><button type="button" disabled={deleting} onClick={onExport}>Export first</button></div>
      <label className="offline-delete-label" htmlFor="offline-delete-confirm">Type <strong>confirm</strong> to delete this profile</label>
      <input id="offline-delete-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void submit(); } }} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} disabled={deleting} aria-describedby="offline-delete-description" />
    </>}
    {error && <p className="offline-delete-error" role="alert">{error}</p>}
    {!summary && !interrupted && error && <button className="offline-delete-reload" type="button" onClick={() => { setError(""); setRevision(value => value + 1); }}>Reload summary</button>}
    <footer>{!interrupted && <button ref={cancel} className="offline-delete-cancel" type="button" onClick={close} disabled={deleting}>Keep profile</button>}<button className="offline-delete-confirm" type="button" disabled={deleting || (!interrupted && (!summary || confirmation.trim() !== "confirm"))} onClick={() => { void submit(); }}>{deleting && <LoaderCircle size={15} className="offline-delete-spinner" />}{deleting ? "Deleting…" : interrupted ? "Finish deletion" : "Delete offline profile"}</button></footer>
  </dialog>;
}
