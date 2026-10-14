import { useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { MfaController } from "../../hooks/useMfa";
import { AppLogo } from "../AppLogo";
import { LoadingSpinner } from "../feedback/LoadingFeedback";
import { TotpCodeField } from "./TotpCodeField";

export function MfaChallengePage({ mfa, onSignOut }: { mfa: MfaController; onSignOut: () => Promise<string | null> }) {
  const [selectedId, setSelectedId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const factorId = mfa.factors.some((item) => item.id === selectedId) ? selectedId : mfa.factors[0]?.id;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !factorId) return;
    setBusy(true); setError("");
    try {
      const result = await mfa.verify(factorId, code);
      if (result) { setError(result); setCode(""); }
      else await mfa.refresh();
    } finally { setBusy(false); }
  }

  return <main className="auth-screen">
    <section className="auth-layout auth-recovery-layout" aria-label="Two-step verification">
      <aside className="auth-story">
        <div className="auth-brand"><AppLogo variant="transparent" /><span>Scribe</span></div>
        <div className="auth-story-copy"><span className="auth-eyebrow">ACCOUNT SECURITY</span>
          <h1>One more step.<br />Your Notes await.</h1>
          <p>Use Authy or your authenticator app to finish signing in.</p></div>
      </aside>
      <div className="auth-panel-wrap"><section className="auth-panel">
        <div className="auth-panel-heading"><span className="auth-eyebrow">TWO-STEP VERIFICATION</span>
          <h2>{mfa.error ? "Check account security" : "Verify it’s you"}</h2><p>{mfa.error ? "We couldn’t confirm this session. Try checking again." : "Your account has an authenticator enabled."}</p></div>
        {mfa.error ? <><div className="auth-feedback auth-error" role="alert">{mfa.error}</div>
          <button className="auth-submit auth-recovery-submit" disabled={busy} onClick={async () => { setBusy(true); try { await mfa.refresh(); } finally { setBusy(false); } }}>{busy ? "Checking…" : "Try again"}</button></> :
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {mfa.factors.length > 1 && <label className="auth-field"><span>Authenticator</span><select className="mfa-factor-select" value={factorId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setCode(""); }}>{mfa.factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></label>}
            {factorId ? <TotpCodeField code={code} onChange={setCode} disabled={busy} /> : <p role="alert">No supported authenticator was found. Sign out and contact support to recover your account.</p>}
            {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
            <button className="auth-submit auth-recovery-submit" disabled={busy || !factorId || code.length !== 6}>{busy ? <>Verifying… <LoadingSpinner /></> : "Verify and continue"}</button>
          </form>}
        <div className="auth-demo-notice"><ShieldCheck size={14} /><span>Lost your authenticator? Account recovery requires help from the account administrator.</span></div>
        <button type="button" className="auth-back-button" disabled={busy} onClick={() => void onSignOut()}><ArrowLeft size={14} />Back to sign in</button>
      </section></div>
    </section>
  </main>;
}
