import { loadEnv } from "vite";
import { readFileSync } from "node:fs";

const env = { ...loadEnv("production", process.cwd(), "VITE_"), ...process.env };
for (const [name, value] of Object.entries(env)) {
  if (!name.startsWith("VITE_") || typeof value !== "string") continue;
  let privileged = value.startsWith("sb_secret_") || /SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY/i.test(name);
  try { privileged ||= JSON.parse(Buffer.from(value.split(".")[1] ?? "", "base64url").toString()).role === "service_role"; } catch { /* Plain public settings are not JWTs. */ }
  if (privileged) throw new Error("Privileged credentials must not be exposed through VITE_ build variables.");
}
const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url)));
let url;
try { url = new URL(env.VITE_SUPABASE_URL ?? "https://missing.invalid"); }
catch { throw new Error("Production requires a valid HTTPS Supabase project origin."); }
const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? "").trim();
let publicKey = key.startsWith("sb_publishable_");
try { publicKey ||= JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()).role === "anon"; } catch { /* Reject unknown key types. */ }
if (!env.VITE_SUPABASE_URL || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("Production requires an HTTPS Supabase project origin.");
if (!publicKey || key.startsWith("sb_secret_")) throw new Error("Production client builds must use a publishable/anon key, never a secret or service-role key.");
const csp = config.app?.security?.csp;
const connect = typeof csp === "string" ? csp.split(";").map((part) => part.trim().split(/\s+/)).find((parts) => parts[0] === "connect-src") : null;
if (!connect?.includes(url.origin) || !connect.includes(url.origin.replace(/^https:/, "wss:")) || csp.includes("'unsafe-eval'")) throw new Error("The production CSP must allow the configured Supabase project and must not allow unsafe-eval.");
console.log("Production client security configuration checked (public key, HTTPS, project CSP).");
