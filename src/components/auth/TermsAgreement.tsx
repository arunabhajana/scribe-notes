import { useState } from "react";
import { openLegalPage, privacyUrl, termsUrl } from "../../features/auth/accountTerms";

export function TermsAgreement({ checked, onChange, disabled = false, showPrivacy = true }: {
  checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; showPrivacy?: boolean;
}) {
  const [error, setError] = useState("");
  const open = (url: string) => {
    setError("");
    void openLegalPage(url).catch(() => setError("Could not open the page. Check that the Scribe website is running."));
  };
  return <div className="auth-legal">
    <div className="auth-terms-row"><span className="auth-checkbox"><input id="accept-scribe-terms" type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg></span><div className="auth-terms-copy"><span><label htmlFor="accept-scribe-terms">I agree to the </label><a href={termsUrl} onClick={event => { event.preventDefault(); open(termsUrl); }}>Terms of Use</a>.</span>{showPrivacy && <a className="auth-privacy-link" href={privacyUrl} onClick={event => { event.preventDefault(); open(privacyUrl); }}>How Scribe Handles Your Data</a>}</div></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function PrivacyPolicyLink() {
  const [error, setError] = useState("");
  return <div className="auth-privacy-footer"><a href={privacyUrl} onClick={event => {
    event.preventDefault(); setError("");
    void openLegalPage(privacyUrl).catch(() => setError("Could not open the privacy page. Please try again."));
  }}>How Scribe Handles Your Data</a>{error && <p role="alert">{error}</p>}</div>;
}
