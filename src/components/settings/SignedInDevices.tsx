import { useEffect } from "react";
import { Globe, LoaderCircle, Monitor, RefreshCw, Smartphone } from "lucide-react";
import type { DeviceInventory } from "../../hooks/useDeviceSessions";

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
    {inventory?.error && <div className="device-inventory-error" role="alert">{inventory.error}</div>}
    {!inventory && <p className="device-inventory-empty">Device inventory is unavailable.</p>}
    {inventory?.loading && !devices.length && <div className="device-inventory-empty" role="status"><LoaderCircle size={16} className="spin" />Loading signed-in devices…</div>}
    {inventory && !inventory.loading && !inventory.error && !devices.length && <p className="device-inventory-empty">No signed-in sessions were found. Refresh or sign in again.</p>}
    {devices.map((device) => {
      const DeviceIcon = device.clientType === "windows" ? Monitor : device.clientType === "mobile" ? Smartphone : Globe;
      return <div className="account-connection-row" key={device.sessionId}>
        <div className="account-icon-tile"><DeviceIcon size={23} /></div>
        <div className="account-connection-info"><div className="device-name-line"><strong>{device.name}</strong>{device.current && <span className="device-current-badge">Current device</span>}</div><span>{clientLabels[device.clientType]} · {device.platform}</span><small title={`Signed in: ${new Date(device.signedInAt).toLocaleString()} · Last seen: ${new Date(device.lastSeenAt).toLocaleString()}`}>{lastSeen(device.lastSeenAt)}</small></div>
        {!device.current && <span className="settings-tooltip-target" tabIndex={0} data-tooltip="Device sign-out is not available yet"><button type="button" className="account-preview-action action-danger" disabled>Sign out</button></span>}
      </div>;
    })}
    <div className="device-actions-footer"><span>Last seen reflects app check-ins and session refreshes.</span><span className="settings-tooltip-target" tabIndex={0} data-tooltip="Signing out all devices is not available yet"><button type="button" className="account-preview-action action-danger" disabled>Sign out from all devices</button></span></div>
  </div>;
}
