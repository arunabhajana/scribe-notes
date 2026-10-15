import { useCallback, useEffect, useState } from "react";
import { supabase } from "../features/auth/supabaseClient";
import { TERMS_VERSION } from "../features/auth/accountTerms";

type TermsStatus = { userId: string; required: boolean; error: string };
export function useAccountTerms(userId: string | undefined) {
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!userId || !supabase) return;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase!.rpc("get_account_terms_status").abortSignal(AbortSignal.timeout(15_000));
        if (error || !data || typeof data.required !== "boolean") throw new Error();
        if (active) setStatus({ userId, required: data.required, error: "" });
      } catch {
        if (active) setStatus({ userId, required: true, error: "Could not check account terms. Check your connection and try again." });
      }
    })();
    return () => { active = false; };
  }, [userId, attempt]);
  const accept = useCallback(async () => {
    if (!userId || !supabase) return "Sign in again to continue.";
    try {
      const { error } = await supabase.rpc("accept_account_terms", { p_version: TERMS_VERSION }).abortSignal(AbortSignal.timeout(15_000));
      if (error) return "Could not save your agreement. Check your connection and try again.";
      setStatus({ userId, required: false, error: "" });
      return null;
    } catch { return "Could not save your agreement. Please try again."; }
  }, [userId]);
  const current = status?.userId === userId ? status : null;
  return { ready: !userId || Boolean(current && !current.required && !current.error), loading: Boolean(userId && !current), error: current?.error ?? "", accept,
    retry: () => { setStatus(null); setAttempt(value => value + 1); } };
}
