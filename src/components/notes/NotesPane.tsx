import type { Note, NoteSection } from "../../types/note";
import { memo, useMemo } from "react";
import type { NoteFolder } from "../../types/note";
import { Icon } from "../Icon";
import { EmptyNotes } from "./EmptyNotes";
import { NoteCard } from "./NoteCard";
import { NotesSkeleton } from "../feedback/LoadingFeedback";
import { NoteSortDropdown } from "./NoteSortDropdown";
import type { NoteSort } from "../../features/notes/noteSorting";
import type { NoteReminder } from "../../features/reminders/reminderTypes";
import {
  formatShortcut,
  type ShortcutBindings,
} from "../../features/shortcuts/keyboardShortcuts";

const NoteRow = memo(function NoteRow({ note, folderConfig, selected, reminder, onSaveDraft, onSelectNote, onTogglePinned, onEditReminder }: {
  note: Note; folderConfig?: NoteFolder; selected: boolean; reminder?: NoteReminder;
  onSaveDraft: (id: string) => void; onSelectNote: (id: string) => void;
  onTogglePinned: (id: string) => void; onEditReminder: (id: string) => void;
}) {
  return <NoteCard note={note} folderConfig={folderConfig} selected={selected} reminder={reminder}
    onSelect={() => { if (note.isDraft && !note.deletedAt) onSaveDraft(note.id); onSelectNote(note.id); }}
    onTogglePinned={() => onTogglePinned(note.id)} onEditReminder={() => onEditReminder(note.id)} />;
});

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
  sortOrder,
  onSortChange,
  reminders,
  onEditReminder,
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
  sortOrder: NoteSort;
  onSortChange: (value: NoteSort) => void;
  reminders: Record<string, NoteReminder>;
  onEditReminder: (noteId: string) => void;
  loading?: boolean;
}) {
  const foldersById = useMemo(() => new Map(folders.map(item => [item.id, item])), [folders]);
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
          data-tour="new-note"
          onClick={onCreateNote}
          data-tooltip={`New Note · ${formatShortcut(shortcuts.newNote)}`}
        >
          <Icon name="plus" size={16} />
          <span>New Note</span>
        </button>
      </header>
      <div className="notes-sort-row">
        <span>Sort by</span>
        <NoteSortDropdown value={sortOrder} onChange={onSortChange} />
      </div>
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
            <NoteRow
              reminder={reminders[note.id]}
              onEditReminder={onEditReminder}
              key={note.id}
              note={note}
              folderConfig={note.folderId ? foldersById.get(note.folderId) : undefined}
              selected={selectedId === note.id}
              onSaveDraft={onSaveDraft}
              onSelectNote={onSelectNote}
              onTogglePinned={onTogglePinned}
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
