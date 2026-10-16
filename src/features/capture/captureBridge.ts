import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ShortcutBinding } from "../shortcuts/keyboardShortcuts";

let accountUpdate: Promise<void> = Promise.resolve();
let accountQueue: Promise<void> = Promise.resolve();
let accountRevision = 0;
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
    const onShortcutError = (event: Event) => showError((event as CustomEvent<string>).detail);
    window.addEventListener("scribe:capture-shortcut-error", onShortcutError);
    void (async () => {
      await setCaptureEnabled(false);
      await waitForCaptureAccount();
      if (!active || !enabled) return;
      await registerCaptureShortcut({ key: binding.key, shift: binding.shift });
      if (active) await setCaptureEnabled(true);
    })().catch((error: unknown) => {
      if (active) showError(typeof error === "string" ? error : "Quick capture could not register its shortcut. Choose another in Settings → Shortcuts.");
    });
    return () => { active = false; window.removeEventListener("scribe:capture-shortcut-error", onShortcutError); };
  }, [binding.key, binding.shift, enabled, showError, userId]);
}
