import { assertWorkspaceWritable, workspaceDeletionStatus } from "../auth/workspaceDeletionState";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowUpRight, Bell, Check, FileText, X } from "lucide-react";
import { offlineStore } from "../notes/offlineStore";
import { notifyQuickCaptureSaved } from "../notifications/desktopNotifications";
import { accentColors, type AccentColor } from "../settings/accentColors";
import { formatShortcut, getShortcutBindings } from "../shortcuts/keyboardShortcuts";
import type { Note, NoteFolder } from "../../types/note";
import { CaptureFolderPicker } from "./CaptureFolderPicker";
import { smartPaste } from "./smartPaste";
import { CaptureReminderPicker } from "../../components/reminders/CaptureReminderPicker";
import { LinkPreviews } from "../../components/editor/LinkPreviews";
import { TooltipLayer } from "../../components/layout/TooltipLayer";
import { reminderStore } from "../reminders/reminderStore";
import { formatReminderTime } from "../reminders/reminderTypes";
import { useWritingPreferences } from "../settings/writingPreferences";
import { readWorkspacePreference } from "../settings/workspacePreferences";
import { WorkspacePreferencesProvider } from "../settings/WorkspacePreferencesProvider";
import "./quickCapture.css";
import "../../App.css";

type Draft = { id: string; title: string; body: string; folderId: string | null; reminder: { dueAt: string; leadMinutes: number } | null };
const emptyDraft = (): Draft => ({ id: crypto.randomUUID(), title: "", body: "", folderId: null, reminder: null });
const draftKey = (userId: string) => `scribe-quick-capture-draft:${userId}`;
function saveDraft(userId: string, value: Draft) {
  assertWorkspaceWritable(userId);
  localStorage.setItem(draftKey(userId), JSON.stringify(value));
  if (workspaceDeletionStatus(userId)) {
    localStorage.removeItem(draftKey(userId));
    assertWorkspaceWritable(userId);
  }
}

export default function QuickCapture() {
  const [account, setAccount] = useState<string | null>(null);
  return <WorkspacePreferencesProvider workspaceId={account}><QuickCaptureContent account={account} setAccount={setAccount} /></WorkspacePreferencesProvider>;
}

