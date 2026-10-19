import { VirtualNoteList } from "./VirtualNoteList";
import { SearchFilters } from './SearchFilters';
import { SelectionHint } from './SelectionHint';
import type { NoteSearchFilters } from '../../features/notes/noteSearch';
import { type ReactNode } from "react";
import { useNoteSelection } from "./useNoteSelection";
import { useContextMenu, type ContextMenuItem } from "../context-menu/contextMenuState";
import "./workspaceTools.css";
import type { Note, NoteSection } from "../../types/note";
import { memo, useCallback, useMemo } from "react";
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

const NoteRow = memo(function NoteRow({ note, folderConfig, selected, reminder, onSaveDraft, onSelectNote, onTogglePinned, onEditReminder, search }: {
  search: string;
  note: Note; folderConfig?: NoteFolder; selected: boolean; reminder?: NoteReminder;
  onSaveDraft: (id: string) => void; onSelectNote: (id: string) => void;
  onTogglePinned: (id: string) => void; onEditReminder: (id: string) => void;
}) {
  return <NoteCard note={note} folderConfig={folderConfig} selected={selected} reminder={reminder} search={search}
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
  searchFilters, onSearchFiltersChange,
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
  tools, onBulk, onExportSelection, localSaveStatus = "saved", statusDetail,
}: {
  tools?: ReactNode;
  localSaveStatus?: "saved" | "saving" | "failed";
  statusDetail?: string;
  onBulk?: (ids: string[], action: "trash" | "restore" | "move", folderId?: string | null) => void;
  onExportSelection?: (ids: string[]) => void;
  notes: Note[];
  folders: NoteFolder[];
  selectedId: string | null;
  section: NoteSection;
  folder: string;
  search: string;
  searchFilters: NoteSearchFilters;
  onSearchFiltersChange: (value: NoteSearchFilters) => void;
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
  const selection = useNoteSelection(notes, selectedId);
  const select = selection.click;
  const openNote = useCallback((id: string) => { select(id, false, false); onSelectNote(id); }, [select, onSelectNote]);
  const openContextMenu = useContextMenu();
  const chosen = [...selection.selected];
  const bulk = (action: "trash" | "restore" | "move", folderId?: string | null) => { onBulk?.(chosen, action, folderId); selection.clear(); };
  const showSelectionMenu = (x: number, y: number, target: HTMLElement) => {
    const items: ContextMenuItem[] = [
      { label: `${chosen.length} notes selected`, disabled: true, action: () => {} },
      { label: 'Export selected notes', action: () => onExportSelection?.(chosen) },
    ];
    if (section === 'trash') items.push({ label: 'Restore selected notes', separator: true, action: () => bulk('restore') });
    else {
      items.push({ label: 'Move to Unfiled', separator: true, action: () => bulk('move', null) });
      for (const folder of folders) items.push({ label: `Move to ${folder.name}`, action: () => bulk('move', folder.id) });
      items.push({ label: 'Move selected notes to Trash', separator: true, danger: true, action: () => bulk('trash') });
    }
    items.push({ label: 'Select all notes in this view', separator: true, action: () => selection.replace(notes.map(note => note.id)) }, { label: 'Clear selection', action: selection.clear });
    openContextMenu(x, y, items, target);
  };
  const foldersById = useMemo(() => new Map(folders.map(item => [item.id, item])), [folders]);
  const renderNote = (note: Note) => <NoteRow search={search} reminder={reminders[note.id]} onEditReminder={onEditReminder} note={note} folderConfig={note.folderId ? foldersById.get(note.folderId) : undefined} selected={selection.explicit ? selection.selected.has(note.id) : selectedId === note.id} onSaveDraft={onSaveDraft} onSelectNote={openNote} onTogglePinned={onTogglePinned}/>;
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
    <section className="notes-pane" onClickCapture={event => {
      const target = event.target as HTMLElement;
      if (target.closest<HTMLElement>('.notes-scroll')?.dataset.suppressClick === 'true') { event.preventDefault(); event.stopPropagation(); return; }
      const card = target.closest<HTMLElement>('.notes-scroll [data-context-note]');
      if (!card) { if (target.closest('.notes-scroll')) selection.clear(); return; }
      if (target.closest('button, input, a, select, textarea')) return;
      const id = card.dataset.contextNote!;
      if (event.ctrlKey || event.metaKey || event.shiftKey) { selection.click(id, event.ctrlKey || event.metaKey, event.shiftKey); event.preventDefault(); event.stopPropagation(); }
    }} onContextMenu={event => {
      const target = event.target as HTMLElement;
      if (!target.closest('.notes-scroll')) return;
      const id = target.closest<HTMLElement>('[data-context-note]')?.dataset.contextNote;
      if (chosen.length > 1 && (!id || selection.selected.has(id))) {
        event.preventDefault(); event.stopPropagation(); showSelectionMenu(event.clientX, event.clientY, target);
      } else if (id) selection.replace([id]);
      else if (notes.length) {
        event.preventDefault(); event.stopPropagation();
        openContextMenu(event.clientX, event.clientY, [{ label: 'New Note', action: onCreateNote }, { label: 'Select all notes in this view', separator: true, action: () => selection.replace(notes.map(note => note.id)) }], target);
      }
    }} onKeyDownCapture={event => {
      const target = event.target as HTMLElement;
      if (!target.closest('.notes-scroll') || target.closest('input, textarea, select')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); event.stopPropagation(); selection.replace(notes.map(note => note.id)); }
      if (event.key === 'Escape' && selection.explicit) { event.preventDefault(); event.stopPropagation(); selection.clear(); }
      if ((event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') && chosen.length > 1) {
        event.preventDefault(); event.stopPropagation(); const rect = target.getBoundingClientRect(); showSelectionMenu(rect.left + 20, rect.top + 20, target);
      }
    }}>
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
        <SearchFilters value={searchFilters} onChange={onSearchFiltersChange}/>
        <NoteSortDropdown value={sortOrder} onChange={onSortChange} />
      </div>
      {!loading && notes.length > 1 && <SelectionHint/>}
      {loading ? <div className="notes-scroll"><NotesSkeleton /></div> : notes.length === 0 ? <div className="notes-scroll"><EmptyNotes filtered={searchFilters.pinned || searchFilters.reminder || searchFilters.field !== 'all'} search={search} isTrash={section === "trash"} onCreateNote={onCreateNote} newNoteShortcut={formatShortcut(shortcuts.newNote)}/></div> : <VirtualNoteList notes={notes} selectedId={selectedId} selectedIds={selection.explicit ? chosen : selectedId ? [selectedId] : []} onDragSelection={selection.replace}>{renderNote}</VirtualNoteList>}
      <footer className="list-footer">
        <span title={statusDetail}>
          <Icon name="clock" size={13} />{" "}
          {localSaveStatus === "failed" ? "Save failed" : localSaveStatus === "saving" ? "Saving..." : syncStatus === "syncing"
            ? "Syncing…"
            : syncStatus === "synced"
              ? "Synced"
              : syncStatus === "offline"
                ? "Offline"
                : syncStatus === "error"
                  ? "Sync issue"
                  : "On this device"}
        </span>
        {tools}
        <span title="Ctrl-click to add notes, Shift-click for a range, or drag to select. Right-click for actions.">{chosen.length > 1 ? `${chosen.length} selected` : formatShortcut(shortcuts.search)}</span>
      </footer>
    </section>
  );
}
