import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { deviceSessionError, getSignedInDevices, registerDeviceSession, type SignedInDevice } from "../features/auth/deviceSessions";

function inventoryKey(session: Session | null, enabled: boolean) {
  if (!session || !enabled) return "";
  try {
    const payload = session.access_token.split(".")[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.session_id === "string" ? `${session.user.id}:${claims.session_id}` : "";
  } catch { return ""; }
}

export function useDeviceSessions(session: Session | null, enabled: boolean) {
  const key = inventoryKey(session, enabled);
  const keyRef = useRef(key);
  const registration = useRef({ key: "", at: 0 });
  const pending = useRef<{ key: string; task: Promise<void> } | null>(null);
  const [state, setState] = useState<{ key: string; devices: SignedInDevice[]; loading: boolean; error: string; checkedAt: number | null }>({ key: "", devices: [], loading: false, error: "", checkedAt: null });
  useLayoutEffect(() => { keyRef.current = key; }, [key]);

  const checkIn = useCallback(async (expectedKey: string) => {
    if (!expectedKey || keyRef.current !== expectedKey) return;
    if (registration.current.key === expectedKey && Date.now() - registration.current.at < 10 * 60_000) return;
    await registerDeviceSession();
    if (keyRef.current === expectedKey) registration.current = { key: expectedKey, at: Date.now() };
  }, []);

  const refresh = useCallback((): Promise<void> => {
    const expectedKey = keyRef.current;
    if (!expectedKey) return Promise.resolve();
    if (pending.current?.key === expectedKey) return pending.current.task;
    setState((previous) => ({ key: expectedKey, devices: previous.key === expectedKey ? previous.devices : [], loading: true, error: "", checkedAt: previous.key === expectedKey ? previous.checkedAt : null }));
    const task = (async () => {
      try {
        await checkIn(expectedKey);
        if (keyRef.current !== expectedKey) return;
        const devices = await getSignedInDevices();
        if (keyRef.current === expectedKey) setState({ key: expectedKey, devices, loading: false, error: "", checkedAt: Date.now() });
      } catch (error) {
        if (keyRef.current === expectedKey) setState((previous) => ({ ...previous, loading: false, error: deviceSessionError(error) }));
      } finally {
        if (pending.current?.key === expectedKey) pending.current = null;
      }
    })();
    pending.current = { key: expectedKey, task };
    return task;
  }, [checkIn]);

  useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    const heartbeat = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void checkIn(key).catch(() => { /* The inventory refresh presents errors on demand. */ });
    };
    const interval = window.setInterval(heartbeat, 10 * 60_000);
    window.addEventListener("focus", heartbeat);
    window.addEventListener("online", heartbeat);
    return () => {
      window.clearTimeout(timer); window.clearInterval(interval);
      window.removeEventListener("focus", heartbeat); window.removeEventListener("online", heartbeat);
    };
  }, [key, refresh, checkIn]);

  return {
    devices: key && state.key === key ? state.devices : [],
    loading: Boolean(key && (state.key !== key || state.loading)),
    error: key && state.key === key ? state.error : "",
    checkedAt: key && state.key === key ? state.checkedAt : null,
    refresh,
  };
}

export type DeviceInventory = ReturnType<typeof useDeviceSessions>;
