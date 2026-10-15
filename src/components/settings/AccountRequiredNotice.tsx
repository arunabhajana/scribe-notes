import { Cloud } from "lucide-react";
import "./accountRequired.css";

export function AccountRequiredNotice({ onSignIn, detail = "Sign in to use cloud sync and account features. Signing in does not transfer or upload your offline notes; they stay in this workspace." }: { onSignIn: () => void; detail?: string }) {
  return <div className="account-required-notice"><span className="account-required-icon"><Cloud size={19} /></span><div><strong>Available with a Scribe account</strong><p>{detail}</p></div><button type="button" onClick={onSignIn}>Sign in</button></div>;
}
