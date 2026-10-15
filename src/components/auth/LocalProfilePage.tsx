import { useState, type FormEvent } from "react";
import { AppLogo } from "../AppLogo";
import { openLegalPage, privacyUrl, termsUrl } from "../../features/auth/accountTerms";
import "./localProfile.css";

export function LocalProfilePage({ onCreate, onBack }: { onCreate: (name: string) => string | null; onBack: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); setError(onCreate(name) ?? ""); };
  const open = (url: string) => { void openLegalPage(url).catch(() => setError("Could not open the page. Please try again.")); };
  return <main className="auth-screen auth-profile-screen"><section className="auth-panel local-profile-panel">
    <AppLogo variant="transparent" />
    <div className="auth-panel-heading"><span className="auth-eyebrow">ON THIS DEVICE</span><h2>Make yourself at home.</h2><p>Choose a display name for your offline profile. No email or password needed.</p></div>
    <div className="local-profile-notice"><strong>Stored locally. Never uploaded.</strong><p>Your profile name and notes stay on this device. Signing in later opens a separate workspace—your offline notes will not transfer or upload automatically. You can move them yourself using Export and Import in Settings → General.</p></div>
    <form className="auth-form" onSubmit={submit}>
      <label className="auth-field"><span>Display name</span><div className="auth-input-wrap"><input autoFocus required maxLength={60} autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} placeholder="What should we call you?" /></div></label>
      {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit" disabled={!name.trim()}>Create offline profile</button>
      <button className="local-profile-back-button" type="button" onClick={onBack}>Back to sign in</button>
    </form>
    <p className="local-profile-legal"><a href={termsUrl} onClick={event => { event.preventDefault(); open(termsUrl); }}>Terms of Use</a><span aria-hidden="true"> · </span><a href={privacyUrl} onClick={event => { event.preventDefault(); open(privacyUrl); }}>Privacy Policy</a></p>
    <p className="local-profile-footnote">This profile has no password protection or cloud recovery. Keep a separate copy of important notes.</p>
  </section></main>;
}
