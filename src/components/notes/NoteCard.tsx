import { useLayoutEffect, useRef, useState } from "react";
import type { Note, NoteFolder } from "../../types/note";
import { Icon } from "../Icon";
import { MarkdownPreview } from "../editor/MarkdownPreview";

export function NoteCard({
  note,
  folderConfig,
  selected,
  onSelect,
  onTogglePinned,
}: {
  note: Note;
  folderConfig?: NoteFolder;
  selected: boolean;
  onSelect: () => void;
  onTogglePinned: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewOverflows, setPreviewOverflows] = useState(false);
  useLayoutEffect(() => {
    const previewElement = previewRef.current;
    if (!previewElement) return;
    const measureOverflow = () => {
      const measurement = previewElement.cloneNode(true) as HTMLDivElement;
      const markdown = measurement.firstElementChild as HTMLElement | null;
      measurement.classList.remove("has-overflow");
      Object.assign(measurement.style, {
        position: "fixed",
        left: "-10000px",
        top: "0",
        width: `${previewElement.clientWidth}px`,
        height: "auto",
        minHeight: "0",
        maxHeight: "none",
        overflow: "visible",
        flex: "none",
        visibility: "hidden",
        pointerEvents: "none",
      });
      if (markdown) {
        Object.assign(markdown.style, {
          display: "block",
          height: "auto",
          maxHeight: "none",
          overflow: "visible",
          webkitLineClamp: "unset",
          lineClamp: "unset",
          webkitMaskImage: "none",
          maskImage: "none",
          fontWeight: "400",
        });
      }
      previewElement.parentElement?.appendChild(measurement);
      const overflows = measurement.scrollHeight > previewElement.clientHeight + 1;
      measurement.remove();
      setPreviewOverflows((previous) =>
        previous === overflows ? previous : overflows,
      );
    };
    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(previewElement);
    if (previewElement.firstElementChild)
      observer.observe(previewElement.firstElementChild);
    return () => observer.disconnect();
  }, [note.body]);

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
      className={`note-card ${selected ? "selected" : ""}`}
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
        <div
          ref={previewRef}
          className={`note-card-preview ${previewOverflows ? "has-overflow" : ""}`}
        >
          <MarkdownPreview value={note.body} />
        </div>
      ) : <p className="note-card-empty">No additional text</p>}
      <div className="card-meta">
        <span className="card-updated">{updated}</span>
        {note.folderId && (
          <span className="folder-chip-row">
            <span
              className={`folder-chip folder-chip-${folderConfig?.color ?? "violet"}`}
            >
              <span className="chip-dot" />
              {folderConfig?.name}
            </span>
          </span>
        )}
      </div>
    </article>
  );
}
