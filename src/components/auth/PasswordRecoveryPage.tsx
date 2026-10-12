import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Icon } from "../Icon";
import { LoadingSpinner } from "../feedback/LoadingFeedback";
import { TooltipLayer } from "../layout/TooltipLayer";

export function PasswordRecoveryPage({
  onUpdatePassword,
  onContinue,
}: {
  onUpdatePassword: (password: string) => Promise<string | null>;
  onContinue: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await onUpdatePassword(password);
      if (result) setError(result);
      else setSaved(true);
    } catch {
      setError("Could not update your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <TooltipLayer />
      <section className="auth-layout auth-recovery-layout" aria-label="Reset password">
        <aside className="auth-story">
          <div className="auth-brand"><span className="brand-mark"><Icon name="note" size={20} /></span><span>Scribe</span></div>
          <div className="auth-story-copy">
            <span className="auth-eyebrow"><span /> ACCOUNT SECURITY</span>
            <h1>A fresh start<br />for your account.</h1>
            <p>Choose a new password to get back to your Notes.</p>
          </div>
          <span className="auth-story-footer">Private by design <i /> Made for your everyday</span>
        </aside>
        <div className="auth-panel-wrap">
          <div className="auth-panel-top"><span><span className="auth-online-dot" /> Secure account</span></div>
          <section className="auth-panel">
            {saved ? (
              <div className="auth-confirmation-state" role="status">
                <span className="auth-confirmation-icon"><Check size={22} /></span>
                <span className="auth-eyebrow">ALL SET</span>
                <h2>Password updated</h2>
                <p>Your new password is ready. Continue to your Scribe Notes.</p>
                <button type="button" className="auth-submit" onClick={onContinue}>Continue to Scribe <ArrowRight size={15} /></button>
              </div>
            ) : (
              <>
                <div className="auth-panel-heading">
                  <span className="auth-eyebrow">PASSWORD RESET</span>
                  <h2>Choose a new password</h2>
                  <p>Use at least 6 characters for your new password.</p>
                </div>
                <form className="auth-form" onSubmit={(event) => void submit(event)}>
                  <label className="auth-field">
                    <span>New password</span>
                    <div className="auth-input-wrap"><LockKeyhole size={16} /><input autoFocus type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                  </label>
                  <label className="auth-field">
                    <span>Confirm new password</span>
                    <div className="auth-input-wrap"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} maxLength={1024} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></div>
                  </label>
                  {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
                  <button type="submit" className="auth-submit auth-recovery-submit" data-tooltip="Save your new password to your Scribe account" disabled={submitting}>{submitting ? "Updating password…" : "Update password"}{submitting && <LoadingSpinner />}</button>
                </form>
                <div className="auth-demo-notice"><ShieldCheck size={14} /><span>This secure reset link is for your Scribe account.</span></div>
              </>
            )}
          </section>
          <footer className="auth-panel-footer"><span>© 2026 Scribe</span></footer>
        </div>
      </section>
    </main>
  );
}
