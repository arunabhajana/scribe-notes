import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function DataDeletionVerification({ password, onPassword, code, onCode, factors, factorId, onFactor, disabled }: {
  password: string; onPassword: (value: string) => void; code: string; onCode: (value: string) => void;
  factors: { id: string; name: string }[]; factorId: string; onFactor: (value: string) => void; disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <>
    <label className="offline-delete-label" htmlFor="data-delete-password">Account password</label>
    <div className="online-delete-password"><input autoFocus id="data-delete-password" type={visible ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => onPassword(event.target.value)} maxLength={1024} required disabled={disabled}/><button type="button" disabled={disabled} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
    {factors.length > 0 && <div className="online-delete-mfa">
      {factors.length > 1 && <><label className="offline-delete-label" htmlFor="data-delete-factor">Authenticator</label><select id="data-delete-factor" value={factorId} onChange={event => onFactor(event.target.value)} disabled={disabled}>{factors.map(factor => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></>}
      <label className="offline-delete-label" htmlFor="data-delete-code">Authenticator code</label><input id="data-delete-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => onCode(event.target.value.replace(/\D/g, "").slice(0,6))} required pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={disabled} placeholder="6-digit code"/>
      <p>Use a current code, even if you verified earlier when signing in.</p>
    </div>}
    <p>Your password and code are used for verification and are not saved in app storage or logs.</p>
  </>;
}
