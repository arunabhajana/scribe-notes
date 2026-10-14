import { createClient } from "@supabase/supabase-js";
import { isTauri } from "@tauri-apps/api/core";
import { sessionAwareFetch } from "./sessionEvents";
import { clientConfigError } from "./clientConfig";

export const authStorageKey = "com.scribe.notes.supabase.auth";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const supabaseConfigured = clientConfigError(supabaseUrl, supabasePublishableKey, import.meta.env.DEV) === null;

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      global: { fetch: sessionAwareFetch },
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: !isTauri(),
        flowType: "pkce",
        persistSession: true,
        storageKey: authStorageKey,
      },
    })
  : null;
