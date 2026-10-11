import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [offlineMode, setOfflineMode] = useState(
    () => localStorage.getItem("scribe-offline-mode") === "true",
  );
  const notesState = useNotes(auth.user, auth.configured, offlineMode);
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem("scribe-theme") !== "light",
  );
  const [loadedProfile, setLoadedProfile] = useState<{ userId: string; name: string | null } | null>(null);
  const [fontFamily, setFontFamily] = useState(
    () => localStorage.getItem("scribe-font-family") ?? "DM Sans",
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
    let active = true;
    if (!auth.user || !auth.configured)
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
        setLoadedProfile({ userId: auth.user!.id, name });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [auth.user, auth.configured, offlineMode]);

  const storageMetrics = useMemo(() => {
    const bytes = (value: unknown) =>
      new TextEncoder().encode(JSON.stringify(value)).length;
    const settingsBytes = [
      "scribe-accent",
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
  }, [notesState.notes, notesState.folders]);

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

  const changeOfflineMode = (enabled: boolean) => {
    setOfflineMode(enabled);
    localStorage.setItem("scribe-offline-mode", String(enabled));
  };

  const fallbackProfile = auth.user
    ? profileFromUser(auth.user)
    : { displayName: "Scribe user", email: "" };
  const accountProfile = {
    ...fallbackProfile,
    displayName: (loadedProfile?.userId === auth.user?.id ? loadedProfile?.name : null) ?? fallbackProfile.displayName,
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
        !auth.user ||
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
    auth.user,
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

  if (auth.loading)
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
