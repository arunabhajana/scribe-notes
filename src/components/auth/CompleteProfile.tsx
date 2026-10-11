import { useState, type FormEvent } from "react";
import { UserRound } from "lucide-react";
import { LoadingSpinner } from "../feedback/LoadingFeedback";

export function CompleteProfile({ onSave, onSignOut }: {
  onSave: (name: string) => Promise<string | null>;
  onSignOut: () => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setError(await onSave(name.trim()) ?? "");
    } catch {
      setError("Could not save your name. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-screen auth-profile-screen">
      <section className="auth-panel" aria-label="Complete your profile">
        <div className="auth-panel-heading">
          <span className="auth-eyebrow">WELCOME TO SCRIBE</span>
          <h2>What should we call you?</h2>
          <p>Your sign-in provider didn’t include a display name. Add one to finish setting up your account.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label className="auth-field">
            <span>Display name</span>
            <div className="auth-input-wrap">
              <UserRound size={16} />
              <input autoFocus autoComplete="name" required maxLength={60} value={name}
                disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
            </div>
          </label>
          {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Continue to Scribe"}
            {busy && <LoadingSpinner />}
          </button>
          <button className="auth-back-button" type="button" disabled={busy} onClick={() => void onSignOut()}>
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
