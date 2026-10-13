import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Plus, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import type { MfaController, TotpEnrollment, TotpFactor } from "../../hooks/useMfa";
import { TotpCodeField } from "../auth/TotpCodeField";
import { LoadingSpinner } from "../feedback/LoadingFeedback";

export function MfaSettings({ mfa }: { mfa: MfaController }) {
  const [setup, setSetup] = useState<TotpEnrollment | null>(null);
  const [removing, setRemoving] = useState<TotpFactor | null>(null);
  const [name, setName] = useState("Authy");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pendingSetup = useRef<string | null>(null);
  const mounted = useRef(true);
  const cancelEnrollment = mfa.cancelEnrollment;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingSetup.current) void cancelEnrollment(pendingSetup.current);
    };
  }, [cancelEnrollment]);
  useEffect(() => {
    if (!mfa.notice) return;
    const timer = window.setTimeout(mfa.clearNotice, 2600);
    return () => window.clearTimeout(timer);
  }, [mfa.notice, mfa.clearNotice]);

  async function startSetup() {
    if (busy) return;
    if (mfa.factors.length) {
      setError("Remove your current authenticator before setting up another.");
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await mfa.enroll(name);
      if (!mounted.current) {
        if (result.enrollment) await mfa.cancelEnrollment(result.enrollment.id);
        return;
      }
      if (result.error) setError(result.error);
      else if (result.enrollment) {
        pendingSetup.current = result.enrollment.id;
        setSetup(result.enrollment); setCode("");
      }
    } finally { if (mounted.current) setBusy(false); }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (setup) {
        const result = await mfa.cancelEnrollment(setup.id);
        if (result) { setError(result); return; }
      }
      pendingSetup.current = null;
      setSetup(null); setRemoving(null); setCode("");
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = setup ? await mfa.verify(setup.id, code) : removing ? await mfa.remove(removing.id, code) : "Choose an authenticator first.";
      if (result) { setError(result); setCode(""); return; }
      if (setup) { pendingSetup.current = null; mfa.announceEnabled(); }
      setSetup(null); setRemoving(null); setCode("");
      await mfa.refresh();
    } finally { if (mounted.current) setBusy(false); }
  }

  return <section className="mfa-settings" aria-label="Two-step verification">
    <div className="mfa-settings-heading"><div><strong>Two-step verification</strong><span>{mfa.factors.length ? "An authenticator code protects your sign-in." : "Add Authy or another authenticator to protect your sign-in."}</span></div><span className={`mfa-status ${mfa.factors.length ? "is-enabled" : ""}`}><ShieldCheck size={13} />{mfa.factors.length ? "Enabled" : "Not enabled"}</span></div>
    {mfa.factors.map((factor) => <div className="mfa-factor-row" key={factor.id}><span className="mfa-device-icon"><Smartphone size={17} /></span><div><strong>{factor.name}</strong><span>Authenticator app</span></div><button className="mfa-button mfa-remove-button" type="button" data-tooltip="Remove this authenticator after confirming a verification code" disabled={busy || Boolean(setup || removing)} onClick={() => { setRemoving(factor); setCode(""); setError(""); }}><Trash2 size={13} />Remove</button></div>)}
    {mfa.factors.length === 0 && !setup && !removing && <div className="mfa-add-row"><label className="mfa-name-field"><span>Authenticator name</span><input className="mfa-name-input" type="text" value={name} maxLength={60} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="e.g. Authy" /></label><button type="button" className="mfa-button account-reset-button" data-tooltip="Get a QR code to add Scribe to your authenticator app" disabled={busy || Boolean(mfa.error)} onClick={() => void startSetup()}>{busy ? <><LoadingSpinner /> Setting up…</> : <><Plus size={14} />Set up authenticator</>}</button></div>}
    {(setup || removing) && <form className="mfa-setup-panel" onSubmit={(event) => void submit(event)}>
      {setup ? <div className="mfa-scan-layout"><img className="mfa-qr" src={setup.qrCode} alt="Scan this QR code in your authenticator app" /><div className="mfa-scan-copy"><strong>1. Add Scribe to your authenticator</strong><p>Open Authy or your authenticator, choose Add account, then scan this QR code.</p><details><summary>Can’t scan? Use a setup key</summary><code className="mfa-secret">{setup.secret}</code></details><p className="mfa-backup-tip">Keep your authenticator backed up if you change phones.</p></div></div> : <div className="mfa-removal-copy"><strong>Remove {removing!.name}?</strong><p>{mfa.factors.length === 1 ? "This turns off two-step verification. " : "Your other authenticators will stay enabled. "}Enter a code from this authenticator to confirm.</p></div>}
      {setup && <strong className="mfa-confirm-heading">2. Confirm your setup</strong>}
      <TotpCodeField code={code} onChange={setCode} disabled={busy} />
      <div className="mfa-actions"><button type="submit" className="mfa-button account-reset-button" disabled={busy || code.length !== 6}>{busy ? <><LoadingSpinner /> Verifying…</> : <><Check size={14} />{setup ? "Enable verification" : "Confirm removal"}</>}</button><button type="button" className="mfa-button" disabled={busy} onClick={() => void cancel()}>Cancel</button></div>
    </form>}
    {(error || mfa.error) && <div className="auth-feedback auth-error" role="alert">{error || mfa.error}</div>}
    {mfa.notice && <div className="status-toast-stack"><div className="status-toast is-success" role="status"><span className="status-toast-icon"><Check size={18} /></span><span>{mfa.notice}</span><button type="button" aria-label="Dismiss notification" onClick={mfa.clearNotice}><X size={15} /></button></div></div>}
  </section>;
}
