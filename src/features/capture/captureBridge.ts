import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { ShortcutBinding } from "../shortcuts/keyboardShortcuts";

let accountUpdate: Promise<void> = Promise.resolve();
export function waitForCaptureAccount() { return accountUpdate; }

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
  useEffect(() => {
    if (!isTauri()) return;
    accountUpdate = invoke<void>("set_capture_account", { userId });
    void accountUpdate.catch(() => showError("Quick capture could not access your account. Restart Scribe to try again."));
  }, [userId, showError]);
  useEffect(() => {
    let active = true;
    const onShortcutError = (event: Event) => showError((event as CustomEvent<string>).detail);
    window.addEventListener("scribe:capture-shortcut-error", onShortcutError);
    void (async () => {
      await setCaptureEnabled(false);
      if (!active || !enabled) return;
      await registerCaptureShortcut({ key: binding.key, shift: binding.shift });
      if (active) await setCaptureEnabled(true);
    })().catch((error: unknown) => {
      if (active) showError(typeof error === "string" ? error : "Quick capture could not register its shortcut. Choose another in Settings → Shortcuts.");
    });
    return () => { active = false; window.removeEventListener("scribe:capture-shortcut-error", onShortcutError); };
  }, [binding.key, binding.shift, enabled, showError]);
}
