import { Icon } from "../Icon";

export function EmptyNotes({
    search,
    isTrash,
    onCreateNote,
    newNoteShortcut,
}: {
    search: string;
    isTrash: boolean;
    onCreateNote: () => void;
    newNoteShortcut: string;
}) {
    return (
        <div className="empty-notes">
            <div className="empty-icon">
                <Icon name={isTrash ? "trash" : "note"} size={21} />
            </div>
            <strong>
                {search
                    ? "No Notes found"
                    : isTrash
                        ? "Trash is empty"
                        : "No Notes here yet"}
            </strong>
            <span>
                {search ? "Try another search term." : "Create a Note to get started."}
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
