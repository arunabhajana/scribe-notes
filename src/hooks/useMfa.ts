import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../features/auth/supabaseClient";

export type TotpFactor = { id: string; name: string };
export type TotpEnrollment = { id: string; qrCode: string; secret: string };
type MfaState = { sessionKey: string; factors: TotpFactor[]; confirmed: boolean; required: boolean; blockingError: boolean; error: string };

function verifiedTotpFactors(factors: Session["user"]["factors"] = []): TotpFactor[] {
  return factors.filter((factor) => factor.factor_type === "totp" && factor.status === "verified")
    .map((factor) => ({ id: factor.id, name: factor.friendly_name || "Authenticator app" }));
}

function sessionClaims(session: Session | null) {
  try {
    const payload = session?.access_token.split(".")[1];
    if (!payload) return { key: "", aal: "", expires: 0 };
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return { key: `${session!.user.id}:${claims.session_id || session!.access_token}`, aal: String(claims.aal || ""), expires: Number(claims.exp) || 0 };
  } catch { return { key: session?.access_token ?? "", aal: "", expires: 0 }; }
}

function mfaError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (error instanceof Error && (/abort|timeout|failed to fetch|network/i.test(error.message) || error.name === "AbortError"))
    return "Account security could not be reached. Check your connection and try again.";
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
  const { key: sessionKey, aal, expires } = sessionClaims(session);
  const cachedFactors = verifiedTotpFactors(session?.user.factors);
  const claimsRef = useRef({ aal, expires, userId: session?.user.id, factors: cachedFactors });
  const sessionKeyRef = useRef(sessionKey);
  const tokenRef = useRef(token);
  useLayoutEffect(() => {
    sessionKeyRef.current = sessionKey;
    tokenRef.current = token;
    claimsRef.current = { aal, expires, userId: session?.user.id, factors: verifiedTotpFactors(session?.user.factors) };
  }, [sessionKey, token, aal, expires, session?.user.id, session?.user.factors]);
  const request = useRef(0);
  const [state, setState] = useState<MfaState>({ sessionKey: "", factors: [], confirmed: false, required: false, blockingError: false, error: "" });
  const inFlight = useRef<{ token: string; promise: Promise<void> } | null>(null);
  const lastAttempt = useRef({ key: "", time: 0 });
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const expectedToken = tokenRef.current;
    const expectedKey = sessionKeyRef.current;
    const client = supabase;
    if (!client || !expectedToken) return;
    if (inFlight.current?.token === expectedToken) return inFlight.current.promise;
    const id = ++request.current;
    lastAttempt.current = { key: expectedKey, time: Date.now() };
    const run = async () => {
      try {
        // Explicit JWT avoids waiting behind Auth's refresh/session lock. One
        // server lookup supplies factors; the current token supplies its AAL.
        const result = await securityRead(client.auth.getUser(expectedToken));
        if (result.error) throw result.error;
        if (id !== request.current || tokenRef.current !== expectedToken) return;
        if (!result.data.user || result.data.user.id !== claimsRef.current.userId)
          throw Object.assign(new Error("The account session changed. Sign in again."), { status: 401 });
        const factors = result.data.user.factors ?? [];
        setState({ sessionKey: expectedKey, confirmed: true, factors: verifiedTotpFactors(factors),
          required: factors.some((factor) => factor.status === "verified") && claimsRef.current.aal !== "aal2",
          blockingError: false, error: "" });
      } catch (error) {
        if (id !== request.current || tokenRef.current !== expectedToken) return;
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        const valid = claimsRef.current.expires > Date.now() / 1000;
        setState((previous) => {
          const sameSession = previous.sessionKey === expectedKey;
          const confirmed = sameSession && previous.confirmed;
          const blockingError = status === 401 || status === 403 || !valid || !confirmed;
          return { sessionKey: expectedKey, confirmed, factors: sameSession ? previous.factors : claimsRef.current.factors,
            required: sameSession ? previous.required : claimsRef.current.aal !== "aal2", blockingError, error: mfaError(error) };
        });
      }
    };
    const promise = run();
    inFlight.current = { token: expectedToken, promise };
    try { await promise; }
    finally { if (inFlight.current?.promise === promise) inFlight.current = null; }
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
    const onFocus = () => {
      if (lastAttempt.current.key === sessionKeyRef.current && Date.now() - lastAttempt.current.time < 60_000) return;
      void refresh();
    };
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
    required: Boolean(token && (state.sessionKey !== sessionKey || state.blockingError || (!(aal === "aal2" && expires > Date.now() / 1000) && (state.required || session?.user.factors?.some((factor) => factor.status === "verified"))))),
    error: state.sessionKey === sessionKey ? state.error : "",
    factors: state.sessionKey === sessionKey ? state.factors : cachedFactors,
    refresh, enroll, verify, remove, cancelEnrollment, notice,
    announceEnabled,
    clearNotice,
  };
}

export type MfaController = ReturnType<typeof useMfa>;
