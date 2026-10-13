import type { Note, NoteFolder } from "../../types/note";
import { Icon } from "../Icon";
import { MarkdownPreview } from "../editor/MarkdownPreview";
import { Bell } from "lucide-react";
import { formatReminderTime, type NoteReminder } from "../../features/reminders/reminderTypes";
import "./noteCard.css";

export function NoteCard({
  note,
  folderConfig,
  selected,
  onSelect,
  onTogglePinned,
  reminder,
  onEditReminder,
}: {
  note: Note;
  folderConfig?: NoteFolder;
  selected: boolean;
  onSelect: () => void;
  onTogglePinned: () => void;
  reminder?: NoteReminder;
  onEditReminder: () => void;
}) {
  const relativeTime = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });
  const ageSeconds =
    (new Date().getTime() - new Date(note.updatedAt).getTime()) / 1000;
  const seconds = Math.max(0, Math.round(ageSeconds));
  const updated =
    seconds < 60
      ? relativeTime.format(-seconds, "second")
      : seconds < 3600
        ? relativeTime.format(-Math.round(seconds / 60), "minute")
        : seconds < 86400
          ? relativeTime.format(-Math.round(seconds / 3600), "hour")
          : relativeTime.format(-Math.round(seconds / 86400), "day");
  return (
    <article
      data-context-note={note.id}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, a, select, textarea")) return;
        onSelect();
      }}
      onKeyDown={(event) => {
        if (
          (event.key === "Enter" || event.key === " ") &&
          event.target === event.currentTarget
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`note-card note-card-compact ${selected ? "selected" : ""}`}
    >
      <div className="note-card-title">
        <h2>{note.title || "Untitled Note"}</h2>
        <button
          className={`card-pin ${note.pinned ? "is-pinned" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned();
          }}
          aria-label={note.pinned ? "Unpin Note" : "Pin Note"}
          data-tooltip={note.pinned ? "Unpin Note" : "Pin Note"}
        >
          <Icon name="pin" size={14} />
        </button>
      </div>
      {note.body.trim() ? (
        <div className="note-card-preview">
          <MarkdownPreview value={note.body} />
        </div>
      ) : <p className="note-card-empty">No additional text</p>}
      <div className="card-meta">
        {note.folderId && folderConfig && (
            <span
              className={`folder-chip folder-chip-${folderConfig?.color ?? "violet"}`}
              data-tooltip={folderConfig.name}
            >
              <span className="chip-dot" />
              <span className="card-folder-name">{folderConfig.name}</span>
            </span>
        )}
        {!note.deletedAt && reminder?.dueAt && <button type="button" className="note-reminder-badge"
          data-tooltip={`Reminder: ${formatReminderTime(reminder.dueAt)} · Click to edit`} onClick={onEditReminder} aria-label={`Edit reminder: ${formatReminderTime(reminder.dueAt)}`}>
          <Bell size={12} /><span>{formatReminderTime(reminder.dueAt)}</span>
        </button>}
        <span className="card-updated" data-tooltip={`Last modified: ${new Date(note.updatedAt).toLocaleString(undefined, { hourCycle: "h23" })}`}>{updated}</span>
      </div>
    </article>
  );
}
