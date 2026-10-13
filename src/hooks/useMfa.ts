import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../features/auth/supabaseClient";

export type TotpFactor = { id: string; name: string };
export type TotpEnrollment = { id: string; qrCode: string; secret: string };
type MfaState = { sessionKey: string; factors: TotpFactor[]; required: boolean; error: string };

function sessionClaims(session: Session | null) {
  try {
    const payload = session?.access_token.split(".")[1];
    if (!payload) return { key: "", aal: "" };
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return { key: `${session!.user.id}:${claims.session_id || session!.access_token}`, aal: String(claims.aal || "") };
  } catch { return { key: session?.access_token ?? "", aal: "" }; }
}

function mfaError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "mfa_verification_failed") return "That code did not match. Try the latest code from your authenticator.";
  if (code === "mfa_factor_name_conflict") return "An authenticator already has that name. Choose a different name.";
  if (code === "too_many_enrolled_mfa_factors") return "An authenticator is already enrolled. Remove it before setting up another.";
  if (code === "over_request_rate_limit" || code === "over_mfa_rate_limit") return "Too many attempts. Wait a moment before trying again.";
  if (code === "mfa_totp_enroll_not_enabled") return "Authenticator setup is disabled for this project. Enable TOTP in Supabase.";
  if (code === "mfa_totp_verify_not_enabled") return "Authenticator verification is disabled for this project. Enable TOTP in Supabase.";
  return error instanceof Error ? error.message : "Could not reach account security. Check your connection and try again.";
}

async function securityRead<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Could not check account security. Check your connection and try again.")), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}

export function useMfa(session: Session | null) {
  const token = session?.access_token ?? "";
  const { key: sessionKey, aal } = sessionClaims(session);
  const sessionKeyRef = useRef(sessionKey);
  const tokenRef = useRef(token);
  useLayoutEffect(() => {
    sessionKeyRef.current = sessionKey;
    tokenRef.current = token;
  }, [sessionKey, token]);
  const request = useRef(0);
  const [state, setState] = useState<MfaState>({ sessionKey: "", factors: [], required: false, error: "" });
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const expectedToken = tokenRef.current;
    const expectedKey = sessionKeyRef.current;
    const id = ++request.current;
    if (!supabase || !expectedToken) return;
    try {
      // listFactors fetches the user from Auth, rather than trusting old JWT metadata.
      const factors = await securityRead(supabase.auth.mfa.listFactors());
      if (factors.error) throw factors.error;
      const assurance = await securityRead(supabase.auth.mfa.getAuthenticatorAssuranceLevel());
      if (assurance.error) throw assurance.error;
      if (id !== request.current || tokenRef.current !== expectedToken) return;
      setState({ sessionKey: expectedKey,
        factors: factors.data.totp.map((factor) => ({ id: factor.id, name: factor.friendly_name || "Authenticator app" })),
        required: factors.data.all.some((factor) => factor.status === "verified") && assurance.data.currentLevel !== "aal2",
        error: "" });
    } catch (error) {
      if (id === request.current && tokenRef.current === expectedToken)
        setState({ sessionKey: expectedKey, factors: [], required: true, error: mfaError(error) });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => { window.clearTimeout(timer); request.current += 1; };
  }, [token, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => setNotice(""), 0);
    return () => window.clearTimeout(timer);
  }, [sessionKey]);

  useEffect(() => {
    if (!token) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [token, refresh]);

  const verify = useCallback(async (factorId: string, code: string) => {
    if (!supabase || !tokenRef.current) return "Sign in again to verify your authenticator.";
    if (!/^\d{6}$/.test(code)) return "Enter the six-digit code from your authenticator.";
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      return error ? mfaError(error) : null;
    } catch (error) { return mfaError(error); }
  }, []);

  const enroll = useCallback(async (name: string): Promise<{ enrollment?: TotpEnrollment; error?: string }> => {
    if (!supabase || !tokenRef.current) return { error: "Sign in again to set up an authenticator." };
    try {
      // Clean up abandoned setups; verified authenticators are never removed here.
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      if (factors.data.totp.length > 0) {
        await refresh();
        return { error: "You already have an authenticator. Remove it before setting up another." };
      }
      for (const factor of factors.data.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
        const result = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (result.error) throw result.error;
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: name.trim() || "Authenticator app", issuer: "Scribe" });
      if (error) throw error;
      const qrCode = data.totp.qr_code.startsWith("data:") ? data.totp.qr_code : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.totp.qr_code)}`;
      return { enrollment: { id: data.id, qrCode, secret: data.totp.secret } };
    } catch (error) { return { error: mfaError(error) }; }
  }, [refresh]);

  const cancelEnrollment = useCallback(async (factorId: string) => {
    if (!supabase) return "Account security is unavailable.";
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const factor = factors.data.all.find((item) => item.id === factorId);
      if (!factor || factor.status === "verified") return null;
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      return error ? mfaError(error) : null;
    } catch (error) { return mfaError(error); }
  }, []);

  const remove = useCallback(async (factorId: string, code: string) => {
    if (!supabase) return "Account security is unavailable.";
    const error = await verify(factorId, code);
    if (error) return error;
    try {
      const result = await supabase.auth.mfa.unenroll({ factorId });
      if (result.error) return mfaError(result.error);
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) { await refresh(); return "Authenticator removed. Sign in again to refresh your security status."; }
      setNotice("Authenticator removed.");
      await refresh();
      return null;
    } catch (failure) { return mfaError(failure); }
  }, [verify, refresh]);

  const announceEnabled = useCallback(() => setNotice("Authenticator enabled. Two-step verification is on."), []);
  const clearNotice = useCallback(() => setNotice(""), []);

  return {
    loading: Boolean(token && state.sessionKey !== sessionKey),
    required: Boolean(token && (state.sessionKey !== sessionKey || state.error || ((state.required || session?.user.factors?.some((factor) => factor.status === "verified")) && aal !== "aal2"))),
    error: state.sessionKey === sessionKey ? state.error : "",
    factors: state.sessionKey === sessionKey ? state.factors : [],
    refresh, enroll, verify, remove, cancelEnrollment, notice,
    announceEnabled,
    clearNotice,
  };
}

export type MfaController = ReturnType<typeof useMfa>;
