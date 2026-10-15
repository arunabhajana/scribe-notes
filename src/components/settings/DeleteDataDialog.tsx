import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, Check, Database, LoaderCircle, X } from "lucide-react";
import { continueDataDeletion, inspectDataDeletion, requestDataDeletion, restartAfterDataDeletion, type DataDeletionSummary, type DataDeletionTarget, type DataScope, type PendingDataDeletion } from "../../features/auth/dataDeletion";
import { useWorkspacePreference } from "../../features/settings/workspacePreferences";
import { DataDeletionVerification } from "./DataDeletionVerification";
import "./deleteOfflineProfile.css";
import "./deleteAccount.css";
import "./deleteData.css";

const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes/(1024*1024)).toFixed(2)} MB` : `${Math.max(0,Math.ceil(bytes/1024))} KB`;
const scopes: { id: DataScope; label: string; detail: string }[] = [
  { id: "local", label: "On this device", detail: "Clear this workspace’s local content. Cloud data stays." },
  { id: "cloud", label: "In the cloud", detail: "Remove uploaded content. Notes on this device stay." },
  { id: "both", label: "Both locations", detail: "Clear uploaded content and this device’s saved content." },
];
export function DeleteDataDialog({ target, pending, onClose, onExport, onPasswordReset }: {
  target: DataDeletionTarget; pending: PendingDataDeletion | null; onClose: () => void; onExport: () => void;
  onPasswordReset: (email: string) => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [theme] = useWorkspacePreference("scribe-theme");
  const [summary, setSummary] = useState<DataDeletionSummary | null>(null);
  const [scope, setScope] = useState<DataScope>("local");
  const [step, setStep] = useState<"review" | "verify">("review");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const recovering = Boolean(pending);
  const restart = pending?.phase === "restart";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, element = dialog.current;
    element?.showModal(); firstButton.current?.focus();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (recovering) return;
    let active = true;
    void inspectDataDeletion(target).then(value => { if (active) { setSummary(value); setFactorId(value.cloud?.factors.find(factor => factor.type === "totp")?.id ?? ""); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not read saved data."); });
    return () => { active = false; };
  }, [target, recovering, revision]);
  useEffect(() => {
    if (!restart) return;
    // A new process finishes a confirmed reset before opening its workspace.
    void continueDataDeletion().catch(cause => setError(cause instanceof Error ? cause.message : "Could not finish cleanup. Retry after reopening Scribe."));
  }, [restart]);
  useEffect(() => { if (recovering && !working) firstButton.current?.focus(); }, [recovering, working, restart]);
  const close = () => { if (!busy.current && !pending) onClose(); };
  const factors = summary?.cloud?.factors.filter(factor => factor.type === "totp") ?? [];
  const unsupported = Boolean(summary?.cloud?.factors.length && !factors.length);
  const clearLocal = (pending?.scope ?? scope) !== "cloud";
  const clearCloud = !target.localOnly && (pending?.scope ?? scope) !== "local";
  const run = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true; setWorking(true); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof TypeError ? "Could not reach account services. Check your connection and retry; a pending deletion has not been cancelled." : cause instanceof Error ? cause.message : "Could not finish deleting data. Please retry."); }
    finally { busy.current = false; setWorking(false); }
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!summary || target.localOnly && confirmation.trim() !== "confirm" || !target.localOnly && (!password || unsupported || factors.length && !/^\d{6}$/.test(code))) return;
    const enteredPassword = password, enteredCode = code;
    setPassword(""); setCode("");
    void run(() => requestDataDeletion(target, target.localOnly ? "local" : scope, enteredPassword, factorId, enteredCode));
  };
  return <dialog ref={dialog} data-sync-editing="true" className={`offline-delete-dialog online-delete-dialog data-delete-dialog ${theme === "light" ? "is-light" : ""}`} aria-labelledby="data-delete-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><span className={`offline-delete-icon${restart ? " data-delete-success-icon" : ""}`}>{restart ? <Check size={21}/> : <Database size={21}/>}</span>{!pending && <button ref={firstButton} type="button" className="offline-delete-close" aria-label="Close data deletion" disabled={working} onClick={close}><X size={18}/></button>}</header>
    <h2 id="data-delete-title">{restart ? "Data deleted" : recovering ? "Finish deleting data" : step === "verify" ? "Verify it’s you" : "Delete workspace data?"}</h2>
    {restart ? <><p>Your selected content has been removed. Restart Scribe to finish opening the workspace safely. Your profile, preferences and account access are kept.</p><div className="offline-delete-scope"><strong>Cloud sync stays off.</strong><p>{pending?.scope === "local" && !target.localOnly ? "Cloud data is still in your account. Enabling sync again will download it." : pending?.scope === "cloud" ? "This device’s notes are kept. Enabling sync again can upload them back to the cloud." : "You can create new notes or import an export after restarting."} Other workspaces and exported files are untouched.</p></div></> : recovering ? <p>The confirmed request is saved on this device. Check its result or finish local cleanup before continuing. Your account is not being deleted.</p> : <>
      <p>{step === "verify" ? "Enter your account password and, when enabled, a current authenticator code." : <>Choose what to remove from <strong>{target.displayName}</strong>. Your {target.localOnly ? "offline profile" : "account"}, name, avatar and preferences stay.</>}</p>
      {step === "review" && <>
        {!target.localOnly && <fieldset className="data-delete-scopes" disabled={working}><legend>Where should data be deleted?</legend>{scopes.map(item => <label key={item.id} className={scope === item.id ? "is-selected" : ""}><input type="radio" name="data-delete-scope" checked={scope === item.id} onChange={() => setScope(item.id)}/><span><strong>{item.label}</strong><small>{item.detail}</small></span></label>)}</fieldset>}
        {summary ? <section className="online-delete-data"><table><caption>Counts can overlap. Local size is an estimate; cloud size is server-reported content usage.</caption><thead><tr><th scope="col">Content</th>{!target.localOnly && <th scope="col">Cloud · {clearCloud ? "delete" : "keep"}</th>}<th scope="col">This device · {clearLocal ? "delete" : "keep"}</th></tr></thead><tbody>
          {([['Notes','notes'],['Drafts','drafts'],['Trash','trash'],['Folders','folders'],['Reminders','reminders']] as const).map(([label,key]) => <tr key={key}><th scope="row">{label}</th>{!target.localOnly && <td className={!clearCloud ? "data-delete-kept" : undefined}>{summary.cloud?.[key] ?? 0}</td>}<td className={!clearLocal ? "data-delete-kept" : undefined}>{summary.local[key]}</td></tr>)}
          <tr className="online-delete-sizes"><th scope="row">Content size</th>{!target.localOnly && <td>{size(summary.cloud?.cloudBytes ?? 0)}</td>}<td>{size(summary.local.contentBytes)}</td></tr>
        </tbody></table>{clearLocal && <small>Also removes {summary.local.captureDrafts} Quick Capture draft(s), {summary.local.notifications} saved notification(s), pending saves, and import history{summary.local.pendingImports ? ` (${summary.local.pendingImports} notes in unfinished imports)` : ""}.</small>}{clearCloud && <small>Also removes note/reminder sync and retry history. Sign-in, security settings, linked providers and device records are kept.</small>}</section> : !error && <p className="offline-delete-loading"><LoaderCircle size={16} className="offline-delete-spinner"/>Reading saved data…</p>}
        <div className="offline-delete-scope"><strong>Only this workspace is affected.</strong><p>Other accounts and offline profiles, exports and OS backups stay untouched. {clearCloud && "Copies on other devices are not remotely wiped. "}{!target.localOnly && "Sync will be off after deletion. Re-enabling it can restore retained local or cloud content."} Scribe will restart to finish cleanup.</p></div>
        <p className="offline-delete-warning"><AlertTriangle size={16}/><span>This cannot be undone. Scribe does not keep project backups.</span></p>
        <div className="delete-export-first"><div><strong>Keep a copy first</strong><small>Export notes saved on this device and import them later. Export does not confirm deletion.</small></div><button type="button" onClick={onExport} disabled={working}>Export first</button></div>
        {target.localOnly && <><label className="offline-delete-label" htmlFor="data-delete-confirm">Type <strong>confirm</strong> to delete local content</label><input id="data-delete-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submit(event); }} autoComplete="off" spellCheck={false} disabled={working}/></>}
        {!target.localOnly && summary?.cloud && !summary.cloud.hasPassword && <p>Set an account password before deleting data, even when you normally use Google or GitHub.</p>}
      </>}
      {step === "verify" && <form id="data-delete-form" onSubmit={submit}><button type="button" className="online-delete-back" disabled={working} onClick={() => { setStep("review"); setPassword(""); setCode(""); setError(""); }}><ArrowLeft size={14}/>Review the selected data</button><p><strong>Deleting: {scopes.find(item => item.id === scope)?.label}</strong>. Your account stays active.</p><DataDeletionVerification password={password} onPassword={setPassword} code={code} onCode={setCode} factors={factors} factorId={factorId} onFactor={setFactorId} disabled={working}/></form>}
    </>}
    {notice && <p role="status">{notice}</p>}{error && <p className="offline-delete-error" role="alert">{error}</p>}
    {!pending && error && <button type="button" className="offline-delete-reload" onClick={() => { setError(""); setRevision(value => value + 1); }}>Reload summary</button>}
    <footer>{!pending && <button type="button" className="offline-delete-cancel" onClick={close} disabled={working}>Cancel</button>}
      {pending ? <button type="button" ref={firstButton} className={restart ? "online-delete-continue" : "offline-delete-confirm"} disabled={working} onClick={() => { void run(restart ? restartAfterDataDeletion : continueDataDeletion); }}>{working && <LoaderCircle size={15} className="offline-delete-spinner"/>}{working ? "Please wait…" : restart ? "Restart Scribe" : pending.phase === "verifying" ? "Check deletion status" : "Finish cleanup"}</button>
      : !target.localOnly && summary?.cloud && !summary.cloud.hasPassword ? <button type="button" className="online-delete-continue" disabled={working || !target.email} onClick={() => { void run(async () => { const failure = await onPasswordReset(target.email); if (failure) throw new Error(failure); setNotice("Password setup email sent. Set your password, then reload this summary."); }); }}>Send password setup email</button>
      : !target.localOnly && step === "review" ? <button type="button" className="offline-delete-confirm" disabled={!summary || working || unsupported} onClick={() => { setError(""); setStep("verify"); }}>Continue to verification</button>
      : <button type={target.localOnly ? "button" : "submit"} form={target.localOnly ? undefined : "data-delete-form"} className="offline-delete-confirm" disabled={working || !summary || (target.localOnly ? confirmation.trim() !== "confirm" : !password || Boolean(factors.length && !/^\d{6}$/.test(code)))} onClick={target.localOnly ? () => submit() : undefined}>{working && <LoaderCircle size={15} className="offline-delete-spinner"/>}{working ? "Deleting…" : "Delete selected data"}</button>}
    </footer>
  </dialog>;
}
