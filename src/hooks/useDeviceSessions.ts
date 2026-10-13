import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { deviceSessionError, getSignedInDevices, deviceSignOutError, revokeDeviceSessions, type SignOutScope, registerDeviceSession, type SignedInDevice } from "../features/auth/deviceSessions";

import { notifySessionRevoked } from "../features/auth/sessionEvents";

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
  const tokenRef = useRef(session?.access_token ?? "");
  const actionBusy = useRef(false);
  const [operation, setOperation] = useState({ key: "", pending: "", error: "", notice: "" });
  const registration = useRef({ key: "", at: 0 });
  const pending = useRef<{ key: string; task: Promise<void> } | null>(null);
  const [state, setState] = useState<{ key: string; devices: SignedInDevice[]; loading: boolean; error: string; checkedAt: number | null }>({ key: "", devices: [], loading: false, error: "", checkedAt: null });
  useLayoutEffect(() => { keyRef.current = key; tokenRef.current = session?.access_token ?? ""; }, [key, session?.access_token]);

  const checkIn = useCallback(async (expectedKey: string) => {
    if (!expectedKey || keyRef.current !== expectedKey) return;
    if (registration.current.key === expectedKey && Date.now() - registration.current.at < 10 * 60_000) return;
    await registerDeviceSession();
    if (keyRef.current === expectedKey) registration.current = { key: expectedKey, at: Date.now() };
  }, []);

  const refresh = useCallback((): Promise<void> => {
    const expectedKey = keyRef.current;
    if (!expectedKey || actionBusy.current) return Promise.resolve();
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

  const revoke = useCallback(async (scope: SignOutScope, sessionId?: string): Promise<string | null> => {
    const expectedKey = keyRef.current;
    if (!expectedKey) return "Sign in again before managing devices.";
    if (actionBusy.current) return "A sign-out request is already running.";
    actionBusy.current = true;
    setOperation({ key: expectedKey, pending: scope === "single" ? sessionId ?? "single" : scope, error: "", notice: "" });
    try {
      await pending.current?.task;
      if (keyRef.current !== expectedKey) return "The signed-in account changed. Please try again.";
      const result = await revokeDeviceSessions(scope, sessionId, tokenRef.current);
      if (keyRef.current !== expectedKey) return null;
      const notice = scope === "all" ? "Signed out from all devices." : scope === "others" ? "Other devices signed out." : result.revokedCount ? "Device signed out." : "That session was already signed out.";
      setState((previous) => ({ ...previous, devices: previous.devices.filter((device) => scope === "all" ? false : scope === "others" ? device.current : device.sessionId !== sessionId) }));
      setOperation({ key: expectedKey, pending: "", error: "", notice });
      if (result.currentRevoked) notifySessionRevoked(expectedKey.split(":")[1], notice);
      else {
        actionBusy.current = false;
        await refresh();
      }
      return null;
    } catch (error) {
      const message = deviceSignOutError(error);
      if (keyRef.current === expectedKey) setOperation({ key: expectedKey, pending: "", error: message, notice: "" });
      return message;
    } finally { actionBusy.current = false; }
  }, [refresh]);
  const clearNotice = useCallback(() => setOperation((previous) => ({ ...previous, notice: "" })), []);
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
    refresh, revoke, clearNotice,
    action: operation.key === key ? operation.pending : "",
    actionError: operation.key === key ? operation.error : "",
    notice: operation.key === key ? operation.notice : "",
  };
}

export type DeviceInventory = ReturnType<typeof useDeviceSessions>;
