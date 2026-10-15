import { useMemo, useState } from "react";
import { ArrowUpRight, Link2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./linkPreviews.css";

function linksIn(value: string, limit: number) {
  const text = value.slice(0, 200000).replace(/```[\s\S]*?```|`[^`]*`/g, "");
  const labels = new Map<string, string>();
  for (const match of text.matchAll(/\[([^\][\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) labels.set(match[2], match[1]);
  const links = new Map<string, { url: string; host: string; title: string; address: string }>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"[\]]+/g)) {
    const raw = match[0].replace(/[),.;!?]+$/, "");
    try {
      const url = new URL(raw);
      if (url.username || url.password || links.has(url.href)) continue;
      const host = url.hostname.replace(/^www\./, "");
      links.set(url.href, { url: url.href, host, title: labels.get(raw) ?? host, address: host + (url.pathname === "/" ? "" : url.pathname) + url.search + url.hash });
      if (links.size >= limit) break;
    } catch { /* Incomplete URLs while typing are not previews. */ }
  }
  return [...links.values()];
}

/** Local URL cards: no requests for metadata, favicons or remote thumbnails. */
export function LinkPreviews({ value, compact = false }: { value: string; compact?: boolean }) {
  const links = useMemo(() => linksIn(value, compact ? 4 : 12), [value, compact]);
  const [error, setError] = useState("");
  if (!links.length) return null;
  return <section className={`link-previews${compact ? " is-compact" : ""}`} aria-label="Links in this note">
    <div className="link-preview-grid">{links.map((link) => <a key={link.url} className="link-preview-card" href={link.url} target="_blank" rel="noopener noreferrer" data-tooltip={`Open ${link.url}`} onClick={(event) => {
      event.stopPropagation();
      if (!isTauri()) return;
      event.preventDefault(); setError("");
      void openUrl(link.url).catch(() => setError("Could not open the link. You can copy its address and open it in your browser."));
    }}><span className="link-preview-icon"><Link2 size={15} /></span><span className="link-preview-copy"><strong>{link.title}</strong><span>{link.address}</span></span><ArrowUpRight className="link-preview-open" size={13} /></a>)}</div>
    {error && <p className="link-preview-error" role="status">{error}</p>}
  </section>;
}