function QuickCaptureContent({ account, setAccount }: { account: string | null; setAccount: (value: string | null) => void }) {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [preferences] = useWritingPreferences();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [appearance, setAppearance] = useState({ dark: true, accent: accentColors.violet.color as string, font: "DM Sans", shortcut: "Ctrl + Shift + Space" });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const reminderTrigger = useRef<HTMLButtonElement>(null);
  const plainPaste = useRef(false);
  const savingRef = useRef(false);
  const accountRef = useRef<string | null>(null);
  const refreshSequence = useRef(0);
  const focusRequested = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async (focus = false) => {
      focusRequested.current ||= focus;
      const sequence = ++refreshSequence.current;
      try {
        const userId = await invoke<string | null>("get_capture_account");
        if (!active || sequence !== refreshSequence.current) return;
        if (userId !== accountRef.current) {
          let saved = emptyDraft();
          if (userId) {
            try {
              const value: unknown = JSON.parse(localStorage.getItem(draftKey(userId)) ?? "null");
              if (value && typeof value === "object" && "title" in value && "body" in value && typeof value.title === "string" && typeof value.body === "string") {
                saved = { ...saved, title: value.title, body: value.body,
                  id: "id" in value && typeof value.id === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.id) ? value.id : saved.id,
                  folderId: "folderId" in value && typeof value.folderId === "string" ? value.folderId : null };
                if ("reminder" in value && value.reminder && typeof value.reminder === "object" && "dueAt" in value.reminder && typeof value.reminder.dueAt === "string" && Number.isFinite(Date.parse(value.reminder.dueAt)) && "leadMinutes" in value.reminder && typeof value.reminder.leadMinutes === "number" && Number.isInteger(value.reminder.leadMinutes) && value.reminder.leadMinutes >= 0 && value.reminder.leadMinutes <= 60)
                  saved.reminder = { dueAt: value.reminder.dueAt, leadMinutes: value.reminder.leadMinutes };
              }
            } catch { /* A corrupt draft must not prevent a new capture. */ }
            // A crash between the committed save and draft cleanup must not
            // reopen a saved capture and overwrite a note edited afterwards.
            if ((saved.title || saved.body) && await offlineStore.getNote(userId, saved.id)) {
              try { localStorage.removeItem(draftKey(userId)); } catch { /* The saved note is durable. */ }
              saved = emptyDraft();
            }
          }
          if (!active || sequence !== refreshSequence.current) return;
          accountRef.current = userId;
          setDraft(saved); setAccount(userId); setError(""); setFolders([]); setReminderOpen(false);
        }
        const accent = readWorkspacePreference(userId, "scribe-accent") as AccentColor;
        setAppearance({ dark: readWorkspacePreference(userId, "scribe-theme") !== "light", accent: accentColors[accent]?.color ?? accentColors.violet.color,
          font: readWorkspacePreference(userId, "scribe-font-family") ?? "DM Sans", shortcut: formatShortcut(getShortcutBindings(userId).quickCapture) });
        setReady(true);
        if (focusRequested.current) {
          focusRequested.current = false;
          requestAnimationFrame(() => bodyRef.current?.focus({ preventScroll: true }));
        }
        if (userId) {
          const localFolders = await offlineStore.loadFolders(userId);
          if (active && sequence === refreshSequence.current && accountRef.current === userId) setFolders(localFolders);
        }
      } catch { if (active) { setReady(true); setError("Could not open quick capture. Open Scribe and try again."); } }
    };
    void refresh(true);
    const listeners = [listen("scribe:capture-open", () => { void refresh(true); }), listen("scribe:capture-account", () => { void refresh(); })];
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.removeEventListener("focus", onFocus); listeners.forEach((listener) => { void listener.then((unlisten) => unlisten()); }); };
  }, [setAccount]);

  const close = () => { if (!savingRef.current) void getCurrentWindow().hide(); };
  const changeDraft = (value: Draft) => {
    if (account && workspaceDeletionStatus(account)) { setError("This offline profile is being deleted."); return; }
    setDraft(value);
    if (account) {
      try { saveDraft(account, value); setError(""); }
      catch { setError("Draft recovery is unavailable. Save your note before closing Scribe."); }
    }
  };
  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!account || savingRef.current || (!draft.title.trim() && !draft.body.trim())) return;
    savingRef.current = true; setSaving(true); setError("");
    const owner = account;
    const timestamp = new Date().toISOString();
    const note: Note = { id: draft.id, title: draft.title.trim() || draft.body.trim().split("\n")[0].replace(/^#+\s*/, "").slice(0, 80), body: draft.body,
      folderId: draft.folderId, pinned: false, isDraft: false, deletedAt: null, createdAt: timestamp, updatedAt: timestamp };
    let reminderPrepared = false;
    try {
      if (await invoke<string | null>("get_capture_account") !== owner) throw new Error("Your account changed. Open Scribe before saving this note.");
      if (draft.reminder && Date.parse(draft.reminder.dueAt) <= Date.now()) throw new Error("Your reminder time has passed. Choose a new time before saving.");
      if (draft.folderId && !(await offlineStore.loadFolders(owner)).some((folder) => folder.id === draft.folderId)) throw new Error("That folder is no longer available. Choose another folder or Unfiled.");
      // Keep the capture ID stable across retries. Reminders for a new note
      // remain queued until that note reaches the cloud; they are never sent
      // from a second sync client in this window.
      saveDraft(owner, draft);
      const reminderCache = await reminderStore.load(owner);
      if (draft.reminder || reminderCache.reminders[note.id]?.dueAt) {
        await reminderStore.set(owner, note.id, draft.reminder?.dueAt ?? null, draft.reminder ? parseInt(preferences.reminderLead) || 0 : 0);
        reminderPrepared = true;
      }
      await offlineStore.putNote(owner, note, null, true);
    } catch (cause) {
      if (reminderPrepared) await reminderStore.set(owner, note.id, null, 0).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Could not save this note on your device. Your text is still here; try again.");
      savingRef.current = false; setSaving(false); return;
    }
    // A notification or event failure must never turn a committed save into a
    // retry that creates another note. Main also reconciles new notes on focus.
    try { localStorage.removeItem(draftKey(owner)); } catch { /* The note itself is already durable. */ }
    if (accountRef.current === owner) setDraft(emptyDraft());
    await invoke("capture_saved", { userId: owner, noteId: note.id }).catch(() => undefined);
    const inApp = await invoke<boolean>("finish_capture").catch(async () => { await getCurrentWindow().hide().catch(() => undefined); return undefined; });
    savingRef.current = false; setSaving(false);
    void notifyQuickCaptureSaved(owner, inApp).catch(() => undefined);
  };

  return <main className={`capture-shell ${appearance.dark ? "capture-dark" : "capture-light"}`} style={{ "--capture-accent": appearance.accent, fontFamily: `"${appearance.font}", "Segoe UI", sans-serif` } as CSSProperties}
    onKeyDown={(event) => {
      if (reminderOpen) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab" && !event.defaultPrevented) {
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), textarea:not(:disabled)');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.ctrlKey && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); }
    }}>
    <header className="capture-header" data-tauri-drag-region>
      <div className="capture-brand" data-tauri-drag-region><img src="/scribe-logo-sidebar.png" alt="" /><span>Scribe<span className="capture-subtitle">Quick capture</span></span></div>
      <button className="capture-icon-button capture-close" type="button" aria-label="Close quick capture; keep draft" data-tooltip="Close · Esc (draft is kept)" onClick={close} disabled={saving}><X size={17} /></button>
    </header>
    {ready && account ? <form className="capture-form" onSubmit={(event) => { void save(event); }}>
      <input className="capture-title" aria-label="Note title (optional)" placeholder="Title (optional)" value={draft.title} maxLength={500} disabled={saving} onChange={(event) => changeDraft({ ...draft, title: event.target.value })} />
      <textarea ref={bodyRef} className="capture-body" aria-label="Note content" placeholder="What’s on your mind?" value={draft.body} spellCheck={preferences.spellcheck} disabled={saving}
        onKeyDown={(event) => { plainPaste.current = event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v"; }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (!text) return;
          const input = event.currentTarget, start = input.selectionStart, end = input.selectionEnd;
          const paste = smartPaste(text, event.clipboardData.getData("text/html"), draft.body.slice(start, end), plainPaste.current);
          plainPaste.current = false;
          if (paste === text) return; // Native paste keeps its normal undo history.
          event.preventDefault();
          if (document.execCommand("insertText", false, paste)) return;
          changeDraft({ ...draft, body: draft.body.slice(0, start) + paste + draft.body.slice(end) });
          requestAnimationFrame(() => { input.setSelectionRange(start + paste.length, start + paste.length); });
        }} onChange={(event) => changeDraft({ ...draft, body: event.target.value })} />
      <LinkPreviews value={draft.body} compact />
      {error && <p className="capture-error" role="alert">{error}</p>}
      <footer className="capture-footer"><div className="capture-options">
        <CaptureFolderPicker folders={folders} value={draft.folderId} disabled={saving} onChange={(folderId) => changeDraft({ ...draft, folderId })} />
        <button ref={reminderTrigger} type="button" className={`capture-control capture-reminder${draft.reminder ? " is-set" : ""}`} data-tooltip={draft.reminder ? `Edit reminder · ${formatReminderTime(draft.reminder.dueAt)}` : "Add a reminder"} disabled={saving} onClick={() => setReminderOpen(true)}><Bell size={14} /><span>{draft.reminder ? formatReminderTime(draft.reminder.dueAt) : "Reminder"}</span></button>
      </div>
        <button className="capture-save" type="submit" data-tooltip="Save note · Ctrl + Enter" disabled={saving || (!draft.title.trim() && !draft.body.trim())}><Check size={16} />{saving ? "Saving…" : "Save note"}<kbd>Ctrl ↵</kbd></button>
      </footer>
    </form> : <section className="capture-empty"><FileText size={28} /><h1>{ready ? "Choose your workspace" : "Opening capture…"}</h1><p>{ready ? "Open Scribe to create an offline profile or sign in. Captured notes save to your active workspace." : "Getting your workspace ready."}</p>{error && <p role="alert">{error}</p>}{ready && <button className="capture-save" onClick={() => { void invoke("open_capture_main"); }}>Open Scribe<ArrowUpRight size={16} /></button>}</section>}
    <div className="capture-hint"><span data-tooltip="Paste a URL over selected text to create a link. Ctrl + Shift + V pastes plain text.">You can paste links or selected text</span><span>Tab to navigate · Esc keeps draft</span></div>
    <TooltipLayer />
    {reminderOpen && <CaptureReminderPicker dueAt={draft.reminder?.dueAt}
      onClose={() => { setReminderOpen(false); requestAnimationFrame(() => reminderTrigger.current?.focus()); }}
      onSave={(dueAt) => { changeDraft({ ...draft, reminder: dueAt ? { dueAt, leadMinutes: parseInt(preferences.reminderLead) || 0 } : null }); }} />}
  </main>;
}
