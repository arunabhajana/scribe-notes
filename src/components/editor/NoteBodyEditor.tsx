import { useWritingPreferences } from "../../features/settings/writingPreferences";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { KeyboardEvent } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import { BookOpen, Pencil } from "lucide-react";
import { continueMarkdownList } from "./markdownFormatting";
import { setMarkdownTaskCheckedAtLine } from "../../features/notes/markdownTasks";
import { captureClickedPosition, captureReadingPosition, restoreReadingPosition, type ReadingPosition } from "./editorReadingPosition";
import "./noteReadingView.css";

export function NoteBodyEditor({
  value,
  preview,
  inputRef,
  onChange,
  onKeyDown,
  readOnly = false,
  onBeginEdit,
  onEndEdit,
  editModeShortcut,
}: {
  value: string;
  preview: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean;
  onBeginEdit: () => void;
  onEndEdit: () => void;
  editModeShortcut: string;
}) {
  const [writingPreferences] = useWritingPreferences();
  const [contentHovered, setContentHovered] = useState(false);
  const readingText = value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:```[^\n]*|#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, " ")
    .replace(/<\/?u>/g, "").replace(/[*_`~]/g, "").trim();
  const readingMinutes = readingText ? Math.max(1, Math.ceil(readingText.split(/\s+/).length / 200)) : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const readingPosition = useRef<ReadingPosition | null>(null);
  const beginEdit = () => {
    setContentHovered(false);
    if (scrollRef.current) readingPosition.current = captureReadingPosition(scrollRef.current, value);
    onBeginEdit();
  };
  useEffect(() => {
    const toggle = () => {
      if (readOnly) return;
      if (preview) {
        if (scrollRef.current) readingPosition.current = captureReadingPosition(scrollRef.current, value);
        setContentHovered(false);
        onBeginEdit();
      } else onEndEdit();
    };
    window.addEventListener("scribe:toggle-note-mode", toggle);
    return () => window.removeEventListener("scribe:toggle-note-mode", toggle);
  }, [preview, readOnly, value, onBeginEdit, onEndEdit]);
  useLayoutEffect(() => {
    if (!preview && !readOnly && inputRef.current) {
      if (readingPosition.current && scrollRef.current) {
        restoreReadingPosition(scrollRef.current, inputRef.current, readingPosition.current);
        readingPosition.current = null;
      } else {
        inputRef.current.focus({ preventScroll: true });
      }
    }
  }, [preview, readOnly, inputRef]);
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown(event);
    if (!readOnly) continueMarkdownList(event, onChange);
  };
  const toggleTask = (lineIndex: number, checked: boolean) => {
    if (readOnly) return;
    onChange(setMarkdownTaskCheckedAtLine(value, lineIndex, checked));
  };
  return (
    <div ref={scrollRef} className="editor-scroll note-reading-scroll">
      <article className={`editor-content note-reading-content ${preview ? "is-viewing" : "is-editing"}${contentHovered ? " is-content-hovered" : ""}`}>
        {preview && <div className="note-reading-toolbar">
          <div className="note-reading-header-row">
          <div className="note-reading-summary">
            <span className="note-reading-mode" data-tooltip={readOnly ? "This note is read only" : "Reading mode · Click any text to edit"}><BookOpen size={14} />{readOnly ? "Read only" : "Reading mode"}</span>
            {readingMinutes !== null && <span className="note-reading-time" data-tooltip="Estimated reading time at 200 words per minute">{readingMinutes} min read</span>}
          </div>
          {!readOnly && <button type="button" className="note-reading-edit" aria-label={contentHovered ? "Click to edit note" : "Edit note"} onClick={beginEdit} data-tooltip={`${contentHovered ? "Click text to edit at that position" : "Edit the note"} · ${editModeShortcut}`}>
            <Pencil size={14} /><span className="note-reading-edit-label" aria-hidden="true"><span>Edit</span><span>Click to edit</span></span>
          </button>}
          </div>
        </div>}
        {preview ? (
          <div
            className={`editor-body-view ${readOnly ? "is-readonly" : "is-clickable"}`}
            role={readOnly ? undefined : "group"}
            tabIndex={readOnly ? undefined : 0}
            aria-label={readOnly ? undefined : "Note content. Click to edit."}
            onPointerEnter={(event) => { if (!readOnly && event.pointerType !== "touch") setContentHovered(true); }}
            onPointerLeave={() => setContentHovered(false)}
            onClick={(event) => {
              if (readOnly || window.getSelection()?.toString() || (event.target as HTMLElement).closest("a, button, input")) return;
              if (scrollRef.current) readingPosition.current = captureClickedPosition(scrollRef.current, value, event.clientX, event.clientY);
              setContentHovered(false);
              onBeginEdit();
            }}
            onKeyDown={(event) => {
              if (
                !readOnly &&
                !(event.target as HTMLElement).closest("a, input, button") &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                beginEdit();
              }
            }}
          >
            <MarkdownPreview
              value={value}
              onToggleTask={readOnly ? undefined : toggleTask}
            />

          </div>
        ) : (
          <textarea
            ref={inputRef}
            className="note-body-input"
            aria-label="Note body (Markdown)"
            value={value}
            readOnly={readOnly}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Start writing your Note..."
            spellCheck={writingPreferences.spellcheck}
          />
        )}
      </article>
    </div>
  );
}
