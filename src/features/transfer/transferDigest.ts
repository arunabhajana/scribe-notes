const encoder = new TextEncoder();
export async function digest(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value.slice();
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer))).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
