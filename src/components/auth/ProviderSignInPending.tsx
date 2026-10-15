import { useEffect, useRef } from "react";
import { LoadingSpinner } from "../feedback/LoadingFeedback";
import type { SocialProvider } from "../../hooks/useAuth";
import "./authActions.css";

export function ProviderSignInPending({ provider, onCancel }: { provider: SocialProvider; onCancel: () => void }) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, []);
  return <div className="provider-signin-pending">
    <div className="provider-signin-status" role="status" aria-live="polite"><span className="provider-signin-spinner"><LoadingSpinner /></span><div><strong>Waiting for {provider === "google" ? "Google" : "GitHub"}</strong><p>Scribe will continue automatically when sign-in is complete.</p></div></div>
    <button ref={back} className="auth-secondary-button" type="button" onClick={onCancel}>Back to sign in</button>
  </div>;
}
