export function TotpCodeField({ code, onChange, disabled = false }: {
  code: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <label className="auth-field mfa-code-field">
    <span>Authenticator code</span>
    <div className="auth-input-wrap">
      <input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" maxLength={6} required disabled={disabled}
        value={code} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000" aria-describedby="mfa-code-help" />
    </div>
    <small id="mfa-code-help">Enter the latest six-digit code from your authenticator app.</small>
  </label>;
}
