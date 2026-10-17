import { useRef, useState, type KeyboardEvent } from "react";
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
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
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
    <section className="editor-pane" data-context-note={note.id} data-sync-editing={bodyEditing ? "true" : undefined}>
      <EditorHeader
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
      {bodyEditing && !isTrash && (
        <EditorToolbar
          editModeShortcut={editModeShortcut}
          preview={false}
          onTogglePreview={() => window.dispatchEvent(new Event("scribe:toggle-note-mode"))}
          onAction={applyAction}
        />
      )}
      <NoteBodyEditor
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
