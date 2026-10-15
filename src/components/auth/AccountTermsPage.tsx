import { useState } from "react";
import { TermsAgreement } from "./TermsAgreement";
import type { useAccountTerms } from "../../hooks/useAccountTerms";

export function AccountTermsPage({ terms, onSignOut }: { terms: ReturnType<typeof useAccountTerms>; onSignOut: () => Promise<string | null> }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <main className="auth-screen auth-profile-screen"><section className="auth-panel" aria-label="Account terms">
    <div className="auth-panel-heading"><span className="auth-eyebrow">WELCOME TO SCRIBE</span><h2>{terms.loading ? "Checking your account…" : "Before you continue"}</h2><p>Review the Terms of Use to finish setting up your new account.</p></div>
    <form className="auth-form" onSubmit={event => { event.preventDefault(); if (!checked || busy) return; setBusy(true); setError(""); void terms.accept().then(message => setError(message ?? "")).finally(() => setBusy(false)); }}>
      {!terms.loading && !terms.error && <TermsAgreement checked={checked} onChange={setChecked} disabled={busy} />}
      {(error || terms.error) && <div className="auth-feedback auth-error" role="alert">{error || terms.error}</div>}
      {terms.error ? <button type="button" className="auth-submit" onClick={terms.retry}>Try again</button> : <button className="auth-submit" type="submit" disabled={!checked || busy || terms.loading}>{busy ? "Saving…" : "Agree and continue"}</button>}
      <button className="auth-back-button" type="button" disabled={busy} onClick={() => { void onSignOut().then(message => { if (message) setError(message); }); }}>Back to sign in</button>
    </form>
  </section></main>;
}
