import { usePendingDataDeletion, type DataDeletionTarget } from "./features/auth/dataDeletionState";
import { prepareCloudReconnect } from "./features/settings/cloudGeneration";
import type { TransferTarget } from "./features/transfer/transferTypes";
import { DeleteAccountDialog } from "./components/settings/DeleteAccountDialog";
import { usePendingAccountDeletion, type AccountDeletionTarget } from "./features/auth/onlineAccountDeletion";
import { DeleteOfflineProfileDialog } from "./components/settings/DeleteOfflineProfileDialog";
import { useWorkspaceDeletionStatus } from "./features/auth/workspaceDeletionState";
import { useContextMenu, type ContextMenuItem } from "./components/context-menu/contextMenuState";
import { useWritingPreferences } from "./features/settings/writingPreferences";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { isCloudSyncEnabled, useCloudSyncPreference } from "./features/settings/cloudSyncPreference";
import { CloudSyncDialog } from "./components/settings/CloudSyncDialog";
import { useLocalProfile } from "./features/auth/localProfile";
import { LocalProfilePage } from "./components/auth/LocalProfilePage";
import { readWorkspacePreference, useWorkspaceId, useWorkspacePreference } from "./features/settings/workspacePreferences";
import { WorkspacePreferencesProvider } from "./features/settings/WorkspacePreferencesProvider";
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
import { UpdateHost } from "./components/updates/UpdateHost";
import { registerUpdateGuard } from "./features/updates/installSafety";
import { waitForWorkspaceWrites } from "./features/transfer/localWriteBarrier";
import { TooltipLayer } from "./components/layout/TooltipLayer";
import {
  formatShortcut,
  parseShortcutBindings,
  serializeShortcutBindings,
  matchesShortcut,
  shortcutActions,
  type ShortcutBindings,
} from "./features/shortcuts/keyboardShortcuts";

const DeleteDataDialog = lazy(() => import("./components/settings/DeleteDataDialog").then(module => ({ default: module.DeleteDataDialog })));
const DataTransferDialog = lazy(() => import("./components/settings/transfer/DataTransferDialog").then(module => ({ default: module.DataTransferDialog })));

type AppPage = "notes" | "preferences";

