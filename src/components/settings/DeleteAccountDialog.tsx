import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, LoaderCircle, ShieldCheck, Trash2, X } from "lucide-react";
import { checkAccountDeletion, finishAccountDeletion, inspectOnlineAccount, readPendingAccountDeletion, requestAccountDeletion, type AccountDeletionTarget, type OnlineDeletionSummary, type PendingAccountDeletion } from "../../features/auth/onlineAccountDeletion";
import { useWorkspacePreference } from "../../features/settings/workspacePreferences";
import "./deleteOfflineProfile.css";
import "./deleteAccount.css";

const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
export function DeleteAccountDialog({ account, pending, currentUserId, onClose, onDeleted, onFinish, onPasswordReset, onSignOutCurrent, onExport }: {
  account: AccountDeletionTarget; pending: PendingAccountDeletion | null; onClose: () => void; onDeleted: () => void; onExport: () => void;
  onFinish: (id: string) => Promise<void>; onPasswordReset: (email: string) => Promise<string | null>;
  currentUserId?: string; onSignOutCurrent: () => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [theme] = useWorkspacePreference("scribe-theme");
  const [summary, setSummary] = useState<OnlineDeletionSummary | null>(null);
  const [step, setStep] = useState<"review" | "verify">("review");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal(); firstButton.current?.focus();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  const recovering = Boolean(pending);
  useEffect(() => {
    if (recovering) return;
    let active = true;
    void inspectOnlineAccount(account.id).then(value => {
      if (active) { setSummary(value); setFactorId(value.cloud.factors.find(factor => factor.type === "totp")?.id ?? ""); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load account data."); });
    return () => { active = false; };
  }, [account.id, revision, recovering]);
  useEffect(() => { if (step === "verify" && !recovering) passwordInput.current?.focus(); }, [step, recovering]);
  const close = () => { if (!busy.current && !pending) onClose(); };
  const complete = async () => {
    const saved = readPendingAccountDeletion();
    if (!saved || saved.userId !== account.id) throw new Error("The account changed. Reopen Settings before continuing.");
    if (!saved.remoteDeleted) await checkAccountDeletion(saved);
    await finishAccountDeletion(readPendingAccountDeletion()!, onFinish);
    onDeleted();
  };
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const needsMfa = Boolean(summary?.cloud.factors.length);
    if (busy.current || (!pending && (!summary || !password || (needsMfa && (!factorId || !/^\d{6}$/.test(code)))))) return;
    busy.current = true; setWorking(true); setError(""); setNotice("");
    const enteredPassword = password; const enteredCode = code;
    setPassword(""); setCode(""); setShowPassword(false);
    try {
      if (!pending) await requestAccountDeletion(account.id, enteredPassword, factorId, enteredCode);
      await complete();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Deletion could not finish. Check your connection and try again."); }
    finally { busy.current = false; setWorking(false); }
  };
  const resetPassword = async () => {
    if (busy.current || !account.email) return;
    busy.current = true; setWorking(true); setError("");
    try { const failure = await onPasswordReset(account.email); if (failure) setError(failure); else setNotice("Check your inbox to set a password. After updating it, return to Account settings to delete your account."); }
    finally { busy.current = false; setWorking(false); }
  };
  const reload = () => { setError(""); setNotice(""); setSummary(null); setRevision(value => value + 1); };
  const factors = summary?.cloud.factors.filter(factor => factor.type === "totp") ?? [];
  const unsupportedMfa = Boolean(summary?.cloud.factors.length && !factors.length);
  const otherAccountActive = Boolean(pending && currentUserId && currentUserId !== account.id);
  return <dialog ref={dialog} className={`offline-delete-dialog online-delete-dialog ${theme === "light" ? "is-light" : ""}`} aria-labelledby="online-delete-title" aria-describedby="online-delete-description" onCancel={event => { event.preventDefault(); close(); }}>
    <header><span className="offline-delete-icon">{step === "verify" && !pending ? <ShieldCheck size={21} /> : <Trash2 size={21} />}</span>{!pending && <button ref={firstButton} className="offline-delete-close" type="button" aria-label="Close" disabled={working} onClick={close}><X size={18} /></button>}</header>
    <h2 id="online-delete-title">{pending ? pending.remoteDeleted ? "Finish removing local data" : "Check account deletion" : step === "review" ? "Delete your Scribe account?" : "Verify it’s you"}</h2>
    <p id="online-delete-description">{pending ? "Your request is saved on this device. Local data is removed only after Supabase confirms the account was deleted." : step === "review" ? <>Permanently delete <strong>{account.email || account.displayName}</strong>, its cloud data and its saved workspace on this device.</> : <>Enter the password for <strong>{account.email}</strong>{summary?.cloud.factors.length ? " and a current authenticator code." : " to permanently delete this account."}</>}</p>
    {summary && !pending && step === "review" && <>
      <section className="online-delete-data" aria-label="Data to be deleted">
        <table><caption>Cloud data and this device’s copy can overlap. Counts are not added together.</caption><thead><tr><th scope="col">Saved data</th><th scope="col">Cloud</th><th scope="col">This device</th></tr></thead><tbody>
          {([['Notes', 'notes'], ['Drafts', 'drafts'], ['Trash', 'trash'], ['Folders', 'folders'], ['Reminders', 'reminders']] as const).map(([label, key]) => <tr key={key}><th scope="row">{label}</th><td>{summary.cloud[key]}</td><td>{summary.local[key]}</td></tr>)}
          <tr><th scope="row">Saved preferences</th><td aria-label="Not included in cloud size">—</td><td>{summary.local.preferences}</td></tr>
          <tr className="online-delete-sizes"><th scope="row">Data size</th><td>{size(summary.cloud.cloudBytes)}</td><td>~{size(summary.local.bytes)}</td></tr>
        </tbody></table>
        <small>Cloud size covers notes, folders and reminders. Local size also includes saved preferences and workspace records, so it can show a small amount even with no notes. It is an estimate, not disk space recovered.</small>
      </section>
      <details className="online-delete-details"><summary>Account details and settings also removed</summary><p>Your profile, email sign-in, {summary.cloud.identities} linked sign-in method(s), {summary.cloud.sessions} session(s), authenticator setup, device records, terms acceptance and account security/sync records.</p><p>On this device: {summary.local.preferences} saved preference(s), {summary.local.captureDrafts} Quick Capture draft(s), {summary.local.notifications} notification(s), and pending local saves.</p></details>
      {summary.local.pendingImports > 0 && <p>{summary.local.pendingImports} notes in unfinished local imports will also be removed.</p>}
      {summary.local.pendingChanges > 0 && <p className="online-delete-unsynced"><AlertTriangle size={15} /><span>Some local changes have not synced. These will also be permanently removed.</span></p>}
      <div className="offline-delete-scope"><strong>Other workspaces stay untouched.</strong><p>Other Scribe accounts and offline profiles keep their saved data. This does not delete your Google or GitHub account.</p></div>
      <p className="online-delete-limits">Sessions for this account end. Copies on other devices, exported files and operating-system backups cannot be erased remotely; remove those copies separately. Service security logs may follow the provider’s retention rules.</p>
      <p className="offline-delete-warning"><AlertTriangle size={16} /><span>Deletion cannot be undone. An export saved beforehand can be imported into an offline or online workspace later.</span></p>
      <div className="delete-export-first"><div><strong>Keep a copy before deleting</strong><small>Export notes saved on this device. Sync first for changes from other devices. Account credentials and settings are not exported.</small></div><button type="button" disabled={working || currentUserId !== account.id} onClick={onExport}>Export first</button></div>
      {!summary.cloud.hasPassword && <div className="offline-delete-scope"><strong>Set a password first</strong><p>Google/GitHub sign-in does not always create a password. Use a password reset email to set one, then return here. Your account stays active until you complete deletion.</p></div>}
      {unsupportedMfa && <p className="offline-delete-error" role="alert">This account uses an unsupported verification method. Deletion is blocked rather than skipping two-factor authentication. Contact support.</p>}
    </>}
    {!summary && !pending && !error && <p className="offline-delete-loading" role="status"><LoaderCircle size={16} className="offline-delete-spinner" /> Loading cloud and local data…</p>}
    {!pending && step === "verify" && summary && <form id="online-delete-form" onSubmit={event => { void submit(event); }}>
      <button className="online-delete-back" type="button" disabled={working} onClick={() => { setStep("review"); setPassword(""); setCode(""); setError(""); }}><ArrowLeft size={14} />Review data to be deleted</button>
      <label className="offline-delete-label" htmlFor="online-delete-password">Account password</label>
      <div className="online-delete-password"><input ref={passwordInput} id="online-delete-password" type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} maxLength={1024} autoComplete="current-password" required disabled={working} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)} disabled={working}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      {summary.cloud.factors.length > 0 && <div className="online-delete-mfa">
        {factors.length > 1 && <><label className="offline-delete-label" htmlFor="online-delete-factor">Authenticator</label><select id="online-delete-factor" value={factorId} onChange={event => setFactorId(event.target.value)} disabled={working}>{factors.map(factor => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></>}
        <label className="offline-delete-label" htmlFor="online-delete-code">Authenticator code</label><input id="online-delete-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={working} placeholder="6-digit code" /><p>Enter a new code even if you already verified when signing in.</p>
      </div>}
      <p className="online-delete-limits">Your password and code are sent securely for verification. Scribe does not save them in local storage or application logs.</p>
    </form>}
    {pending && <div className="offline-delete-scope"><strong>{pending.remoteDeleted ? "Cloud account deletion confirmed." : "Your workspace is paused while we confirm the result."}</strong><p>{pending.remoteDeleted ? "Finish removing this account’s local notes, folders, reminders, preferences and notification history." : "A connection interruption does not prove deletion failed. Check the status before continuing; your saved local data is kept until then."} Other workspaces stay untouched.</p></div>}
    {otherAccountActive && <p>Another account is signed in. Sign out of it on this device to finish this deletion. Its saved workspace data will be kept.</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="offline-delete-error" role="alert">{error}</p>}
    {!pending && ((!summary && error) || (summary && error && !working)) && <button className="offline-delete-reload" type="button" onClick={reload}>Reload summary</button>}
    <footer>{!pending && <button className="offline-delete-cancel" type="button" onClick={close} disabled={working}>Keep account</button>}
      {otherAccountActive ? <button className="online-delete-continue" type="button" disabled={working} onClick={() => { void onSignOutCurrent().then(failure => { if (failure) setError(failure); }); }}>Sign out of current account</button>
        : pending ? <button className="offline-delete-confirm" type="button" disabled={working} onClick={() => { void submit(); }}>{working && <LoaderCircle size={15} className="offline-delete-spinner" />}{working ? "Please wait…" : pending.remoteDeleted ? "Finish local cleanup" : "Check deletion status"}</button>
        : summary && !summary.cloud.hasPassword ? <button className="online-delete-continue" type="button" disabled={working || !account.email} onClick={() => { void resetPassword(); }}>{working ? "Sending…" : "Send password setup email"}</button>
        : step === "review" ? <button className="offline-delete-confirm" type="button" disabled={!summary || working || unsupportedMfa} onClick={() => { setError(""); setStep("verify"); }}>Continue to verification</button>
        : <button className="offline-delete-confirm" form="online-delete-form" type="submit" disabled={working || !password || Boolean(summary?.cloud.factors.length && (!factorId || !/^\d{6}$/.test(code)))}>{working && <LoaderCircle size={15} className="offline-delete-spinner" />}{working ? "Deleting…" : "Permanently delete account"}</button>}
    </footer>
  </dialog>;
}
