import { useEffect, type RefObject } from "react";
import type { KeyboardEvent } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import { Pencil } from "lucide-react";
import { continueMarkdownList } from "./markdownFormatting";

export function NoteBodyEditor({
  value,
  preview,
  inputRef,
  onChange,
  onKeyDown,
  readOnly = false,
  onBeginEdit,
}: {
  value: string;
  preview: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean;
  onBeginEdit: () => void;
}) {
  useEffect(() => {
    if (!preview && !readOnly && inputRef.current) {
      inputRef.current.focus();
      const end = inputRef.current.value.length;
      inputRef.current.setSelectionRange(end, end);
    }
  }, [preview, readOnly, inputRef]);
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown(event);
    if (!readOnly) continueMarkdownList(event, onChange);
  };
  const toggleTask = (lineIndex: number) => {
    if (readOnly) return;
    const lines = value.split("\n");
    const line = lines[lineIndex];
    const task = line?.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/);
    if (!task) return;
    lines[lineIndex] = `${task[1]}${task[2].toLowerCase() === "x" ? " " : "x"}${task[3]}`;
    onChange(lines.join("\n"));
  };
  return (
    <div className="editor-scroll">
      <article className={`editor-content ${preview ? "is-viewing" : "is-editing"}`}>
        {preview ? (
          <div
            className={`editor-body-view ${readOnly ? "is-readonly" : "is-clickable"}`}
            role={readOnly ? undefined : "group"}
            tabIndex={readOnly ? undefined : 0}
            aria-label={readOnly ? undefined : "Note content. Click to edit."}
            onClick={(event) => {
              if (readOnly || (event.target as HTMLElement).closest("a, button, input")) return;
              onBeginEdit();
            }}
            onKeyDown={(event) => {
              if (
                !readOnly &&
                !(event.target as HTMLElement).closest("a, input") &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onBeginEdit();
              }
            }}
          >
            <MarkdownPreview
              value={value}
              onToggleTask={readOnly ? undefined : toggleTask}
            />
            {!readOnly && (
              <span className="editor-edit-hint body-edit-hint" aria-hidden="true">
                <Pencil size={14} />
                <span>Click to edit</span>
              </span>
            )}
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
            placeholder="Start writing your note..."
            spellCheck
          />
        )}
      </article>
    </div>
  );
}
