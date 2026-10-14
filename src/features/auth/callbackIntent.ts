type EmailIntent = "signup" | "recovery";
const storageKey = "scribe-email-callback-intent";

export function rememberEmailIntent(type: EmailIntent, email: string) {
  localStorage.setItem(storageKey, JSON.stringify({ type, email: email.trim().toLowerCase(), requestedAt: Date.now() }));
}

export function clearEmailIntent() {
  localStorage.removeItem(storageKey);
}

export function matchesEmailIntent(value: unknown, type: string | null, email: string, now = Date.now()): boolean {
  if (!value || typeof value !== "object" || !["signup", "recovery"].includes(type ?? "")) return false;
  const intent = value as Record<string, unknown>;
  const ttl = type === "recovery" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return intent.type === type && intent.email === email.trim().toLowerCase()
    && typeof intent.requestedAt === "number" && now >= intent.requestedAt && now - intent.requestedAt <= ttl;
}

export function hasEmailIntent(type: string | null, email: string): boolean {
  try { return matchesEmailIntent(JSON.parse(localStorage.getItem(storageKey) ?? "null"), type, email); }
  catch { return false; }
}
