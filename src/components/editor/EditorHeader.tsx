import { useEffect, useRef, useState } from "react";
import { ChevronDown, Folder, FolderPlus, Pencil, RotateCcw } from "lucide-react";
import type { Note, NoteFolder } from "../../types/note";
import { Icon } from "../Icon";

export function EditorHeader({
  note,
  titleEditable,
  onUpdateTitle,
  onTogglePinned,
  onDelete,
  deleteLabel,
  pinShortcut,
  folders,
  onMoveToFolder,
  onCreateFolder,
  onRestore,
}: {
  note: Note;
  titleEditable: boolean;
  onUpdateTitle: (title: string) => void;
  onTogglePinned: () => void;
  onDelete: () => void;
  deleteLabel: string;
  pinShortcut: string;
  folders: NoteFolder[];
  onMoveToFolder: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onRestore: () => void;
}) {
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTitleEditing(false);
  }, [note.id]);
  useEffect(() => {
    if (titleEditing) titleInputRef.current?.focus();
  }, [titleEditing]);
  const currentFolder = folders.find((folder) => folder.id === note.folderId);
  return (
    <header className="editor-header">
      <div className={`editor-title-wrap ${titleEditing ? "is-editing" : ""}`}>
        {titleEditing && titleEditable ? (
          <input
            ref={titleInputRef}
            className="note-title-input"
            value={note.title}
            onChange={(event) => onUpdateTitle(event.target.value)}
            onBlur={() => setTitleEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            aria-label="Note title"
          />
        ) : (
          <button
            type="button"
            className={`editor-title-view ${titleEditable ? "is-clickable" : ""}`}
            onClick={() => titleEditable && setTitleEditing(true)}
            disabled={!titleEditable}
            aria-label={titleEditable ? "Edit Note title" : undefined}
          >
            <h1>{note.title || "Untitled Note"}</h1>
            {titleEditable && (
              <span className="editor-edit-hint" aria-hidden="true">
                <Pencil size={14} />
                <span>Click to edit</span>
              </span>
            )}
          </button>
        )}
      </div>
      <div className="editor-actions">
        {!note.deletedAt && (
          <div className="editor-folder-picker">
            <button
              type="button"
              className={`editor-folder-trigger ${folderMenuOpen ? "is-open" : ""}`}
              aria-label={`Folder: ${currentFolder?.name ?? "No folder"}`}
              aria-haspopup="listbox"
              aria-expanded={folderMenuOpen}
              data-tooltip="Change Note folder"
              onClick={() => setFolderMenuOpen((open) => !open)}
            >
              <Folder
                size={14}
                style={{
                  color: currentFolder
                    ? `var(--folder-${currentFolder.color})`
                    : undefined,
                }}
              />
              <span>{currentFolder?.name ?? "No folder"}</span>
              <ChevronDown size={13} />
            </button>
            {folderMenuOpen && (
              <>
                <button
                  type="button"
                  className="editor-folder-dismiss"
                  aria-label="Close folder menu"
                  onClick={() => setFolderMenuOpen(false)}
                />
                <div
                  className="editor-folder-menu"
                  role="listbox"
                  aria-label="Move Note to folder"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={!note.folderId}
                    className={!note.folderId ? "is-selected" : ""}
                    onClick={() => {
                      onMoveToFolder(null);
                      setFolderMenuOpen(false);
                    }}
                  >
                    No folder
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      role="option"
                      aria-selected={note.folderId === folder.id}
                      className={
                        note.folderId === folder.id ? "is-selected" : ""
                      }
                      onClick={() => {
                        onMoveToFolder(folder.id);
                        setFolderMenuOpen(false);
                      }}
                    >
                      <span
                        className="editor-folder-option-icon"
                        style={{ color: `var(--folder-${folder.color})` }}
                      >
                        <Icon name={folder.icon} size={14} />
                      </span>
                      <span>{folder.name}</span>
                    </button>
                  ))}
                  <span className="editor-folder-menu-divider" />
                  <button
                    type="button"
                    className="editor-folder-create"
                    onClick={() => {
                      onCreateFolder();
                      setFolderMenuOpen(false);
                    }}
                  >
                    <FolderPlus size={14} /> Create folder
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <span className="save-status" data-tooltip="All changes are saved">
          <span className="save-dot" />
          Saved
        </span>
        {!note.deletedAt && (
          <button
            className={`action-button ${note.pinned ? "pinned" : ""}`}
            onClick={onTogglePinned}
            data-tooltip={`${note.pinned ? "Unpin Note" : "Pin Note"} · ${pinShortcut}`}
          >
            <Icon name="pin" size={15} />
            <span>{note.pinned ? "Pinned" : "Pin"}</span>
          </button>
        )}
        {note.deletedAt && (
          <button
            className="action-button"
            onClick={onRestore}
            data-tooltip="Restore Note"
          >
            <RotateCcw size={15} />
            <span>Restore</span>
          </button>
        )}
        <button
          className="action-button delete-action"
          onClick={onDelete}
          data-tooltip={deleteLabel}
        >
          <Icon name="trash" size={15} />
          <span>{deleteLabel}</span>
        </button>
      </div>
    </header>
  );
}
