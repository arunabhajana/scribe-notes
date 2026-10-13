import { useEffect, useRef, useState } from "react";
import { scrollExpandedIntoView } from "../layout/scrollExpandedIntoView";
import { Check, Globe, LoaderCircle, Monitor, RefreshCw, Smartphone, X } from "lucide-react";
import type { DeviceInventory } from "../../hooks/useDeviceSessions";
import type { SignOutScope } from "../../features/auth/deviceSessions";

function lastSeen(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Last seen unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "Last seen just now";
  const units = seconds < 3600 ? [60, "minute"] : seconds < 86400 ? [3600, "hour"] : [86400, "day"];
  return `Last seen ${new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-Math.floor(seconds / Number(units[0])), units[1] as Intl.RelativeTimeFormatUnit)}`;
}

const clientLabels = { windows: "Scribe for Windows", extension: "Scribe extension", mobile: "Scribe mobile", web: "Scribe in browser", unknown: "Client details unavailable" };

export function SignedInDevices({ inventory }: { inventory?: DeviceInventory }) {
  const [confirmation, setConfirmation] = useState<{ scope: SignOutScope; id?: string; name?: string } | null>(null);
  const confirmationPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmation) return;
    confirmationPanel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => { if (confirmationPanel.current) scrollExpandedIntoView(confirmationPanel.current); });
    return () => cancelAnimationFrame(frame);
  }, [confirmation]);
  const busy = Boolean(inventory?.action);
  const notice = inventory?.notice;
  const clearNotice = inventory?.clearNotice;
  useEffect(() => {
    if (!notice || !clearNotice) return;
    const timer = window.setTimeout(clearNotice, 2600);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);
  async function confirmSignOut() {
    if (!inventory || !confirmation) return;
    const error = await inventory.revoke(confirmation.scope, confirmation.id);
    if (!error) setConfirmation(null);
  }
  const refresh = inventory?.refresh;
  useEffect(() => {
    if (!refresh) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(visibleRefresh, 60_000);
    window.addEventListener("focus", visibleRefresh);
    window.addEventListener("online", visibleRefresh);
    return () => {
      window.clearTimeout(timer); window.clearInterval(interval);
      window.removeEventListener("focus", visibleRefresh); window.removeEventListener("online", visibleRefresh);
    };
  }, [refresh]);
  const devices = inventory?.devices ?? [];
  return <div aria-busy={inventory?.loading}>
    <div className="device-inventory-toolbar"><span>{inventory?.checkedAt ? `Checked ${new Date(inventory.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Checking account sessions"}</span><button type="button" className="settings-secondary-button" disabled={!refresh || inventory?.loading} onClick={() => void refresh?.()} data-tooltip="Refresh signed-in devices">{inventory?.loading ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}Refresh</button></div>
    {(inventory?.error || inventory?.actionError) && <div className="device-inventory-error" role="alert">{inventory.actionError || inventory.error}</div>}
    {!inventory && <p className="device-inventory-empty">Device inventory is unavailable.</p>}
    {inventory?.loading && !devices.length && <div className="device-inventory-empty" role="status"><LoaderCircle size={16} className="spin" />Loading signed-in devices…</div>}
    {inventory && !inventory.loading && !inventory.error && !devices.length && <p className="device-inventory-empty">No signed-in sessions were found. Refresh or sign in again.</p>}
    {devices.map((device) => {
      const DeviceIcon = device.clientType === "windows" ? Monitor : device.clientType === "mobile" ? Smartphone : Globe;
      return <div className="account-connection-row" key={device.sessionId}>
        <div className="account-icon-tile"><DeviceIcon size={23} /></div>
        <div className="account-connection-info"><div className="device-name-line"><strong>{device.name}</strong>{device.current && <span className="device-current-badge">Current device</span>}</div><span>{clientLabels[device.clientType]} · {device.platform}</span><small title={`Signed in: ${new Date(device.signedInAt).toLocaleString()} · Last seen: ${new Date(device.lastSeenAt).toLocaleString()}`}>{lastSeen(device.lastSeenAt)}</small></div>
        {!device.current && <button type="button" className="account-preview-action action-danger" disabled={busy || inventory?.loading} onClick={() => setConfirmation({ scope: "single", id: device.sessionId, name: device.name })}>{inventory?.action === device.sessionId ? <><LoaderCircle size={13} className="spin" />Signing out…</> : "Sign out"}</button>}
      </div>;
    })}
    {confirmation && <div ref={confirmationPanel} className="device-signout-confirmation" role="group" aria-label="Confirm device sign-out"><strong>{confirmation.scope === "single" ? `Sign out ${confirmation.name}?` : confirmation.scope === "others" ? "Sign out other devices?" : "Sign out from all devices?"}</strong><p>{confirmation.scope === "all" ? "This includes this device. You’ll need to sign in again everywhere." : "Those sessions will lose cloud access and need to sign in again. This device stays signed in."}</p><div><button type="button" className="account-preview-action action-danger" disabled={busy} onClick={() => void confirmSignOut()}>{busy ? <><LoaderCircle size={13} className="spin" />Signing out…</> : "Confirm sign out"}</button><button type="button" className="settings-secondary-button" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button></div></div>}
    <div className="device-actions-footer"><span>Last seen reflects app check-ins and session refreshes.</span><div className="device-signout-actions"><button type="button" className="account-preview-action action-danger" disabled={!inventory || busy || inventory.loading || !devices.some((device) => !device.current)} onClick={() => setConfirmation({ scope: "others" })}>Sign out other devices</button><button type="button" className="account-preview-action action-danger" disabled={!inventory || busy || inventory.loading || !devices.length} onClick={() => setConfirmation({ scope: "all" })}>Sign out from all devices</button></div></div>
    {notice && <div className="status-toast-stack"><div className="status-toast is-success" role="status"><span className="status-toast-icon"><Check size={18} /></span><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={clearNotice}><X size={15} /></button></div></div>}
  </div>;
}
