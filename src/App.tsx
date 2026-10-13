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
import { notesRepository } from "./features/notes/notesRepository";
import type { Note } from "./types/note";
import { SettingsPage } from "./components/settings/SettingsPage";
import { AuthPage } from "./components/auth/AuthPage";
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
  const openContextMenu = useContextMenu();
  const [writingPreferences, updateWritingPreferences] = useWritingPreferences();
  const [offlineMode, setOfflineMode] = useState(
    () => localStorage.getItem("scribe-offline-mode") === "true",
  );
  const notesUser = !auth.mfa.loading && !auth.mfa.required && !auth.passwordRecoveryRequired ? auth.user : null;
  const notesState = useNotes(notesUser, auth.configured, offlineMode);
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
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isComposerModalActive, setIsComposerModalActive] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("scribe-sidebar-collapsed") === "true",
  );
  const [page, setPage] = useState<AppPage>("notes");
  const [shortcuts, setShortcuts] =
    useState<ShortcutBindings>(getShortcutBindings);
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
    setOfflineMode(enabled);
    localStorage.setItem("scribe-offline-mode", String(enabled));
  };

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

  const changeShortcuts = (value: ShortcutBindings) => {
    setShortcuts(value);
    localStorage.setItem("scribe-keyboard-shortcuts", JSON.stringify(value));
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
        matchesShortcut(event, shortcuts[item.id]),
      );
      if (!action) return;
      event.preventDefault();
      switch (action.id) {
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
          syncStatus={notesState.syncStatus}
        />
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
            if (note.isDraft) items.push({ label: "Save draft", action: () => notesState.updateNote(note.id, { isDraft: false }) });
            items.push({ label: "Move to Unfiled", separator: true, disabled: note.folderId === null, action: () => notesState.updateNote(note.id, { folderId: null }) });
            notesState.folders.forEach((folder) => items.push({ label: `Move to ${folder.name}`, disabled: note.folderId === folder.id, action: () => notesState.updateNote(note.id, { folderId: folder.id }) }));
            items.push({ label: "Move to trash", separator: true, danger: true, action: () => handleDeleteNote(note) });
          }
        } else if (folderId) {
          const index = notesState.folders.findIndex((folder) => folder.id === folderId);
          items = [
            { label: "Open folder", action: () => notesState.selectFolder(folderId) },
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
      <TitleBar
        dark={isDark}
        onToggleTheme={() => changeTheme(!isDark)}
        onOpenSettings={() => setPage("preferences")}
        inert={isComposerModalActive}
        settingsShortcut={formatShortcut(shortcuts.openSettings)}
        syncStatus={notesState.syncStatus}
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
          syncStatus={notesState.syncStatus}
          loading={notesState.loading && notesState.notes.length === 0}
        />
        {notesState.loading && notesState.notes.length === 0 ? <EditorSkeleton /> : <EditorPane
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
        />}
      </div>
      {isCreateFolderOpen && (
        <CreateFolderDialog
          onClose={() => setIsCreateFolderOpen(false)}
          onCreate={notesState.createFolder}
        />
      )}
      {isComposerOpen && (
        <NewNoteComposer
          folders={notesState.folders}
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
      <SyncFeedback error={notesState.error} syncing={notesState.syncStatus === "syncing"} loading={notesState.loading} onDismiss={notesState.clearError} />
    </main>
  );
}

export default App;
