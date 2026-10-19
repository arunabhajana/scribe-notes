import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { NoteFindBar, type NoteFindState } from './NoteFindBar';
import './noteFind.css';
import type { Note } from "../../types/note";
import type { NoteReminder } from "../../features/reminders/reminderTypes";
import type { NoteFolder } from "../../types/note";
import { EmptyEditor } from "./EmptyEditor";
import { EditorFooter } from "./EditorFooter";
import { EditorHeader } from "./EditorHeader";
import { NoteBodyEditor } from "./NoteBodyEditor";
import { EditorToolbar, type MarkdownAction } from "./EditorToolbar";
import { applyMarkdownAction } from "./markdownFormatting";
import { isMacOS } from "../../features/shortcuts/keyboardShortcuts";

type EditorPaneProps = {
  saveStatus?: "saved" | "saving" | "failed";
  editModeShortcut: string;
  reminder?: NoteReminder;
  onSetReminder: () => void;
  note: Note | null;
  isTrash: boolean;
  deleteLabel: string;
  onCreateNote: () => void;
  onUpdateNote: (
    id: string,
    patch: {
      title?: string;
      body?: string;
      pinned?: boolean;
      deletedAt?: string | null;
      isDraft?: boolean;
    },
  ) => void;
  onDeleteNote: (note: Note) => void;
  pinShortcut: string;
  newNoteShortcut: string;
  folders: NoteFolder[];
  onMoveToFolder: (noteId: string, folderId: string | null) => void;
  onCreateFolder: () => void;
  onRestoreNote: (id: string) => void;
};

export function EditorPane({
  saveStatus = "saved",
  editModeShortcut,
  reminder,
  onSetReminder,
  note,
  isTrash,
  deleteLabel,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  pinShortcut,
  newNoteShortcut,
  folders,
  onMoveToFolder,
  onCreateFolder,
  onRestoreNote,
}: EditorPaneProps) {
  const [bodyEditing, setBodyEditing] = useState(false);
  const [find, setFind] = useState<NoteFindState | null>(null);
  const [findCount, setFindCount] = useState(0);
  const paneRef = useRef<HTMLElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const closeFind = () => {
    setFind(null);
    if (bodyEditing) bodyInputRef.current?.focus({ preventScroll: true });
    else paneRef.current?.querySelector<HTMLElement>('.editor-body-view')?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const handleFind = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !note || document.querySelector('[role="dialog"][aria-modal="true"], dialog[open], [role="menu"], [role="listbox"]')) return;
      if ((isMacOS() ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        const selection = bodyEditing && bodyInputRef.current ? bodyInputRef.current.value.slice(bodyInputRef.current.selectionStart, bodyInputRef.current.selectionEnd) : '';
        setFind(current => current ?? { query: selection.length <= 200 ? selection : '', matchCase: false, index: 0, request: 0 });
        requestAnimationFrame(() => paneRef.current?.querySelector<HTMLInputElement>('.note-find-bar input')?.focus());
      }
    };
    window.addEventListener('keydown', handleFind);
    return () => window.removeEventListener('keydown', handleFind);
  }, [note, bodyEditing]);
  const navigateFind = (direction: number) => setFind(current => current && ({ ...current, index: findCount ? (current.index + direction + findCount) % findCount : 0, request: current.request + 1 }));
  const applyAction = (action: MarkdownAction) =>
    applyMarkdownAction(
      bodyInputRef.current,
      note?.body ?? "",
      action,
      (body) => note && onUpdateNote(note.id, { body }),
    );
  const handleFormattingKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (!(isMacOS() ? event.metaKey : event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const action: MarkdownAction | null =
      !event.altKey && !event.shiftKey && key === "b"
        ? "bold"
        : !event.altKey && !event.shiftKey && key === "i"
          ? "italic"
          : !event.altKey && !event.shiftKey && key === "u"
            ? "underline"
          : !event.altKey && !event.shiftKey && key === "k"
            ? "link"
            : event.altKey && !event.shiftKey && key === "1"
              ? "heading1"
              : event.altKey && !event.shiftKey && key === "2"
                ? "heading2"
              : event.altKey && !event.shiftKey && key === "3"
                ? "heading3"
                : null;
    if (!action) return;
    event.preventDefault();
    applyAction(action);
  };
  if (!note)
    return (
      <section className="editor-pane">
        <EmptyEditor
          isTrash={isTrash}
          onCreateNote={onCreateNote}
          newNoteShortcut={newNoteShortcut}
        />
      </section>
    );
  return (
    <section ref={paneRef} className="editor-pane" data-context-note={note.id} data-sync-editing={bodyEditing ? "true" : undefined} onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
      if (find) { event.preventDefault(); event.stopPropagation(); closeFind(); }
      else if (bodyEditing) { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new Event('scribe:toggle-note-mode')); requestAnimationFrame(() => paneRef.current?.querySelector<HTMLElement>('.editor-body-view')?.focus({ preventScroll: true })); }
    }}>
      <EditorHeader
        onFind={() => { setFind(current => current ?? { query: '', matchCase: false, index: 0, request: 0 }); requestAnimationFrame(() => paneRef.current?.querySelector<HTMLInputElement>('.note-find-bar input')?.focus()); }}
        saveStatus={saveStatus}
        reminder={reminder}
        onSetReminder={onSetReminder}
        note={note}
        titleEditable={!isTrash}
        onUpdateTitle={(title) => onUpdateNote(note.id, { title })}
        onTogglePinned={() => onUpdateNote(note.id, { pinned: !note.pinned })}
        onDelete={() => onDeleteNote(note)}
        deleteLabel={deleteLabel}
        pinShortcut={pinShortcut}
        folders={folders}
        onMoveToFolder={(folderId) => onMoveToFolder(note.id, folderId)}
        onCreateFolder={onCreateFolder}
        onRestore={() => onRestoreNote(note.id)}
      />
      {find && <NoteFindBar value={find} count={findCount} onChange={setFind} onNavigate={navigateFind} onClose={closeFind}/>}
      {bodyEditing && !isTrash && (
        <EditorToolbar
          editModeShortcut={editModeShortcut}
          preview={false}
          onTogglePreview={() => window.dispatchEvent(new Event("scribe:toggle-note-mode"))}
          onAction={applyAction}
        />
      )}
      <NoteBodyEditor
        find={find}
        onFindCount={setFindCount}
        editModeShortcut={editModeShortcut}
        onEndEdit={() => setBodyEditing(false)}
        value={note.body}
        preview={!bodyEditing}
        inputRef={bodyInputRef}
        onChange={(body) => onUpdateNote(note.id, { body })}
        onKeyDown={handleFormattingKeyDown}
        readOnly={isTrash}
        onBeginEdit={() => setBodyEditing(true)}
      />
      <EditorFooter body={note.body} updatedAt={note.updatedAt} />
    </section>
  );
}
