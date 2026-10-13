import { useEffect, useLayoutEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../features/auth/supabaseClient";
import { SESSION_REVOKED_EVENT, sessionIdFromToken } from "../features/auth/sessionEvents";

export function useSessionGuard(session: Session | null, onRevoked: (message: string) => Promise<void>) {
  const sessionId = session ? sessionIdFromToken(session.access_token) : "";
  const currentId = useRef(sessionId);
  useLayoutEffect(() => { currentId.current = sessionId; }, [sessionId]);
  useEffect(() => {
    if (!sessionId || !supabase) return;
    const client = supabase;
    let disposed = false;
    let checking = false;
    let handling = false;
    const revoke = async (message: string) => {
      if (disposed || handling || currentId.current !== sessionId) return;
      handling = true;
      await onRevoked(message);
    };
    const check = async () => {
      if (disposed || checking || handling || !navigator.onLine || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const { data, error } = await client.rpc("scribe_session_is_active").abortSignal(AbortSignal.timeout(10_000));
        // Offline/server failures never count as proof that a session was revoked.
        if (!error && data === false) await revoke("Your session was signed out. Please sign in again.");
      } catch { /* Retry on focus, reconnect, or the next visible interval. */ }
      finally { checking = false; }
    };
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string; message: string }>).detail;
      if (detail?.sessionId === sessionId) void revoke(detail.message);
    };
    const onFocus = () => void check();
    const timer = window.setTimeout(onFocus, 0);
    const interval = window.setInterval(onFocus, 60_000);
    window.addEventListener(SESSION_REVOKED_EVENT, onEvent);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true; window.clearTimeout(timer); window.clearInterval(interval);
      window.removeEventListener(SESSION_REVOKED_EVENT, onEvent);
      window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [sessionId, onRevoked]);
}