function App() {
  const auth = useAuth();
  const local = useLocalProfile();
  const [accountEntry, setAccountEntry] = useState(false);
  const [localSetup, setLocalSetup] = useState(false);
  const [deleteProfileOpen, setDeleteProfileOpen] = useState(false);
  const [transfer, setTransfer] = useState<(TransferTarget & { returnTo?: "offline" | "online" | "data"; dataTarget?: DataDeletionTarget; account?: AccountDeletionTarget }) | null>(null);
  const [dataTarget, setDataTarget] = useState<DataDeletionTarget | null>(null);
  const dataPending = usePendingDataDeletion();
  const activeDataTarget = dataPending?.target ?? dataTarget;
  const deletionStatus = useWorkspaceDeletionStatus(local.profile?.id ?? null);
  const onlinePending = usePendingAccountDeletion();
  const [onlineTarget, setOnlineTarget] = useState<AccountDeletionTarget | null>(null);
  const onlineStatus = useWorkspaceDeletionStatus(auth.user?.id ?? onlinePending?.userId ?? null);
  const workspaceBlocked = Boolean(dataPending || (auth.user ? onlineStatus : deletionStatus) || (onlinePending && (!auth.user || auth.user.id === onlinePending.userId)));
  const deleteTarget = onlineTarget ?? (onlinePending ? { id: onlinePending.userId, email: auth.user?.id === onlinePending.userId ? auth.user.email ?? "" : "", displayName: "your account" } : null);
  const workspaceId = auth.loading ? null : auth.user?.id ?? onlinePending?.userId ?? (accountEntry ? null : local.profile?.id ?? null);
  const activeTransfer = transfer?.id === workspaceId && !workspaceBlocked ? transfer : null;
  const updateOperationBlocked = workspaceBlocked || deleteProfileOpen || Boolean(deleteTarget) || Boolean(activeDataTarget) || Boolean(activeTransfer) || auth.loading;
  useEffect(() => registerUpdateGuard(() => {
    if (updateOperationBlocked) {
      throw new Error("Finish the current account or data operation, then retry installing from About.");
    }
  }), [updateOperationBlocked]);
  return <WorkspacePreferencesProvider workspaceId={workspaceId}><WorkspaceApp auth={auth} local={local} accountEntry={accountEntry} setAccountEntry={setAccountEntry} localSetup={localSetup} setLocalSetup={setLocalSetup} workspaceDeletionBlocked={workspaceBlocked} capturePaused={deleteProfileOpen || Boolean(deleteTarget) || Boolean(activeTransfer) || Boolean(activeDataTarget)} onDeleteData={target => setDataTarget(target)} onOpenTransfer={target => setTransfer(target)} onlineDeletionPending={Boolean(onlinePending)} onDeleteOfflineProfile={() => setDeleteProfileOpen(true)} onDeleteAccount={() => {
    if (auth.user) { setAccountEntry(true); setOnlineTarget({ id: auth.user.id, email: auth.user.email ?? "", displayName: profileFromUser(auth.user).displayName }); }
  }} />
    {!dataPending && !activeDataTarget && !activeTransfer && !deleteTarget && !auth.loading && !auth.user && local.profile && (deleteProfileOpen || deletionStatus) && <DeleteOfflineProfileDialog
      key={local.profile.id} profile={local.profile} interrupted={Boolean(deletionStatus)} onExport={() => {
        if (deletionStatus || !local.profile) return;
        setDeleteProfileOpen(false); setTransfer({ id: local.profile.id, displayName: local.profile.displayName, localOnly: true, cloudSync: false, mode: "export", returnTo: "offline" });
      }} onClose={() => setDeleteProfileOpen(false)}
      onDeleted={() => { setDeleteProfileOpen(false); setLocalSetup(false); setAccountEntry(true); }} />}
    {!dataPending && !activeDataTarget && !activeTransfer && !auth.loading && deleteTarget && <DeleteAccountDialog key={deleteTarget.id} account={deleteTarget} pending={onlinePending} currentUserId={auth.user?.id} onExport={() => {
      if (onlinePending || auth.user?.id !== deleteTarget.id) return;
      setOnlineTarget(null); setTransfer({ id: deleteTarget.id, displayName: deleteTarget.displayName, localOnly: false, cloudSync: isCloudSyncEnabled(deleteTarget.id), mode: "export", returnTo: "online", account: deleteTarget });
    }} onSignOutCurrent={auth.signOut} onClose={() => setOnlineTarget(null)}
      onDeleted={() => { setOnlineTarget(null); setAccountEntry(true); setLocalSetup(false); }} onFinish={auth.finishDeletedAccount} onPasswordReset={auth.requestPasswordReset} />}
    {!activeTransfer && !auth.loading && activeDataTarget && <Suspense fallback={null}><DeleteDataDialog key={activeDataTarget.id} target={activeDataTarget} pending={dataPending} onClose={() => setDataTarget(null)} onPasswordReset={auth.requestPasswordReset} onExport={() => {
      if (dataPending) return;
      setDataTarget(null); setTransfer({ id: activeDataTarget.id, displayName: activeDataTarget.displayName, localOnly: activeDataTarget.localOnly, cloudSync: !activeDataTarget.localOnly && isCloudSyncEnabled(activeDataTarget.id), mode: "export", returnTo: "data", dataTarget: activeDataTarget });
    }}/></Suspense>}
    {activeTransfer && <Suspense fallback={null}><DataTransferDialog key={`${activeTransfer.id}:${activeTransfer.mode}`} target={activeTransfer} returnToDeletion={Boolean(activeTransfer.returnTo)} onClose={() => {
      setTransfer(null);
      if (activeTransfer.returnTo === "data" && activeTransfer.dataTarget) setDataTarget(activeTransfer.dataTarget);
      if (activeTransfer.returnTo === "offline" && !auth.user && local.profile?.id === activeTransfer.id) setDeleteProfileOpen(true);
      if (activeTransfer.returnTo === "online" && auth.user?.id === activeTransfer.id && activeTransfer.account) setOnlineTarget(activeTransfer.account);
    }} /></Suspense>}
    <UpdateHost localOnly={!auth.user} blocked={workspaceBlocked || deleteProfileOpen || Boolean(deleteTarget) || Boolean(activeDataTarget) || Boolean(activeTransfer)} />
  </WorkspacePreferencesProvider>;
}

