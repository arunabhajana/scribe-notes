import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export const TERMS_VERSION = "2026-10-15";
const website = (import.meta.env.VITE_SCRIBE_WEBSITE_URL || "http://localhost:4321").replace(/\/$/, "");
export const termsUrl = `${website}/terms`;
export const privacyUrl = `${website}/privacy`;

export async function openLegalPage(url: string) {
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
