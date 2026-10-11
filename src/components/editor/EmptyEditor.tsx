import { Icon } from "../Icon";

export function EmptyEditor({
  isTrash,
  onCreateNote,
  newNoteShortcut,
}: {
  isTrash: boolean;
  onCreateNote: () => void;
  newNoteShortcut: string;
}) {
  return (
    <div className="editor-empty">
      <div className="empty-icon">
        <Icon name="note" size={24} />
      </div>
      <h2>
        {isTrash
          ? "Select a Note to restore or delete"
          : "Your next thought starts here"}
      </h2>
      <p>Choose a Note from your list, or create a new one.</p>
      <button
        className="new-note-button"
        onClick={onCreateNote}
        title={`New Note · ${newNoteShortcut}`}
      >
        <Icon name="plus" size={16} />
        New Note
      </button>
    </div>
  );
}
