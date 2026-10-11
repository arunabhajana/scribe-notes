import type { NoteSection } from "../../types/note";
import { Icon } from "../Icon";
import type { ShortcutBindings } from "../../features/shortcuts/keyboardShortcuts";
import { formatShortcut } from "../../features/shortcuts/keyboardShortcuts";

export function PrimaryNavigation({
    section,
    noteCount,
    draftCount,
    onSelect,
    shortcuts,
}: {
    section: NoteSection;
    noteCount: number;
    draftCount: number;
    onSelect: (section: NoteSection) => void;
    shortcuts: ShortcutBindings;
}) {
    return (
        <nav className="primary-nav" aria-label="Note views">
            <button
                data-tooltip={`All Notes · ${formatShortcut(shortcuts.allNotes)}`}
                aria-label={`All Notes, ${noteCount} Notes`}
                className={`nav-item ${section === "all" ? "active" : ""}`}
                onClick={() => onSelect("all")}
            >
                <Icon name="note" />
                <span>All Notes</span>
                <span className="nav-count">{noteCount}</span>
            </button>
            <button
                data-tooltip={`Drafts · ${formatShortcut(shortcuts.drafts)}`}
                aria-label={`Drafts, ${draftCount} Notes`}
                className={`nav-item ${section === "drafts" ? "active" : ""}`}
                onClick={() => onSelect("drafts")}
            >
                <Icon name="draft" />
                <span>Drafts</span>
                <span className="nav-count">{draftCount}</span>
            </button>
            <button
                data-tooltip={`Pinned Notes · ${formatShortcut(shortcuts.pinnedNotes)}`}
                aria-label="Pinned Notes"
                className={`nav-item ${section === "pinned" ? "active" : ""}`}
                onClick={() => onSelect("pinned")}
            >
                <Icon name="pin" />
                <span>Pinned Notes</span>
            </button>
            <button
                data-tooltip={`Trash · ${formatShortcut(shortcuts.trash)}`}
                aria-label="Trash"
                className={`nav-item ${section === "trash" ? "active" : ""}`}
                onClick={() => onSelect("trash")}
            >
                <Icon name="trash" />
                <span>Trash</span>
            </button>
        </nav>
    );
}