function WorkspaceApp({ auth, local, accountEntry, setAccountEntry, localSetup, setLocalSetup, workspaceDeletionBlocked, capturePaused, onlineDeletionPending, onDeleteOfflineProfile, onDeleteAccount, onOpenTransfer, onDeleteData }: {
  auth: ReturnType<typeof useAuth>; local: ReturnType<typeof useLocalProfile>;
  workspaceDeletionBlocked: boolean; capturePaused: boolean; onlineDeletionPending: boolean; onDeleteOfflineProfile: () => void; onDeleteAccount: () => void; onOpenTransfer: (target: TransferTarget) => void; onDeleteData: (target: DataDeletionTarget) => void;
  accountEntry: boolean; setAccountEntry: (value: boolean) => void;
  localSetup: boolean; setLocalSetup: (value: boolean) => void;
}) {
  const preferenceWorkspaceId = useWorkspaceId();
  const usingLocalProfile = !auth.user && Boolean(local.profile) && !accountEntry && !onlineDeletionPending;
  const accountTerms = auth.accountTerms;
  const openContextMenu = useContextMenu();
  const [writingPreferences] = useWritingPreferences();
  const { defaultPreset } = useReminderShortcuts();
  const cloudSync = useCloudSyncPreference(auth.user?.id);
  const offlineMode = !cloudSync.enabled;
  const [syncConfirmation, setSyncConfirmation] = useState<{ userId: string; enabling: boolean } | null>(null);
  const localWorkspaceId = usingLocalProfile ? local.profile?.id : undefined;
  const notesUser = useMemo(() => auth.loading || workspaceDeletionBlocked ? null : auth.user
    ? accountTerms.ready && !auth.mfa.loading && !auth.mfa.required && !auth.passwordRecoveryRequired ? auth.user : null
    : localWorkspaceId ? { id: localWorkspaceId } : null,
  [auth.loading, auth.user, accountTerms.ready, auth.mfa.loading, auth.mfa.required, auth.passwordRecoveryRequired, localWorkspaceId, workspaceDeletionBlocked]);
  const notesState = useNotes(notesUser, Boolean(notesUser), offlineMode);
  const reminderState = useReminders(notesUser?.id ?? null, offlineMode);
  const syncStatus = notesState.syncStatus === "error" || reminderState.error ? "error"
    : notesState.syncStatus === "offline" ? "offline"
    : notesState.syncStatus === "syncing" || reminderState.syncing ? "syncing"
    : Object.keys(reminderState.pending).length ? "on-device" : notesState.syncStatus;
  const [reminderNoteId, setReminderNoteId] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const dismissReminderNotice = useCallback(() => setReminderNotice(null), []);
  const reminderNote = notesState.notes.find((note) => note.id === reminderNoteId && !note.deletedAt);
  const [themePreference, saveTheme] = useWorkspacePreference("scribe-theme");
  const isDark = themePreference !== "light";
  const [loadedProfile, setLoadedProfile] = useState<{ userId: string; name: string | null } | null>(null);
  const [fontPreference, saveFontFamily] = useWorkspacePreference("scribe-font-family");
  const fontFamily = fontPreference ?? "DM Sans";
  const [avatarPreference, saveAvatarColor] = useWorkspacePreference("scribe-profile-avatar");
  const profileAvatarColor = avatarPreference ?? "#8970ed";
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [composerInitialFolderId, setComposerInitialFolderId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isComposerModalActive, setIsComposerModalActive] = useState(false);
  const [sidebarPreference, saveSidebarCollapsed] = useWorkspacePreference("scribe-sidebar-collapsed");
  const sidebarCollapsed = sidebarPreference === "true";
  const [page, setPage] = useState<AppPage>("notes");
  const [settingsInitialCategory, setSettingsInitialCategory] = useState("general");
  useEffect(() => registerUpdateGuard(async () => {
    if (isComposerOpen) throw new Error("Save or close your new-note draft, then install the update from About.");
    if (reminderNoteId || isCreateFolderOpen || editingFolderId) throw new Error("Finish the open reminder or folder dialog, then install the update from About.");
    if (notesUser) await waitForWorkspaceWrites(notesUser.id);
  }), [isComposerOpen, reminderNoteId, isCreateFolderOpen, editingFolderId, notesUser]);
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
  const [shortcutPreference, saveShortcuts] = useWorkspacePreference("scribe-keyboard-shortcuts");
  const shortcuts = useMemo(() => parseShortcutBindings(shortcutPreference), [shortcutPreference]);
  useQuickCapture(notesUser?.id ?? null, shortcuts.quickCapture, Boolean(notesUser) && writingPreferences.quickCapture && !capturePaused, showNoteError);
  const [accentPreference, saveAccent] = useWorkspacePreference("scribe-accent");
  const accent: AccentColor = accentPreference && accentPreference in accentColors ? accentPreference as AccentColor : "violet";

  useEffect(() => {
    if (!isTauri() || !preferenceWorkspaceId || workspaceDeletionBlocked) return;
    let active = true;
    void invoke("set_autostart_enabled", { enabled: writingPreferences.launch })
      .catch(() => { if (active) showNoteError("Could not apply this workspace’s startup preference. Try changing it in Settings."); });
    return () => {
      active = false;
    };
  }, [preferenceWorkspaceId, writingPreferences.launch, showNoteError, workspaceDeletionBlocked]);

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
    if (!auth.user || !notesUser || !auth.configured)
      return () => {
        active = false;
      };
    if (offlineMode || !navigator.onLine)
      return () => {
        active = false;
      };
    void notesRepository
      .loadProfileName(auth.user)
      .then((name) => {
        if (!active) return;
        setLoadedProfile({ userId: notesUser.id, name });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [auth.user, notesUser, auth.configured, offlineMode]);

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
        new TextEncoder().encode(readWorkspacePreference(preferenceWorkspaceId, key) ?? "").length,
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
    saveAccent(value);
  };

  const changeTheme = (dark: boolean) => {
    saveTheme(dark ? "dark" : "light");
  };

  const changeFontFamily = (value: string) => {
    saveFontFamily(value);
  };

  const changeProfileAvatarColor = (value: string) => {
    if (usingLocalProfile && local.profile) {
      const error = local.save(local.profile.displayName, value);
      if (error) notesState.showError(error);
      return;
    }
    saveAvatarColor(value);
  };

  const updateDisplayName = async (value: string) => {
    if (usingLocalProfile) return local.save(value);
    const error = await auth.completeDisplayName(value);
    if (!error && auth.user) setLoadedProfile({ userId: auth.user.id, name: value.trim() });
    return error;
  };

  const changeOfflineMode = (enabled: boolean) => {
    if (auth.user && enabled !== offlineMode) setSyncConfirmation({ userId: auth.user.id, enabling: !enabled });
  };
  const cloudSyncDialog = syncConfirmation && syncConfirmation.userId === auth.user?.id
    ? <CloudSyncDialog key={`${syncConfirmation.userId}:${syncConfirmation.enabling}`} enabling={syncConfirmation.enabling}
      onClose={() => setSyncConfirmation(null)} onConfirm={async () => { if (syncConfirmation.enabling) await prepareCloudReconnect(syncConfirmation.userId); cloudSync.setEnabled(syncConfirmation.enabling); setSyncConfirmation(null); }} /> : null;

  const fallbackProfile = auth.user
    ? profileFromUser(auth.user)
    : { displayName: "Scribe user", email: "" };
  const accountProfile = {
    ...fallbackProfile,
    localOnly: usingLocalProfile,
    avatarColor: usingLocalProfile ? local.profile?.avatarColor : profileAvatarColor,
    deviceInventory: auth.deviceInventory,
    displayName: usingLocalProfile && local.profile ? local.profile.displayName : (loadedProfile?.userId === auth.user?.id ? loadedProfile?.name : null) ?? fallbackProfile.displayName,
    linkedAccounts: auth.linkedAccounts,
    linkedIdentityCount: auth.linkedIdentityCount,
    linkedAccountsLoaded: auth.linkedAccountsLoaded,
    linkedAccountsError: auth.linkedAccountsError,
  };
  const openSignIn = () => {
    if (isComposerOpen) {
      notesState.showError("Save or close your draft before switching workspaces.");
      setPage("notes"); window.dispatchEvent(new Event("scribe:restore-note-draft")); return;
    }
    setIsCreateFolderOpen(false); setEditingFolderId(null); setReminderNoteId(null); setSyncConfirmation(null);
    setLocalSetup(false); setAccountEntry(true); setPage("notes");
    notesState.clearUserData();
  };

  const changeShortcuts = async (value: ShortcutBindings) => {
    const globalChanged = value.quickCapture.key !== shortcuts.quickCapture.key || value.quickCapture.shift !== shortcuts.quickCapture.shift;
    if (globalChanged) await registerCaptureShortcut(value.quickCapture);
    try { saveShortcuts(serializeShortcutBindings(value)); }
    catch {
      if (globalChanged) await registerCaptureShortcut(shortcuts.quickCapture).catch(() => undefined);
      throw "Could not save shortcuts on this device. Check local storage and try again.";
    }
  };

  const toggleSidebar = useCallback(() => {
    const nextCollapsed = !sidebarCollapsed;
    saveSidebarCollapsed(String(nextCollapsed));
  }, [sidebarCollapsed, saveSidebarCollapsed]);

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
          onToggleTheme={() => changeTheme(!isDark)}
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

  if (!auth.user && !usingLocalProfile)
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
        {localSetup ? <LocalProfilePage onBack={() => setLocalSetup(false)} onCreate={(name) => {
          const error = local.save(name);
          if (!error) { setLocalSetup(false); setAccountEntry(false); setPage("notes"); }
          return error;
        }} /> : <AuthPage
          configured={auth.configured}
          onSignIn={auth.signInWithPassword}
          onSignUp={auth.signUpWithPassword}
          callbackError={auth.authCallbackError}
          notice={auth.authNotice}
          onAuthenticated={() => { setAccountEntry(false); setPage("notes"); }}
          onProviderSignIn={auth.signInWithProvider}
          oauthPending={auth.oauthPending}
          onCancelProviderSignIn={auth.cancelProviderSignIn}
          onRequestPasswordReset={auth.requestPasswordReset}
          offlineProfileName={local.profile?.displayName}
          onUseOffline={() => { if (local.profile) { setAccountEntry(false); setPage("notes"); } else setLocalSetup(true); }}
        />}
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
      <AccountTermsPage key={auth.user?.id} terms={accountTerms} onSignOut={auth.signOut} />
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
          onToggleTheme={() => changeTheme(!isDark)}
          syncStatus={syncStatus}
        />
        {cloudSyncDialog}
        <SettingsPage
          key={preferenceWorkspaceId}
          initialCategory={settingsInitialCategory}
          onSignIn={openSignIn}
          onDeleteData={() => {
            if (!notesUser || !notesState.cacheReady) { showNoteError("Wait for your saved workspace to load."); return; }
            if (isComposerOpen) { showNoteError("Save or close your draft before deleting data."); setPage("notes"); window.dispatchEvent(new Event("scribe:restore-note-draft")); return; }
            onDeleteData({ id: notesUser.id, displayName: accountProfile.displayName, email: accountProfile.email, localOnly: usingLocalProfile });
          }}
          onOpenTransfer={mode => {
            if (!notesUser || !notesState.cacheReady) { showNoteError("Wait for your saved workspace to load before transferring notes."); return; }
            if (isComposerOpen) { showNoteError("Save or close your draft before transferring notes."); setPage("notes"); window.dispatchEvent(new Event("scribe:restore-note-draft")); return; }
            onOpenTransfer({ id: notesUser.id, displayName: accountProfile.displayName, localOnly: usingLocalProfile, cloudSync: !offlineMode, mode });
          }}
          onDeleteAccount={() => {
            if (!auth.user) return;
            if (isComposerOpen) { showNoteError("Save or close your draft before deleting this account."); setPage("notes"); window.dispatchEvent(new Event("scribe:restore-note-draft")); return; }
            onDeleteAccount();
          }}
          onDeleteOfflineProfile={() => {
            if (!usingLocalProfile) return;
            if (isComposerOpen) {
              showNoteError("Save or close your draft before deleting this profile.");
              setPage("notes"); window.dispatchEvent(new Event("scribe:restore-note-draft")); return;
            }
            onDeleteOfflineProfile();
          }}
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
        <SyncFeedback onRetry={!offlineMode ? () => { notesState.retrySync(); reminderState.retrySync(); } : undefined} onStorage={() => { setSettingsInitialCategory("storage"); setPage("preferences"); }} onTrash={() => { notesState.selectSection("trash"); setPage("notes"); }} error={notesState.error} syncing={notesState.syncStatus === "syncing"} loading={notesState.loading} onDismiss={notesState.clearError} />
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
        onToggleOfflineMode={usingLocalProfile ? undefined : () => changeOfflineMode(!offlineMode)}
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
            if (isComposerOpen) { notesState.showError("Save or close your draft before switching workspaces."); window.dispatchEvent(new Event("scribe:restore-note-draft")); return; }
            if (usingLocalProfile) { openSignIn(); return; }
            const error = await auth.signOut();
            if (error) { notesState.showError(error); return; }
            setAccountEntry(true);
            notesState.clearUserData();
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          onExpandSidebar={() => saveSidebarCollapsed("false")}
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
          key={notesUser?.id}
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
        pending={!offlineMode && Boolean(reminderState.pending[reminderNote.id])}
        offline={offlineMode || !navigator.onLine}
        saveHint={usingLocalProfile ? "Saved only on this device. Scribe must be running to deliver the reminder." : offlineMode ? "Saved on this device. Cloud sync is disabled." : undefined}
        cloudError={reminderState.error}
        onSave={async (dueAt, leadMinutes) => {
          const error = await reminderState.save(reminderNote.id, dueAt, leadMinutes);
          if (!error) setReminderNotice(dueAt ? "Reminder saved on this device." : "Reminder removed. Saved locally.");
          return error;
        }}
        onClose={() => setReminderNoteId(null)}
      />}
      <AppNotifications onRetry={!offlineMode ? () => { notesState.retrySync(); reminderState.retrySync(); } : undefined} onStorage={() => { setSettingsInitialCategory("storage"); setPage("preferences"); }} onTrash={() => { notesState.selectSection("trash"); setPage("notes"); }} alerts={desktopNotifications.alerts} onDismiss={desktopNotifications.dismiss} onOpen={setNotificationTarget} />
      {reminderNotice && !notesState.error && !reminderState.error && !desktopNotifications.error && <ReminderFeedback key={reminderNotice} message={reminderNotice} onDismiss={dismissReminderNotice} />}
      <SyncFeedback onRetry={!offlineMode ? () => { notesState.retrySync(); reminderState.retrySync(); } : undefined} onStorage={() => { setSettingsInitialCategory("storage"); setPage("preferences"); }} onTrash={() => { notesState.selectSection("trash"); setPage("notes"); }} error={notesState.error ?? reminderState.error ?? desktopNotifications.error} syncing={notesState.syncStatus === "syncing"} loading={notesState.loading} onDismiss={() => { notesState.clearError(); reminderState.clearError(); desktopNotifications.clearError(); }} />
    </main>
  );
}

export default App;
