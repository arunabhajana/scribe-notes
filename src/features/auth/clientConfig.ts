export function clientConfigError(urlText: string | undefined, key: string | undefined, development: boolean) {
  if (!urlText || !key) return "Supabase URL and public key are required.";
  try {
    const url = new URL(urlText);
    const local = development && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname) || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) return "Use an HTTPS Supabase project URL (local HTTP is development-only).";
    if (key.startsWith("sb_publishable_")) return null;
    if (key.startsWith("sb_secret_")) return "A privileged Supabase key cannot be used in a desktop client.";
    const payload = key.split(".")[1];
    if (!payload || JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role !== "anon") return "Use a Supabase publishable key or legacy anon key.";
    return null;
  } catch { return "Invalid Supabase client configuration."; }
}
