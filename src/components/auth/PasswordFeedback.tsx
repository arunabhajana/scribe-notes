export function PasswordFeedback({ password }: { password: string }) {
  const length = password.length;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(pattern => pattern.test(password)).length;
  const predictable = /^(.)\1+$/.test(password) || /^(password|qwerty|123456|abcdef|letmein)/i.test(password);
  const level = !length ? 0 : length < 12 || predictable ? 1 : length >= 16 && variety >= 2 ? 3 : 2;
  const label = ["At least 12 characters", "Weak", "Fair", "Strong"][level];
  const guidance = !length ? "" : length < 12 ? `${12 - length} more characters needed` : predictable ? "Avoid common patterns" : level < 3 ? "Longer is better" : "Use a unique password";
  return <div id="signup-password-feedback" className={`auth-password-feedback strength-${level}`}>
    <div className="auth-strength-track" role="meter" aria-label="Estimated password strength" aria-valuemin={0} aria-valuemax={3} aria-valuenow={level} aria-valuetext={label}><span /></div>
    <div className="auth-strength-copy"><strong>{label}</strong>{guidance && <span>{guidance}</span>}</div>
  </div>;
}
