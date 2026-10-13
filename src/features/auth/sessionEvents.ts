export const SESSION_REVOKED_EVENT = "scribe:session-revoked";

export function sessionIdFromToken(token: string) {
  try {
    const payload = token.split(".")[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.session_id === "string" ? claims.session_id : "";
  } catch { return ""; }
}

export function notifySessionRevoked(sessionId: string, message = "Your session was signed out. Please sign in again.") {
  if (sessionId) window.dispatchEvent(new CustomEvent(SESSION_REVOKED_EVENT, { detail: { sessionId, message } }));
}

export async function sessionAwareFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    try {
      const body = await response.clone().json();
      if (body.message === "SCRIBE_SESSION_REVOKED") {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const token = headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        notifySessionRevoked(sessionIdFromToken(token));
      }
    } catch { /* Non-JSON errors are handled by the caller. */ }
  }
  return response;
}
