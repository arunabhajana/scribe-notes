import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ShortcutBinding } from "../shortcuts/keyboardShortcuts";

let accountUpdate: Promise<void> = Promise.resolve();
let accountQueue: Promise<void> = Promise.resolve();
let accountRevision = 0;
let shortcutQueue: Promise<void> = Promise.resolve();
function registerAccount(userId: string | null) {
  const revision = ++accountRevision;
  accountUpdate = accountQueue.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (revision !== accountRevision) return;
      try {
        await invoke<void>("set_capture_account", { userId });
        const registered = await invoke<string | null>("get_capture_account");
        if (revision !== accountRevision) return;
        if (registered !== userId) throw new Error("The active workspace was not registered. Open Scribe and try again.");
        return;
      } catch (error) {
        if (revision !== accountRevision) return;
        if (attempt === 2) throw error;
        await new Promise(resolve => window.setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  });
  // A failed registration must not prevent the next workspace from registering.
  accountQueue = accountUpdate.catch(() => undefined);
  return accountUpdate;
}
export async function waitForCaptureAccount() {
  let pending: Promise<void>;
  do {
    pending = accountUpdate;
    try { await pending; }
    catch (error) { if (pending === accountUpdate) throw error; }
  } while (pending !== accountUpdate);
}

export async function registerCaptureShortcut(binding: ShortcutBinding) {
  if (isTauri()) await invoke("set_capture_shortcut", { binding });
}

export async function pauseCaptureShortcut(paused: boolean) {
  if (isTauri()) await invoke("pause_capture_shortcut", { paused });
}
export async function setCaptureEnabled(enabled: boolean) {
  if (isTauri()) await invoke("set_capture_enabled", { enabled });
}

export function useQuickCapture(userId: string | null, binding: ShortcutBinding, enabled: boolean, showError: (message: string) => void) {
  // Establish the account promise before passive effects configure notifications.
  useLayoutEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const register = () => {
      void registerAccount(userId).catch((error: unknown) => {
        if (!active) return;
        const detail = typeof error === "string" ? error : error instanceof Error ? error.message : "Workspace registration failed.";
        showError(`Quick Capture could not connect to this workspace: ${detail.slice(0, 400)}`);
      });
    };
    register();
    // Opening capture asks the main window to repair a lost native handoff.
    const subscription = listen("scribe:capture-prepare", () => { if (active) register(); });
    const onFocus = () => { if (active) register(); };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      void subscription.then(stop => stop()).catch(() => undefined);
    };
  }, [userId, showError]);
  useEffect(() => {
    let active = true;
    let pending = false;
    let configured = false;
    const onShortcutError = (event: Event) => showError((event as CustomEvent<string>).detail);
    window.addEventListener("scribe:capture-shortcut-error", onShortcutError);
    const configure = () => {
      if (!active || pending || configured) return;
      pending = true;
      // Serialize React startup/workspace transitions: an obsolete effect must
      // never disable a shortcut after its replacement has already enabled it.
      shortcutQueue = shortcutQueue.catch(() => undefined).then(async () => {
        for (let attempt = 0; attempt < 4 && active; attempt++) {
          try {
            await waitForCaptureAccount();
            if (!active) return;
            await setCaptureEnabled(false);
            if (!active) return;
            if (enabled) {
              await registerCaptureShortcut({ key: binding.key, shift: binding.shift });
              if (!active) return;
              await setCaptureEnabled(true);
            }
            configured = true;
            return;
          } catch (error) {
            if (!active) return;
            const detail = typeof error === "string" ? error : error instanceof Error ? error.message : "Quick Capture could not register its shortcut. Choose another in Settings → Shortcuts.";
            // A real hotkey conflict needs a different binding, rather than retries.
            const transient = /not ready|not available|could not update|could not register/i.test(detail);
            if (transient && attempt < 3) {
              await new Promise(resolve => window.setTimeout(resolve, 250 * (attempt + 1)));
            } else { showError(detail); return; }
          }
        }
      }).finally(() => { pending = false; });
    };
    configure();
    window.addEventListener("focus", configure);
    const subscription = isTauri() ? listen<string>("scribe:capture-error", event => { if (active) showError(event.payload); }) : null;
    return () => {
      active = false;
      window.removeEventListener("focus", configure);
      window.removeEventListener("scribe:capture-shortcut-error", onShortcutError);
      void subscription?.then(stop => stop()).catch(() => undefined);
    };
  }, [binding.key, binding.shift, enabled, showError, userId]);
}
