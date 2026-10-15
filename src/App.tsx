import { useContextMenu, type ContextMenuItem } from "./components/context-menu/contextMenuState";
import { useWritingPreferences } from "./features/settings/writingPreferences";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { CreateFolderDialog } from "./components/dialogs/CreateFolderDialog";
import { EditorPane } from "./components/editor/EditorPane";
import { NotesPane } from "./components/notes/NotesPane";
import { Sidebar } from "./components/layout/Sidebar";
import { useNotes } from "./hooks/useNotes";
import { registerCaptureShortcut, useQuickCapture } from "./features/capture/captureBridge";
import { useReminders } from "./hooks/useReminders";
import { useDesktopNotifications, useNotificationActivation } from "./hooks/useDesktopNotifications";
import type { NotificationTarget } from "./features/notifications/desktopNotifications";
import { ReminderDialog } from "./components/reminders/ReminderDialog";
import { ReminderFeedback } from "./components/reminders/ReminderFeedback";
import { AppNotifications } from "./components/feedback/AppNotifications";
import { reminderPresetActionLabel, reminderPresetDate, useReminderShortcuts } from "./features/settings/reminderShortcuts";
import { formatReminderTime } from "./features/reminders/reminderTypes";
import { notesRepository } from "./features/notes/notesRepository";
import type { Note } from "./types/note";
import { SettingsPage } from "./components/settings/SettingsPage";
import { AuthPage } from "./components/auth/AuthPage";
import { AccountTermsPage } from "./components/auth/AccountTermsPage";
import { useCloudSyncPreference } from "./features/settings/cloudSyncPreference";
import { CloudSyncDialog } from "./components/settings/CloudSyncDialog";
import { PasswordRecoveryPage } from "./components/auth/PasswordRecoveryPage";
import { MfaChallengePage } from "./components/auth/MfaChallengePage";
import { CompleteProfile } from "./components/auth/CompleteProfile";
import { EditorSkeleton, LoadingSpinner, SyncFeedback } from "./components/feedback/LoadingFeedback";
import { useAuth } from "./hooks/useAuth";
import { profileFromUser } from "./features/auth/accountProfile";
import type { AccentColor } from "./features/settings/accentColors";
import { accentColors } from "./features/settings/accentColors";
import { TitleBar } from "./components/layout/TitleBar";
import { NewNoteComposer } from "./components/dialogs/NewNoteComposer";
import { TooltipLayer } from "./components/layout/TooltipLayer";
import {
  formatShortcut,
  getShortcutBindings,
  matchesShortcut,
  shortcutActions,
  type ShortcutBindings,
} from "./features/shortcuts/keyboardShortcuts";

type AppPage = "notes" | "preferences";

