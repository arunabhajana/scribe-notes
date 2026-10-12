import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, UserIdentity } from "@supabase/supabase-js";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { needsDisplayName } from "../features/auth/accountProfile";
import {
  authStorageKey,
  supabase,
  supabaseConfigured,
} from "../features/auth/supabaseClient";

export type SocialProvider = "google" | "github";

function linkedAccountsFromIdentities(identities: UserIdentity[]) {
  return identities
    .filter((identity) => identity.provider === "google" || identity.provider === "github")
    .map((identity) => ({
      provider: identity.provider,
      email: typeof identity.identity_data?.email === "string" ? identity.identity_data.email : undefined,
      name: typeof (identity.identity_data?.full_name ?? identity.identity_data?.name ?? identity.identity_data?.user_name) === "string"
        ? String(identity.identity_data?.full_name ?? identity.identity_data?.name ?? identity.identity_data?.user_name)
        : undefined,
    }));
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [authCallbackError, setAuthCallbackError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] = useState(false);
  const [oauthPending, setOauthPending] = useState<SocialProvider | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<{ provider: string; email?: string; name?: string }[]>([]);
  const [linkedIdentityCount, setLinkedIdentityCount] = useState(0);
  const [linkedAccountsLoaded, setLinkedAccountsLoaded] = useState(false);
  const [linkedAccountsError, setLinkedAccountsError] = useState("");
  const handledCallbacks = useRef(new Set<string>());
  const oauthStarting = useRef(false);
  const identityRequest = useRef(0);

  const refreshLinkedAccounts = useCallback(async () => {
    if (!supabase) return "Supabase is not configured.";
    const request = ++identityRequest.current;
    setLinkedAccountsLoaded(false);
    setLinkedAccountsError("");
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) {
        if (request === identityRequest.current) setLinkedAccountsError(error.message);
        return error.message;
      }
      if (request !== identityRequest.current) return null;
      setLinkedIdentityCount(data.identities.length);
      setLinkedAccounts(linkedAccountsFromIdentities(data.identities));
      setLinkedAccountsLoaded(true);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load linked accounts.";
      if (request === identityRequest.current) setLinkedAccountsError(message);
      return message;
    }
  }, []);

  const linkAccount = useCallback(async (provider: SocialProvider) => {
    if (!supabase) return "Supabase is not configured.";
    if (oauthStarting.current) return "A sign-in request is already starting.";
    oauthStarting.current = true;
    try {
      const redirectTo = isTauri() ? "com.scribe.notes://auth/callback" : window.location.origin;
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          scopes: provider === "github" ? "read:user user:email" : "openid email profile",
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Supabase did not return a provider linking URL.");
      const providerUrl = new URL(data.url);
      const projectUrl = new URL(import.meta.env.VITE_SUPABASE_URL);
      const isGoogleUrl = providerUrl.hostname === "accounts.google.com"
        && providerUrl.pathname.startsWith("/o/oauth2/");
      const isGithubUrl = providerUrl.hostname === "github.com"
        && providerUrl.pathname === "/login/oauth/authorize";
      if (providerUrl.protocol !== "https:"
        || !(provider === "google" ? isGoogleUrl : isGithubUrl)
        || providerUrl.searchParams.get("redirect_uri") !== `${projectUrl.origin}/auth/v1/callback`) {
        throw new Error(`Could not start ${provider === "google" ? "Google" : "GitHub"} linking. Check the provider settings and try again.`);
      }
      if (isTauri()) await openUrl(providerUrl.href);
      else window.location.assign(providerUrl.href);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not start account linking. Please try again.";
    } finally {
      oauthStarting.current = false;
    }
  }, []);

  const unlinkAccount = useCallback(async (provider: SocialProvider) => {
    if (!supabase) return "Supabase is not configured.";
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) return error.message;
      setLinkedIdentityCount(data.identities.length);
      setLinkedAccounts(linkedAccountsFromIdentities(data.identities));
      setLinkedAccountsLoaded(true);
      const identity = data.identities.find((item) => item.provider === provider);
      if (!identity) return `No ${provider === "google" ? "Google" : "GitHub"} account is linked.`;
      if (data.identities.length <= 1) return "Link another sign-in method before unlinking this one.";
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
      if (unlinkError) return unlinkError.message;
      const remainingIdentities = data.identities.filter((item) => item.identity_id !== identity.identity_id);
      setLinkedIdentityCount(remainingIdentities.length);
      setLinkedAccounts(linkedAccountsFromIdentities(remainingIdentities));
      setLinkedAccountsLoaded(true);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not unlink this account. Please try again.";
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setLoading(false);
        if (event === "PASSWORD_RECOVERY") setPasswordRecoveryRequired(true);
        else if (event === "SIGNED_OUT") setPasswordRecoveryRequired(false);
        if (nextSession) setOauthPending(null);
        else {
          identityRequest.current += 1;
          setLinkedAccounts([]);
          setLinkedIdentityCount(0);
          setLinkedAccountsLoaded(false);
          setLinkedAccountsError("");
        }
      }
    });

    // Initialization owns browser PKCE callbacks; getSession alone does not
    // propagate errors returned by that initial code exchange.
    if (!isTauri()) {
      void supabase.auth.initialize().then(({ error }) => {
        if (mounted && error) setAuthCallbackError(error.message);
      }).catch(() => {
        if (mounted) setAuthCallbackError("Could not finish browser sign-in. Please try again.");
      });
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        setSession(error ? null : data.session);
        if (error) setAuthCallbackError(error.message);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const authenticatedUserId = session?.user.id;
  const sessionAccessToken = session?.access_token;
  useEffect(() => {
    if (!authenticatedUserId) return;
    const timeout = window.setTimeout(() => void refreshLinkedAccounts(), 0);
    return () => window.clearTimeout(timeout);
  }, [authenticatedUserId, sessionAccessToken, refreshLinkedAccounts]);

  const handleAuthCallback = useCallback(async (rawUrl: string) => {
    if (!supabase) return;
    let callback: URL;
    try {
      callback = new URL(rawUrl);
    } catch {
      return;
    }
    if (
      callback.protocol !== "com.scribe.notes:" ||
      callback.hostname !== "auth" ||
      callback.pathname !== "/callback"
    )
      return;

    const params = callback.searchParams;
    const hash = new URLSearchParams(callback.hash.replace(/^#/, ""));
    const callbackError =
      params.get("error_description") ??
      params.get("error") ??
      hash.get("error_description") ??
      hash.get("error") ??
      hash.get("error_code");
    if (callbackError) {
      setOauthPending(null);
      setAuthCallbackError(callbackError.replaceAll("+", " "));
      return;
    }

    const isRecoveryCallback =
      params.get("type") === "recovery" || hash.get("type") === "recovery";

    const code = params.get("code");
    if (code) {
      if (handledCallbacks.current.has(code)) return;
      handledCallbacks.current.add(code);
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        setAuthCallbackError(error?.message ?? "");
        if (!error) {
          if (isRecoveryCallback) setPasswordRecoveryRequired(true);
          await refreshLinkedAccounts();
        }
      } catch {
        setAuthCallbackError(
          "The confirmation link could not be completed. Please try signing in again.",
        );
      } finally {
        setOauthPending(null);
      }
      return;
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (accessToken && refreshToken) {
      try {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        setAuthCallbackError(error?.message ?? "");
        if (!error) {
          if (isRecoveryCallback) setPasswordRecoveryRequired(true);
          await refreshLinkedAccounts();
        }
      } catch {
        setAuthCallbackError(
          "The confirmation link could not be completed. Please try signing in again.",
        );
      } finally {
        setOauthPending(null);
      }
    }
  }, [refreshLinkedAccounts]);

  useEffect(() => {
    if (!supabase || !isTauri()) return;

    let disposed = false;
    let stopListening: (() => void) | undefined;
    void onOpenUrl((urls) => {
      for (const url of urls) void handleAuthCallback(url);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else stopListening = unlisten;
    }).catch(() => {
      if (!disposed) setAuthCallbackError("Scribe could not listen for sign-in callbacks. Restart the desktop app and try again.");
    });
    void getCurrent()
      .then((urls) => {
        if (urls) for (const url of urls) void handleAuthCallback(url);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [handleAuthCallback]);

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    if (!supabase) return "Sign-in is unavailable until Supabase is configured.";
    if (oauthStarting.current) return "A sign-in request is already starting.";
    oauthStarting.current = true;
    setAuthCallbackError("");
    setAuthNotice("");
    setOauthPending(provider);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: isTauri() ? "com.scribe.notes://auth/callback" : window.location.origin,
          skipBrowserRedirect: true,
          scopes: provider === "github" ? "read:user user:email" : "openid email profile",
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("No sign-in URL was returned.");
      const url = new URL(data.url);
      const projectUrl = new URL(import.meta.env.VITE_SUPABASE_URL);
      if (url.protocol !== "https:" || url.origin !== projectUrl.origin)
        throw new Error("The sign-in URL does not match the configured Supabase project.");
      if (isTauri()) await openUrl(url.href);
      else window.location.assign(url.href);
      return null;
    } catch (error) {
      setOauthPending(null);
      return error instanceof Error ? error.message : "Could not start provider sign-in. Please try again.";
    } finally {
      oauthStarting.current = false;
    }
  }, []);

  const completeDisplayName = useCallback(async (name: string) => {
    const displayName = name.trim();
    if (!displayName || displayName.length > 60) return "Enter a name between 1 and 60 characters.";
    if (!supabase) return "Supabase is not configured.";
    if (!session?.user) return "Sign in again before saving your name.";
    try {
      const { error: profileError } = await supabase.from("profiles")
        .upsert({ user_id: session.user.id, display_name: displayName }, { onConflict: "user_id" });
      if (profileError) return "Could not save your profile. Please try again.";
      const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
      return error?.message ?? null;
    } catch {
      return "Could not save your display name. Check your connection and try again.";
    }
  }, [session]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase)
        return "Supabase is not configured. Add the project URL and publishable key to .env.local.";
      setAuthNotice("");
      setAuthCallbackError("");
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!error) {
        setPasswordRecoveryRequired(false);
        return null;
      }
      if (/email not confirmed/i.test(error.message)) {
        return "Please confirm your email using the link we sent before signing in.";
      }
      return error.message;
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return "Password reset is unavailable until Supabase is configured.";
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return "Enter your email address first.";
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: isTauri() ? "com.scribe.notes://auth/callback" : window.location.origin,
      });
      return error?.message ?? null;
    } catch {
      return "Could not send the reset email. Check your connection and try again.";
    }
  }, []);

  const updateRecoveredPassword = useCallback(async (password: string) => {
    if (!supabase) return "Password reset is unavailable until Supabase is configured.";
    if (!session) return "Your reset session expired. Request a new password reset email.";
    if (password.length < 6) return "Use at least 6 characters for your new password.";
    try {
      const { error } = await supabase.auth.updateUser({ password });
      return error?.message ?? null;
    } catch {
      return "Could not update your password. Check your connection and try again.";
    }
  }, [session]);

  const finishPasswordRecovery = useCallback(() => {
    setPasswordRecoveryRequired(false);
    setAuthCallbackError("");
  }, []);

  const signUpWithPassword = useCallback(
    async (displayName: string, email: string, password: string) => {
      if (!supabase)
        return {
          error:
            "Supabase is not configured. Add the project URL and publishable key to .env.local.",
          confirmationRequired: false,
        };
      setAuthNotice("");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: isTauri()
            ? "com.scribe.notes://auth/callback"
            : window.location.origin,
        },
      });
      if (error) return { error: error.message, confirmationRequired: false };
      return { error: null, confirmationRequired: !data.session };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return null;
    setLoading(true);
    setSession(null);
    let remoteError: string | null;
    let storageError: string | null = null;
    try {
      const { error } = await supabase.auth.signOut();
      remoteError = error?.message ?? null;
    } catch (error) {
      remoteError =
        error instanceof Error
          ? error.message
          : "Sign out could not reach Supabase.";
    } finally {
      try {
        localStorage.removeItem(authStorageKey);
      } catch (error) {
        storageError =
          error instanceof Error
            ? error.message
            : "The local session could not be removed.";
      }
      setLoading(false);
    }
    setAuthNotice(
      storageError
        ? "You are signed out of the app, but local session cleanup could not be confirmed. Restart the app before signing in again."
        : remoteError
          ? "You are signed out on this device. Supabase could not confirm remote session revocation; reconnect and sign in again if you need to retry."
          : "",
    );
    return storageError ?? remoteError;
  }, []);

  return {
    user: session?.user ?? null,
    loading,
    configured: supabaseConfigured,
    signInWithPassword,
    requestPasswordReset,
    updateRecoveredPassword,
    passwordRecoveryRequired,
    finishPasswordRecovery,
    signUpWithPassword,
    signInWithProvider,
    linkedAccounts,
    linkedIdentityCount,
    linkedAccountsLoaded,
    linkedAccountsError,
    refreshLinkedAccounts,
    linkAccount,
    unlinkAccount,
    oauthPending,
    cancelProviderSignIn: () => setOauthPending(null),
    needsDisplayName: Boolean(session?.user && needsDisplayName(session.user)),
    completeDisplayName,
    authCallbackError,
    authNotice,
    signOut,
  };
}
