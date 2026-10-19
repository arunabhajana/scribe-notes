import { Icon } from "../Icon";

export function EmptyNotes({
    search,
    isTrash,
    onCreateNote,
    newNoteShortcut,
    filtered = false,
}: {
    search: string;
    isTrash: boolean;
    onCreateNote: () => void;
    newNoteShortcut: string;
    filtered?: boolean;
}) {
    return (
        <div className="empty-notes">
            <div className="empty-icon">
                <Icon name={isTrash ? "trash" : "note"} size={21} />
            </div>
            <strong>
                {search || filtered
                    ? "No Notes found"
                    : isTrash
                        ? "Trash is empty"
                        : "No Notes here yet"}
            </strong>
            <span>
                {filtered ? 'Try another search or clear the filters above.' : search ? "Try another search term." : isTrash ? 'Notes moved to Trash appear here.' : "Create a Note to get started."}
            </span>
            {!isTrash && (
                <button
                    onClick={onCreateNote}
                    data-tooltip={`Create a Note · ${newNoteShortcut}`}
                >
                    Create a Note
                </button>
            )}
        </div>
    );
}
