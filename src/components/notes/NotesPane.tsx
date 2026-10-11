import type { Note, NoteSection } from "../../types/note";
import type { NoteFolder } from "../../types/note";
import { Icon } from "../Icon";
import { EmptyNotes } from "./EmptyNotes";
import { NoteCard } from "./NoteCard";
import { NotesSkeleton } from "../feedback/LoadingFeedback";
import {
  formatShortcut,
  type ShortcutBindings,
} from "../../features/shortcuts/keyboardShortcuts";

export function NotesPane({
  notes,
  folders,
  selectedId,
  section,
  folder,
  search,
  onSaveDraft,
  onSelectNote,
  onTogglePinned,
  onCreateNote,
  shortcuts,
  syncStatus,
  loading = false,
}: {
  notes: Note[];
  folders: NoteFolder[];
  selectedId: string | null;
  section: NoteSection;
  folder: string;
  search: string;
  onSaveDraft: (id: string) => void;
  onSelectNote: (id: string) => void;
  onTogglePinned: (id: string) => void;
  onCreateNote: () => void;
  shortcuts: ShortcutBindings;
  syncStatus: "on-device" | "syncing" | "synced" | "offline" | "error";
  loading?: boolean;
}) {
  const title =
    section === "drafts"
      ? "Drafts"
      : section === "unfiled"
        ? "Unfiled"
        : section === "pinned"
          ? "Pinned Notes"
          : section === "trash"
            ? "Trash"
            : folder || "All Notes";
  return (
    <section className="notes-pane">
      <header className="pane-header">
        <div>
          <h1>{title}</h1>
          <span className="pane-subtitle">
            {loading ? "Loading…" : `${notes.length} ${notes.length === 1 ? "Note" : "Notes"}`}
          </span>
        </div>
        <button
          className="new-note-button"
          onClick={onCreateNote}
          data-tooltip={`New Note · ${formatShortcut(shortcuts.newNote)}`}
        >
          <Icon name="plus" size={16} />
          <span>New Note</span>
        </button>
      </header>
      <div className="notes-scroll">
        {loading ? <NotesSkeleton /> : notes.length === 0 ? (
          <EmptyNotes
            search={search}
            isTrash={section === "trash"}
            onCreateNote={onCreateNote}
            newNoteShortcut={formatShortcut(shortcuts.newNote)}
          />
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              folderConfig={folders.find((item) => item.id === note.folderId)}
              selected={selectedId === note.id}
              onSelect={() => {
                if (note.isDraft && !note.deletedAt) onSaveDraft(note.id);
                onSelectNote(note.id);
              }}
              onTogglePinned={() => onTogglePinned(note.id)}
            />
          ))
        )}
      </div>
      <footer className="list-footer">
        <span>
          <Icon name="clock" size={13} />{" "}
          {syncStatus === "syncing"
            ? "Syncing…"
            : syncStatus === "synced"
              ? "Synced"
              : syncStatus === "offline"
                ? "Offline"
                : syncStatus === "error"
                  ? "Sync issue"
                  : "On this device"}
        </span>
        <span title="Search Notes">{formatShortcut(shortcuts.search)}</span>
      </footer>
    </section>
  );
}