function App() {
  const auth = useAuth();
  const accountTerms = auth.accountTerms;
  const openContextMenu = useContextMenu();
  const [writingPreferences, updateWritingPreferences] = useWritingPreferences();
  const { defaultPreset } = useReminderShortcuts();
  const cloudSync = useCloudSyncPreference(auth.user?.id);
  const offlineMode = !cloudSync.enabled;
  const [syncConfirmation, setSyncConfirmation] = useState<{ userId: string; enabling: boolean } | null>(null);
  const notesUser = accountTerms.ready && !auth.mfa.loading && !auth.mfa.required && !auth.passwordRecoveryRequired ? auth.user : null;
  const notesState = useNotes(notesUser, auth.configured, offlineMode);
  const reminderState = useReminders(notesUser?.id ?? null, offlineMode);
  const syncStatus = notesState.syncStatus === "error" || reminderState.error ? "error"
    : notesState.syncStatus === "offline" ? "offline"
    : notesState.syncStatus === "syncing" || reminderState.syncing ? "syncing"
    : Object.keys(reminderState.pending).length ? "on-device" : notesState.syncStatus;
  const [reminderNoteId, setReminderNoteId] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const dismissReminderNotice = useCallback(() => setReminderNotice(null), []);
  const reminderNote = notesState.notes.find((note) => note.id === reminderNoteId && !note.deletedAt);
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem("scribe-theme") !== "light",
  );
  const [loadedProfile, setLoadedProfile] = useState<{ userId: string; name: string | null } | null>(null);
  const [fontFamily, setFontFamily] = useState(
    () => localStorage.getItem("scribe-font-family") ?? "DM Sans",
  );
  const [profileAvatarColor, setProfileAvatarColor] = useState(
    () => localStorage.getItem("scribe-profile-avatar") ?? "#8970ed",
  );
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [composerInitialFolderId, setComposerInitialFolderId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isComposerModalActive, setIsComposerModalActive] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("scribe-sidebar-collapsed") === "true",
  );
  const [page, setPage] = useState<AppPage>("notes");
  const [notificationTarget, setNotificationTarget] = useState<NotificationTarget | null>(null);
  useNotificationActivation(setNotificationTarget);
  const desktopNotifications = useDesktopNotifications({ userId: notesUser?.id ?? null, notes: notesState.notes, reminders: reminderState.reminders,
    ready: notesState.cacheReady && !reminderState.loading, desktop: writingPreferences.desktop,
    enabled: writingPreferences.reminders, sounds: writingPreferences.sounds,
    cloudSyncHealthy: !offlineMode && notesState.syncStatus === "synced" && !reminderState.loading && !reminderState.syncing && !reminderState.error && !Object.keys(reminderState.pending).length,
    cloudSyncError: offlineMode ? null : notesState.cloudSyncError ?? reminderState.cloudSyncError });
  const showNoteError = notesState.showError;
  const selectNoteSection = notesState.selectSection;
  const selectNoteId = notesState.setSelectedId;
  const clearNoteSearch = notesState.setSearch;
  useEffect(() => {
    if (!notificationTarget || !notesUser || !notesState.cacheReady) return;
    if (notificationTarget.userId !== notesUser.id) {
      showNoteError("This notification belongs to another account. Sign in to that account to open its note.");
      return;
    }
    const note = notificationTarget.noteId ? notesState.notes.find((item) => item.id === notificationTarget.noteId && !item.deletedAt) : null;
    if (notificationTarget.noteId && !note) {
      if (!notesState.cloudReady && navigator.onLine && !offlineMode) return;
      const frame = requestAnimationFrame(() => {
        showNoteError("This note is no longer available on this device, or it has been moved to Trash.");
        setNotificationTarget(null);
      });
      return () => cancelAnimationFrame(frame);
    }
    const frame = requestAnimationFrame(() => {
      setPage("notes"); clearNoteSearch(""); selectNoteSection(note?.isDraft ? "drafts" : "all");
      if (note) selectNoteId(note.id);
      window.dispatchEvent(new Event("scribe:minimize-note-draft"));
      setNotificationTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [notificationTarget, notesUser, notesState.cacheReady, notesState.cloudReady, notesState.notes, offlineMode,
    showNoteError, selectNoteSection, selectNoteId, clearNoteSearch]);
  const [shortcuts, setShortcuts] =
    useState<ShortcutBindings>(getShortcutBindings);
  useQuickCapture(notesUser?.id ?? null, shortcuts.quickCapture, writingPreferences.quickCapture, showNoteError);
  const [accent, setAccent] = useState<AccentColor>(
    () => (localStorage.getItem("scribe-accent") as AccentColor) || "violet",
  );

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<boolean>("get_autostart_enabled")
      .then((enabled) => {
        if (active) updateWritingPreferences({ launch: enabled });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [updateWritingPreferences]);

  const changeLaunchAtStartup = useCallback(async (enabled: boolean) => {
    if (!isTauri()) return "Launch at startup is available in the installed Windows app.";
    try {
      await invoke("set_autostart_enabled", { enabled });
      return null;
    } catch {
      return "Windows could not update the startup setting. Please try again.";
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!notesUser || !auth.configured)
      return () => {
        active = false;
      };
    if (offlineMode || !navigator.onLine)
      return () => {
        active = false;
      };
    void notesRepository
      .loadProfileName(notesUser)
      .then((name) => {
        if (!active) return;
        setLoadedProfile({ userId: notesUser.id, name });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [notesUser, auth.configured, offlineMode]);

  const authenticatedUserId = auth.user?.id;
  const refreshLinkedAccounts = auth.refreshLinkedAccounts;
  useEffect(() => {
    if (page === "preferences" && authenticatedUserId) void refreshLinkedAccounts();
  }, [page, authenticatedUserId, refreshLinkedAccounts]);

  useEffect(() => {
    document.documentElement.style.setProperty("--note-font-family", ({ "DM Sans": '"DM Sans", sans-serif', "System default": "system-ui, sans-serif", Georgia: "Georgia, serif", Monospace: "monospace" } as Record<string, string>)[fontFamily] ?? '"DM Sans", sans-serif');
    document.documentElement.style.setProperty("--note-text-size", ({ Small: "12px", Medium: "13px", Large: "16px" } as Record<string, string>)[writingPreferences.size] ?? "13px");
  }, [writingPreferences.size, fontFamily]);

  const storageMetrics = (() => {
    const bytes = (value: unknown) =>
      new TextEncoder().encode(JSON.stringify(value)).length;
    const settingsBytes = [
      "scribe-writing-preferences",
      "scribe-font-family",
      "scribe-accent",
      "scribe-profile-avatar",
      "scribe-keyboard-shortcuts",
      "scribe-sidebar-collapsed",
      "scribe-note-sort",
      "scribe-reminder-shortcuts",
    ].reduce(
      (total, key) =>
        total +
        new TextEncoder().encode(localStorage.getItem(key) ?? "").length,
      0,
    );
    return {
      noteCount: notesState.notes.length,
      folderCount: notesState.folders.length,
      noteBytes: bytes(notesState.notes),
      folderBytes: bytes(notesState.folders),
      settingsBytes,
    };
  })();

  const changeAccent = (value: AccentColor) => {
    setAccent(value);
    localStorage.setItem("scribe-accent", value);
  };

  const changeTheme = (dark: boolean) => {
    setIsDark(dark);
    localStorage.setItem("scribe-theme", dark ? "dark" : "light");
  };

  const changeFontFamily = (value: string) => {
    setFontFamily(value);
    localStorage.setItem("scribe-font-family", value);
  };

  const changeProfileAvatarColor = (value: string) => {
    setProfileAvatarColor(value);
    localStorage.setItem("scribe-profile-avatar", value);
  };

  const updateDisplayName = async (value: string) => {
    const error = await auth.completeDisplayName(value);
    if (!error && auth.user) setLoadedProfile({ userId: auth.user.id, name: value.trim() });
    return error;
  };

  const changeOfflineMode = (enabled: boolean) => {
    if (auth.user && enabled !== offlineMode) setSyncConfirmation({ userId: auth.user.id, enabling: !enabled });
  };
  const cloudSyncDialog = syncConfirmation && syncConfirmation.userId === auth.user?.id
    ? <CloudSyncDialog key={`${syncConfirmation.userId}:${syncConfirmation.enabling}`} enabling={syncConfirmation.enabling}
      onClose={() => setSyncConfirmation(null)} onConfirm={() => { cloudSync.setEnabled(syncConfirmation.enabling); setSyncConfirmation(null); }} /> : null;

  const fallbackProfile = auth.user
    ? profileFromUser(auth.user)
    : { displayName: "Scribe user", email: "" };
  const accountProfile = {
    ...fallbackProfile,
    avatarColor: profileAvatarColor,
    deviceInventory: auth.deviceInventory,
    displayName: (loadedProfile?.userId === auth.user?.id ? loadedProfile?.name : null) ?? fallbackProfile.displayName,
    linkedAccounts: auth.linkedAccounts,
    linkedIdentityCount: auth.linkedIdentityCount,
    linkedAccountsLoaded: auth.linkedAccountsLoaded,
    linkedAccountsError: auth.linkedAccountsError,
  };

  const changeShortcuts = async (value: ShortcutBindings) => {
    const globalChanged = value.quickCapture.key !== shortcuts.quickCapture.key || value.quickCapture.shift !== shortcuts.quickCapture.shift;
    if (globalChanged) await registerCaptureShortcut(value.quickCapture);
    try { localStorage.setItem("scribe-keyboard-shortcuts", JSON.stringify(value)); }
    catch {
      if (globalChanged) await registerCaptureShortcut(shortcuts.quickCapture).catch(() => undefined);
      throw "Could not save shortcuts on this device. Check local storage and try again.";
    }
    setShortcuts(value);
  };

  const toggleSidebar = useCallback(() => {
    const nextCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(nextCollapsed);
    localStorage.setItem("scribe-sidebar-collapsed", String(nextCollapsed));
  }, [sidebarCollapsed]);

  const openNewNote = useCallback(() => {
    if (isComposerOpen) {
      window.dispatchEvent(new Event("scribe:restore-note-draft"));
    } else {
      setComposerInitialFolderId(null);
      setIsComposerOpen(true);
      setIsComposerModalActive(true);
    }
  }, [isComposerOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        !notesUser ||
        page !== "notes" ||
        isComposerModalActive ||
        event.defaultPrevented ||
        event.isComposing
      )
        return;
      const action = shortcutActions.find((item) =>
        item.id !== "quickCapture" && matchesShortcut(event, shortcuts[item.id]),
      );
      if (!action) return;
      event.preventDefault();
      switch (action.id) {
        case "toggleEditMode":
          if (notesState.selectedNote && !notesState.selectedNote.deletedAt && !document.querySelector('[role="dialog"][aria-modal="true"]'))
            window.dispatchEvent(new Event("scribe:toggle-note-mode"));
          break;
        case "newNote":
          openNewNote();
          break;
        case "search":
          window.dispatchEvent(new Event("scribe:focus-notes-search"));
          break;
        case "allNotes":
          notesState.selectSection("all");
          break;
        case "pinnedNotes":
          notesState.selectSection("pinned");
          break;
        case "drafts":
          notesState.selectSection("drafts");
          break;
        case "trash":
          notesState.selectSection("trash");
          break;
        case "toggleSidebar":
          toggleSidebar();
          break;
        case "togglePin":
          if (notesState.selectedNote)
            notesState.togglePinned(notesState.selectedNote.id);
          break;
        case "openSettings":
          setPage("preferences");
          break;
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    isComposerModalActive,
    notesUser,
    notesState,
    openNewNote,
    page,
    shortcuts,
    toggleSidebar,
  ]);

  const handleDeleteNote = (note: Note) => {
    if (note.deletedAt) {
      if (reminderState.reminders[note.id]?.dueAt) {
        void reminderState.save(note.id, null).then((error) => { if (error) notesState.showError(error); });
      }
      notesState.permanentlyDelete(note.id);
    } else {
      notesState.moveToTrash(note.id);
    }
    notesState.setSelectedId(null);
  };
  const handleRestoreNote = (id: string) => {
    notesState.restoreFromTrash(id);
    notesState.selectSection("all");
    notesState.setSelectedId(id);
  };

  if (auth.loading || (auth.user && auth.mfa.loading))
    return (
      <div className={`desktop-frame ${isDark ? "theme-dark" : "theme-light"}`}>
        <TitleBar
          dark={isDark}
          onToggleTheme={() => setIsDark((value) => !value)}
        />
        <main
          className="auth-screen auth-loading"
          aria-label="Restoring session"
        >
          <LoadingSpinner />
          <span>Restoring your session…</span>
        </main>
      </div>
    );

  if (!auth.user)
    return (
      <div
        className={`desktop-frame ${isDark ? "theme-dark" : "theme-light"}`}
        style={
          {
            "--accent": accentColors.violet.color,
            "--accent-soft": `color-mix(in srgb, ${accentColors.violet.color} 18%, transparent)`,
          } as React.CSSProperties
        }
      >
        <TitleBar dark={isDark} onToggleTheme={() => changeTheme(!isDark)} />
        <AuthPage
          configured={auth.configured}
          onSignIn={auth.signInWithPassword}
          onSignUp={auth.signUpWithPassword}
          callbackError={auth.authCallbackError}
          notice={auth.authNotice}
          onAuthenticated={() => setPage("notes")}
          onProviderSignIn={auth.signInWithProvider}
          oauthPending={auth.oauthPending}
          onCancelProviderSignIn={auth.cancelProviderSignIn}
          onRequestPasswordReset={auth.requestPasswordReset}
        />
      </div>
    );
  if (auth.mfa.required)
    return (
      <div className={`desktop-frame ${isDark ? "theme-dark" : "theme-light"}`}>
        <TitleBar dark={isDark} onToggleTheme={() => changeTheme(!isDark)} />
        <MfaChallengePage mfa={auth.mfa} onSignOut={auth.signOut} />
      </div>
    );
  if (auth.passwordRecoveryRequired)
    return (
      <div className={`desktop-frame ${isDark ? "theme-dark" : "theme-light"}`}>
        <TitleBar dark={isDark} onToggleTheme={() => changeTheme(!isDark)} />
        <PasswordRecoveryPage
          onUpdatePassword={auth.updateRecoveredPassword}
          onContinue={() => {
            auth.finishPasswordRecovery();
            setPage("notes");
          }}
        />
      </div>
    );
  if (!accountTerms.ready)
    return <div className={`desktop-frame ${isDark ? "theme-dark" : "theme-light"}`}>
      <TitleBar dark={isDark} onToggleTheme={() => changeTheme(!isDark)} />
      <AccountTermsPage key={auth.user.id} terms={accountTerms} onSignOut={auth.signOut} />
    </div>;
  if (auth.needsDisplayName)
    return (
      <div className={`desktop-frame ${isDark ? "theme-dark" : "theme-light"}`}>
        <TitleBar dark={isDark} onToggleTheme={() => changeTheme(!isDark)} />
        <CompleteProfile onSave={auth.completeDisplayName} onSignOut={auth.signOut} />
      </div>
    );
  if (page === "preferences")
    return (
      <div
        className={`desktop-frame ${isDark ? "theme-dark" : "theme-light"}`}
        style={
          { "--accent": accentColors[accent].color } as React.CSSProperties
        }
      >
        <TitleBar
          dark={isDark}
          onToggleTheme={() => setIsDark((value) => !value)}
          syncStatus={syncStatus}
        />
        {cloudSyncDialog}
        <SettingsPage
          dark={isDark}
          accent={accent}
          onAccentChange={changeAccent}
          onToggleTheme={changeTheme}
          fontFamily={fontFamily}
          onFontFamilyChange={changeFontFamily}
          onClose={() => setPage("notes")}
          shortcuts={shortcuts}
          onShortcutsChange={changeShortcuts}
          offlineMode={offlineMode}
          onOfflineModeChange={changeOfflineMode}
          storageMetrics={storageMetrics}
          profile={accountProfile}
          onAvatarColorChange={changeProfileAvatarColor}
          onUpdateDisplayName={updateDisplayName}
          onLinkAccount={auth.linkAccount}
          onUnlinkAccount={auth.unlinkAccount}
          onRequestPasswordReset={auth.requestPasswordReset}
          mfa={auth.mfa}
          onLaunchAtStartupChange={changeLaunchAtStartup}
          folders={notesState.folders}
          unfiledPosition={notesState.unfiledPosition}
          notes={notesState.notes}
          onCreateFolder={notesState.createFolder}
          onEditFolder={notesState.updateFolder}
          onDeleteFolder={notesState.deleteFolder}
          onMoveFolder={notesState.moveFolder}
          onMoveSystemFolder={(offset) =>
            notesState.moveFolder("system:unfiled", offset)
          }
        />
        <SyncFeedback error={notesState.error} syncing={notesState.syncStatus === "syncing"} loading={notesState.loading} onDismiss={notesState.clearError} />
      </div>
    );

  return (
    <main
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, [contenteditable=true]") || window.getSelection()?.toString()) return;
        const noteId = target.closest<HTMLElement>("[data-context-note]")?.dataset.contextNote;
        const folderId = target.closest<HTMLElement>("[data-context-folder]")?.dataset.contextFolder;
        const note = notesState.notes.find((item) => item.id === noteId);
        let items: ContextMenuItem[] = [];
        if (note) {
          items = [
            ...(!target.closest(".editor-pane") ? [{ label: "Open Note", action: () => notesState.setSelectedId(note.id) }] : []),
            { label: "Copy Markdown", action: () => navigator.clipboard.writeText(note.body) },
          ];
          if (note.deletedAt) items.push(
            { label: "Restore Note", separator: true, action: () => handleRestoreNote(note.id) },
            { label: "Delete permanently", danger: true, action: () => handleDeleteNote(note) },
          );
          else {
            items.push({ label: note.pinned ? "Unpin Note" : "Pin Note", action: () => notesState.togglePinned(note.id) });
            items.push({ label: reminderState.reminders[note.id]?.dueAt ? "Edit reminder" : "Set reminder", disabled: reminderState.loading, action: () => setReminderNoteId(note.id) });
            items.push({ label: reminderPresetActionLabel(defaultPreset),
              disabled: reminderState.loading, action: async () => {
                const dueAt = reminderPresetDate(defaultPreset).toISOString();
                const error = await reminderState.save(note.id, dueAt, Number.parseInt(writingPreferences.reminderLead, 10) || 0);
                if (error) notesState.showError(error); else setReminderNotice(`Reminder set for ${formatReminderTime(dueAt)}.`);
              } });
            if (reminderState.reminders[note.id]?.dueAt) items.push({ label: "Remove reminder", action: async () => {
              const error = await reminderState.save(note.id, null);
              if (error) notesState.showError(error); else setReminderNotice("Reminder removed. Saved locally.");
            } });
            if (note.isDraft) items.push({ label: "Save draft", action: () => notesState.updateNote(note.id, { isDraft: false }) });
            items.push({ label: "Move to Unfiled", separator: true, disabled: note.folderId === null, action: () => notesState.updateNote(note.id, { folderId: null }) });
            notesState.folders.forEach((folder) => items.push({ label: `Move to ${folder.name}`, disabled: note.folderId === folder.id, action: () => notesState.updateNote(note.id, { folderId: folder.id }) }));
            items.push({ label: "Move to trash", separator: true, danger: true, action: () => handleDeleteNote(note) });
          }
        } else if (folderId) {
          const index = notesState.folders.findIndex((folder) => folder.id === folderId);
          items = [
            { label: "Open folder", action: () => notesState.selectFolder(folderId) },
            { label: "New note in folder", action: () => {
              const destination = folderId === "system:unfiled" ? null : folderId;
              if (isComposerOpen) {
                window.dispatchEvent(new CustomEvent("scribe:restore-note-draft", { detail: { folderId: destination } }));
              } else {
                setComposerInitialFolderId(destination);
                setIsComposerOpen(true);
                setIsComposerModalActive(true);
              }
            } },
            ...(index >= 0 ? [{ label: "Edit folder", action: () => setEditingFolderId(folderId) }] : []),
            { label: "Create folder", action: () => setIsCreateFolderOpen(true) },
            { label: "Move up", separator: true, disabled: folderId === "system:unfiled" ? notesState.unfiledPosition === 0 : index === 0, action: () => notesState.moveFolder(folderId, -1) },
            { label: "Move down", disabled: folderId === "system:unfiled" ? notesState.unfiledPosition === notesState.folders.length : index === notesState.folders.length - 1, action: () => notesState.moveFolder(folderId, 1) },
          ];
        } else if (target.closest(".notes-pane") && !isComposerModalActive) items = [{ label: "New Note", action: openNewNote }];
        if (items.length) { event.preventDefault(); event.stopPropagation(); openContextMenu(event.clientX, event.clientY, items, target.closest<HTMLElement>("[data-context-note], [data-context-folder]") ?? target); }
      }}
      className={`app-shell ${isDark ? "theme-dark" : "theme-light"} accent-${accent}`}
      style={
        {
          "--accent": accentColors[accent].color,
          "--accent-soft": `color-mix(in srgb, ${accentColors[accent].color} 18%, transparent)`,
        } as React.CSSProperties
      }
    >
      <TooltipLayer />
      {cloudSyncDialog}
      <TitleBar
        dark={isDark}
        onToggleTheme={() => changeTheme(!isDark)}
        onOpenSettings={() => setPage("preferences")}
        inert={isComposerModalActive}
        settingsShortcut={formatShortcut(shortcuts.openSettings)}
        syncStatus={syncStatus}
        offlineMode={offlineMode}
        onToggleOfflineMode={() => changeOfflineMode(!offlineMode)}
      />
      <div
        className={`app-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
        inert={isComposerModalActive}
      >
        <Sidebar
          section={notesState.section}
          folder={notesState.folder}
          folderId={notesState.folderId}
          folders={notesState.folders}
          unfiledPosition={notesState.unfiledPosition}
          folderCounts={notesState.folders.reduce<Record<string, number>>(
            (counts, folder) => {
              counts[folder.id] = notesState.notes.filter(
                (note) => !note.deletedAt && note.folderId === folder.id,
              ).length;
              return counts;
            },
            {},
          )}
          noteCount={notesState.notes.filter((note) => !note.deletedAt).length}
          unfiledCount={
            notesState.notes.filter(
              (note) => !note.deletedAt && note.folderId === null,
            ).length
          }
          draftCount={
            notesState.notes.filter((note) => !note.deletedAt && note.isDraft)
              .length
          }
          search={notesState.search}
          onSearchChange={notesState.setSearch}
          onSelectSection={notesState.selectSection}
          onSelectFolder={notesState.selectFolder}
          onReorderFolders={notesState.reorderFolders}
          onCreateFolder={() => setIsCreateFolderOpen(true)}
          onOpenPreferences={() => setPage("preferences")}
          onLogout={async () => {
            await auth.signOut();
            notesState.clearUserData();
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          shortcuts={shortcuts}
          profile={accountProfile}
        />
        <NotesPane
          reminders={reminderState.reminders}
          onEditReminder={setReminderNoteId}
          notes={notesState.visibleNotes}
          folders={notesState.folders}
          selectedId={notesState.selectedId}
          section={notesState.section}
          folder={notesState.folder}
          search={notesState.search}
          onSaveDraft={(id) => notesState.updateNote(id, { isDraft: false })}
          onSelectNote={notesState.setSelectedId}
          onTogglePinned={notesState.togglePinned}
          onCreateNote={openNewNote}
          shortcuts={shortcuts}
          syncStatus={syncStatus}
          sortOrder={notesState.sortOrder}
          onSortChange={notesState.setSortOrder}
          loading={notesState.loading && notesState.notes.length === 0}
        />
        {notesState.loading && notesState.notes.length === 0 ? <EditorSkeleton /> : <EditorPane
          key={notesState.selectedNote?.id ?? "empty"}
          reminder={notesState.selectedId ? reminderState.reminders[notesState.selectedId] : undefined}
          onSetReminder={() => setReminderNoteId(notesState.selectedId)}
          note={notesState.selectedNote}
          folders={notesState.folders}
          onMoveToFolder={(noteId, folderId) =>
            notesState.updateNote(noteId, { folderId })
          }
          onCreateFolder={() => setIsCreateFolderOpen(true)}
          onRestoreNote={handleRestoreNote}
          isTrash={notesState.section === "trash"}
          deleteLabel={
            notesState.section === "trash"
              ? "Delete permanently"
              : "Move to trash"
          }
          onCreateNote={openNewNote}
          onUpdateNote={notesState.updateNote}
          onDeleteNote={handleDeleteNote}
          pinShortcut={formatShortcut(shortcuts.togglePin)}
          newNoteShortcut={formatShortcut(shortcuts.newNote)}
          editModeShortcut={formatShortcut(shortcuts.toggleEditMode)}
        />}
      </div>
      {isCreateFolderOpen && (
        <CreateFolderDialog
          onClose={() => setIsCreateFolderOpen(false)}
          onCreate={notesState.createFolder}
        />
      )}
      {editingFolderId && notesState.folders.some((folder) => folder.id === editingFolderId) && (
        <CreateFolderDialog
          key={editingFolderId}
          folder={notesState.folders.find((folder) => folder.id === editingFolderId)}
          onClose={() => setEditingFolderId(null)}
          onCreate={notesState.createFolder}
          onEdit={notesState.updateFolder}
        />
      )}
      {isComposerOpen && (
        <NewNoteComposer
          folders={notesState.folders}
          initialFolderId={composerInitialFolderId}
          onSave={(draft) => {
            notesState.createNote(draft);
            setIsComposerOpen(false);
            setIsComposerModalActive(false);
          }}
          onDiscard={(draft) => {
            notesState.createNote({ ...draft, isDraft: true });
          }}
          onClose={() => {
            setIsComposerOpen(false);
            setIsComposerModalActive(false);
          }}
          onModalActiveChange={setIsComposerModalActive}
        />
      )}
      {reminderNote && !reminderState.loading && <ReminderDialog
        key={reminderNote.id}
        reminder={reminderState.reminders[reminderNote.id]}
        defaultLead={Number.parseInt(writingPreferences.reminderLead, 10) || 0}
        pending={Boolean(reminderState.pending[reminderNote.id])}
        offline={offlineMode || !navigator.onLine}
        cloudError={reminderState.error}
        onSave={async (dueAt, leadMinutes) => {
          const error = await reminderState.save(reminderNote.id, dueAt, leadMinutes);
          if (!error) setReminderNotice(dueAt ? "Reminder saved on this device." : "Reminder removed. Saved locally.");
          return error;
        }}
        onClose={() => setReminderNoteId(null)}
      />}
      <AppNotifications alerts={desktopNotifications.alerts} onDismiss={desktopNotifications.dismiss} onOpen={setNotificationTarget} />
      {reminderNotice && !notesState.error && !reminderState.error && !desktopNotifications.error && <ReminderFeedback key={reminderNotice} message={reminderNotice} onDismiss={dismissReminderNotice} />}
      <SyncFeedback error={notesState.error ?? reminderState.error ?? desktopNotifications.error} syncing={notesState.syncStatus === "syncing"} loading={notesState.loading} onDismiss={() => { notesState.clearError(); reminderState.clearError(); desktopNotifications.clearError(); }} />
    </main>
  );
}

export default App;
