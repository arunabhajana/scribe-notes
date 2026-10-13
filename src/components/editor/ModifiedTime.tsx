import { useEffect, useState } from "react";

function modifiedLabel(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 2592000) return relative.format(-Math.floor(seconds / 86400), "day");
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ModifiedTime({ updatedAt }: { updatedAt: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const updated = Date.parse(updatedAt);
  const exact = (timestamp: number) => new Date(timestamp).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return Number.isFinite(updated) ? <time dateTime={updatedAt} data-tooltip={`Last modified: ${exact(updated)}`}>
      Modified {modifiedLabel(updated, now)}
    </time> : null;
}
