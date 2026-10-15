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
  const url = new URL(input instanceof Request ? input.url : String(input));
  // Bound user lookups and logout so network loss cannot hold Auth's session
  // lock or account-deletion cleanup indefinitely.
  const userLookup = /\/auth\/v1\/user\/?$/.test(url.pathname) && (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() === "GET";
  const logout = /\/auth\/v1\/logout\/?$/.test(url.pathname);
  const controller = userLookup || logout ? new AbortController() : null;
  const originalSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = controller ? originalSignal ? AbortSignal.any([originalSignal, controller.signal]) : controller.signal : originalSignal;
  const timer = controller ? setTimeout(() => controller.abort(), 12_000) : undefined;
  let response: Response;
  try {
    response = await fetch(input, { ...init, signal });
    if (controller) {
      // Keep the deadline through body download, not only until headers arrive.
      const body = await response.arrayBuffer();
      response = new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
  }
  finally { clearTimeout(timer); }
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
