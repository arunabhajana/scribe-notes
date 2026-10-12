import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Icon } from "../Icon";
import { SocialSignInButtons } from "./SocialSignInButtons";
import { LoadingSpinner } from "../feedback/LoadingFeedback";
import type { SocialProvider } from "../../hooks/useAuth";

type AuthMode = "signin" | "signup";

export function AuthPage({
  configured,
  onSignIn,
  onSignUp,
  callbackError,
  notice,
  onAuthenticated,
  onProviderSignIn,
  oauthPending,
  onCancelProviderSignIn,
  onRequestPasswordReset,
}: {
  configured: boolean;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null; confirmationRequired: boolean }>;
  callbackError: string;
  notice: string;
  onAuthenticated: () => void;
  onProviderSignIn: (provider: SocialProvider) => Promise<string | null>;
  oauthPending: SocialProvider | null;
  onCancelProviderSignIn: () => void;
  onRequestPasswordReset: (email: string) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isSignUp = mode === "signup";
  const signInWithProvider = async (provider: SocialProvider) => {
    setError("");
    setSubmitting(true);
    try {
      setError(await onProviderSignIn(provider) ?? "");
    } catch {
      setError("Could not start sign-in. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError("");
    setConfirmationSent(false);
    setResetEmailSent(false);
  };

  const requestPasswordReset = async () => {
    if (submitting || oauthPending) return;
    setError("");
    setResetEmailSent(false);
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await onRequestPasswordReset(email.trim());
      if (result) setError(result);
      else setResetEmailSent(true);
    } catch {
      setError("Could not send the reset email. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || oauthPending) return;
    setError("");
    if (isSignUp && password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        const result = await onSignUp(
          displayName.trim(),
          email.trim(),
          password,
        );
        if (result.error) setError(result.error);
        else if (result.confirmationRequired) setConfirmationSent(true);
        else onAuthenticated();
      } else {
        const result = await onSignIn(email.trim(), password);
        if (result) setError(result);
        else onAuthenticated();
      }
    } catch (failure) {
      const message =
        failure instanceof Error
          ? failure.message
          : typeof failure === "string"
            ? failure
            : failure && typeof failure === "object"
              ? String(
                  (failure as { message?: unknown }).message ??
                    JSON.stringify(failure),
                )
              : String(failure ?? "");
      const couldNotReachServer =
        /failed to fetch|network error|network request failed|load failed/i.test(
          message,
        );
      const safeDetail = message
        .replace(/https?:\/\/\S+/gi, "[server URL]")
        .replace(
          /(access|refresh)_token[=: ]+[^\s,;]+/gi,
          "$1_token=[redacted]",
        )
        .slice(0, 180);
      setError(
        couldNotReachServer
          ? "Could not reach Supabase. Your email and password were not checked. Check your internet connection and verify the Supabase project URL in .env."
          : safeDetail
            ? `Scribe could not finish ${isSignUp ? "account creation" : "sign-in"} on this device: ${safeDetail}`
            : isSignUp
              ? "Could not create your account right now. Please try again."
              : "Could not complete sign-in right now. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <section className="auth-layout" aria-label="Scribe account">
        <aside className="auth-story">
          <div className="auth-brand">
            <span className="brand-mark">
              <Icon name="note" size={20} />
            </span>
            <span>Scribe</span>
          </div>
          <div className="auth-story-copy">
            <span className="auth-eyebrow">
              <span />
              YOUR IDEAS, IN ONE PLACE
            </span>
            <h1>
              A little space
              <br />
              for big thoughts.
            </h1>
            <p>
              Capture what matters, keep it close, and find it when you need it.
            </p>
          </div>
          <div className="auth-story-note">
            <span className="auth-note-icon">
              <Icon name="note" size={15} />
            </span>
            <div>
              <strong>Make room for ideas.</strong>
              <span>Your Notes are waiting.</span>
            </div>
            <span className="auth-note-spark">✦</span>
          </div>
          <span className="auth-story-footer">
            Private by design <i /> Made for your everyday
          </span>
        </aside>

        <div className="auth-panel-wrap">
          <div className="auth-panel-top">
            <span>
              <span
                className={`auth-online-dot ${configured ? "" : "auth-offline-dot"}`}
              />
              {configured ? "Secure account" : "Sign-in unavailable"}
            </span>
          </div>
          <section className="auth-panel">
            {confirmationSent ? (
              <div className="auth-confirmation-state" role="status">
                <span className="auth-confirmation-icon">
                  <Check size={22} />
                </span>
                <span className="auth-eyebrow">ONE LAST STEP</span>
                <h2>Check your inbox</h2>
                <p>
                  We sent a confirmation link to <strong>{email.trim()}</strong>
                  . Open it to verify your email and Scribe will launch when
                  confirmation completes.
                </p>
                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => switchMode("signin")}
                >
                  Back to sign in <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <>
                <div className="auth-panel-heading">
                  <span className="auth-eyebrow">
                    {isSignUp ? "START WITH SCRIBE" : "WELCOME BACK"}
                  </span>
                  <h2>
                    {isSignUp ? "Create your account" : "Sign in to Scribe"}
                  </h2>
                  <p>
                    {isSignUp
                      ? "A home for all the thoughts worth keeping."
                      : "Pick up where your thoughts left off."}
                  </p>
                </div>
                {!configured && (
                  <div className="auth-config-notice" role="status">
                    <ShieldCheck size={15} />
                    <span>
                      Sign-in is unavailable until a Supabase project is
                      configured. Your Notes stay protected.
                    </span>
                  </div>
                )}
                {callbackError && (
                  <div className="auth-feedback auth-error" role="alert">
                    We couldn’t confirm this sign-in link: {callbackError}
                  </div>
                )}
                {notice && (
                  <div className="auth-feedback auth-error" role="status">
                    {notice}
                  </div>
                )}
                {resetEmailSent && (
                  <div className="auth-feedback auth-message" role="status">
                    If an account exists for that email, a password reset link is on its way.
                  </div>
                )}
                <SocialSignInButtons
                  disabled={submitting || !configured || Boolean(oauthPending)}
                  onSignIn={(provider) => void signInWithProvider(provider)}
                />
                {oauthPending && (
                  <div className="auth-oauth-pending" role="status">
                    <LoadingSpinner />
                    <span>Finish signing in with {oauthPending === "google" ? "Google" : "GitHub"} in your browser, then return to Scribe.</span>
                    <button type="button" className="auth-back-button" disabled={submitting} onClick={onCancelProviderSignIn}>Back to sign in</button>
                  </div>
                )}
                <div className="auth-divider">
                  <span />
                  {isSignUp ? "create with email" : "continue with email"}
                  <span />
                </div>
                <form className="auth-form" onSubmit={submit}>
                  {isSignUp && (
                    <label className="auth-field">
                      <span>Display name</span>
                      <div className="auth-input-wrap">
                        <UserRound size={16} />
                        <input
                          type="text"
                          autoComplete="name"
                          required
                          maxLength={60}
                          value={displayName}
                          onChange={(event) =>
                            setDisplayName(event.target.value)
                          }
                          placeholder="Your name"
                        />
                      </div>
                    </label>
                  )}
                  <label className="auth-field">
                    <span>Email address</span>
                    <div className="auth-input-wrap">
                      <Mail size={16} />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={320}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                  </label>
                  <label className="auth-field">
                    <span>Password</span>
                    <div className="auth-input-wrap">
                      <LockKeyhole size={16} />
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          isSignUp ? "new-password" : "current-password"
                        }
                        required
                        minLength={6}
                        maxLength={1024}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={
                          isSignUp
                            ? "At least 6 characters"
                            : "Enter your password"
                        }
                      />
                      <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      className="auth-forgot"
                      onClick={() => void requestPasswordReset()}
                      disabled={submitting || !configured || Boolean(oauthPending)}
                    >
                      Forgot password?
                    </button>
                  )}
                  {isSignUp && (
                    <label className="auth-field">
                      <span>Confirm password</span>
                      <div className="auth-input-wrap">
                        <LockKeyhole size={16} />
                        <input
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          minLength={6}
                          maxLength={1024}
                          value={confirmPassword}
                          onChange={(event) =>
                            setConfirmPassword(event.target.value)
                          }
                          placeholder="Enter your password again"
                        />
                      </div>
                    </label>
                  )}
                  {error && (
                    <div className="auth-feedback auth-error" role="alert">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    className="auth-submit"
                    disabled={submitting || !configured || Boolean(oauthPending)}
                  >
                    {submitting
                      ? isSignUp
                        ? "Creating account…"
                        : "Signing in…"
                      : isSignUp
                        ? "Create account"
                        : "Sign in"}
                    {submitting ? <LoadingSpinner /> : <ArrowRight size={15} />}
                  </button>
                </form>
                <div className="auth-mode-switch">
                  {isSignUp ? "Already have an account?" : "New to Scribe?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(isSignUp ? "signin" : "signup")}
                  >
                    {isSignUp ? "Sign in" : "Create account"}
                  </button>
                </div>
                <div className="auth-demo-notice">
                  <ShieldCheck size={14} />
                  <span>
                    {isSignUp
                      ? "We’ll email you a link to confirm your address before your first sign in."
                      : "Your session stays saved in this app on this device. Sign out to remove it."}
                  </span>
                </div>
              </>
            )}
          </section>
          <footer className="auth-panel-footer">
            <span>© 2026 Scribe</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
