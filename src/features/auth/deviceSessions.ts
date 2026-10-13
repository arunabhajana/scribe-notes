import { invoke, isTauri } from "@tauri-apps/api/core";
import { supabase } from "./supabaseClient";
export type SignOutScope = "single" | "others" | "all";

export type SignedInDevice = {
  sessionId: string;
  name: string;
  clientType: "windows" | "extension" | "mobile" | "web" | "unknown";
  platform: string;
  signedInAt: string;
  lastSeenAt: string;
  current: boolean;
};

type DeviceDetails = { name: string; platform: string; clientType: string };
let deviceDetails: Promise<DeviceDetails> | undefined;

function details() {
  deviceDetails ??= (async () => {
    if (isTauri()) {
      const info = await invoke<{ name: string; platform: string }>("get_device_info");
      return { ...info, name: info.name.slice(0, 100), clientType: "windows" };
    }
    const ua = navigator.userAgent;
    const platform = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown platform";
    return { name: "Scribe in browser", platform, clientType: "web" };
  })().catch((error) => { deviceDetails = undefined; throw error; });
  return deviceDetails;
}

export function deviceSessionError(error: unknown) {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/schema cache|could not find.*function|does not exist/i.test(message))
    return "Device inventory needs the latest Supabase database migration. Apply the signed-in device inventory migration and retry.";
  if (/get_device_info|unknown command|command.*not found/i.test(message)) return "Restart the updated Windows app to register this device.";
  if (/verified.*session|42501|two-step/i.test(message)) return "Verify your account or sign in again to view your devices.";
  return "Could not load signed-in devices. Check your connection and retry.";
}

export async function registerDeviceSession() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const info = await details();
  const { error } = await supabase.rpc("register_device_session", {
    p_device_name: info.name, p_client_type: info.clientType, p_platform: info.platform,
  }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}

export async function getSignedInDevices(): Promise<SignedInDevice[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("get_signed_in_devices").abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Invalid device inventory response.");
  return data.map((row) => {
    if (typeof row.session_id !== "string" || typeof row.device_name !== "string" || typeof row.platform !== "string" || typeof row.signed_in_at !== "string" || typeof row.last_seen_at !== "string" || typeof row.is_current !== "boolean") throw new Error("Invalid device inventory response.");
    return { sessionId: row.session_id, name: row.device_name, platform: row.platform,
      clientType: ["windows", "extension", "mobile", "web"].includes(row.client_type) ? row.client_type : "unknown",
      signedInAt: row.signed_in_at, lastSeenAt: row.last_seen_at, current: row.is_current };
  });
}

export async function revokeDeviceSessions(scope: SignOutScope, sessionId: string | undefined, accessToken: string): Promise<{ revokedCount: number; currentRevoked: boolean }> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("revoke_device_sessions", { p_scope: scope, p_session_id: sessionId ?? null }).setHeader("Authorization", `Bearer ${accessToken}`).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  if (typeof data?.revokedCount !== "number" || typeof data?.currentRevoked !== "boolean") throw new Error("Invalid sign-out response.");
  return data;
}

export function deviceSignOutError(error: unknown) {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/schema cache|could not find.*function|does not exist/i.test(message)) return "Device sign-out needs the latest Supabase session sign-out migration. Apply it and retry.";
  if (/two-step|verified.*session|SCRIBE_SESSION_REVOKED/i.test(message)) return "Verify your account or sign in again before signing out devices.";
  return "Could not confirm device sign-out. Check your connection, refresh the list, and retry.";
}
