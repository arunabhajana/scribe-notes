import { useWritingPreferences } from "../../features/settings/writingPreferences";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { KeyboardEvent } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import { BookOpen, Pencil } from "lucide-react";
import { continueMarkdownList, indentCode } from "./markdownFormatting";
import { setMarkdownTaskCheckedAtLine } from "../../features/notes/markdownTasks";
import { captureClickedPosition, captureEditingPosition, captureReadingPosition, restorePreviewPosition, restoreReadingPosition, type ReadingPosition } from "./editorReadingPosition";
import "./noteReadingView.css";
import { keepCaretVisible } from "./keepCaretVisible";
import { findText } from '../../features/notes/findText';
import type { NoteFindState } from './NoteFindBar';
import { pasteMarkdown } from './textareaEdit';

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
  find, onFindCount,
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
  find?: NoteFindState | null;
  onFindCount?: (count: number) => void;
}) {
  const [writingPreferences] = useWritingPreferences();
  const [contentHovered, setContentHovered] = useState(false);
  const statisticsBody = useDeferredValue(value);
  const readingMinutes = useMemo(() => {
  const readingText = statisticsBody.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:```[^\n]*|#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, " ")
    .replace(/<\/?u>/g, "").replace(/[*_`~]/g, "").trim();
  return readingText ? Math.max(1, Math.ceil(readingText.split(/\s+/).length / 200)) : null;
  }, [statisticsBody]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readingPosition = useRef<ReadingPosition | null>(null);
  const editingPosition = useRef<ReadingPosition | null>(null);
  const previousPreview = useRef(preview);
  const caretScrollFrame = useRef<number | null>(null);
  const lastFindNavigation = useRef('');
  const matches = useMemo(() => findText(value, find?.query ?? '', find?.matchCase), [value, find?.query, find?.matchCase]);
  useLayoutEffect(() => {
    const pane = scrollRef.current;
    if (!find || !pane) { onFindCount?.(0); lastFindNavigation.current = ''; return; }
    const navigation = JSON.stringify([find.query, find.matchCase, find.index, find.request, preview]);
    const shouldNavigate = navigation !== lastFindNavigation.current;
    lastFindNavigation.current = navigation;
    if (preview) {
      const marks = [...pane.querySelectorAll<HTMLElement>('[data-note-match]')];
      const ids = [...new Set(marks.map(mark => mark.dataset.noteMatch))];
      onFindCount?.(ids.length);
      const id = ids[Math.min(find.index, ids.length - 1)];
      const active = marks.find(mark => mark.dataset.noteMatch === id);
      marks.forEach(mark => mark.classList.toggle('is-current', mark.dataset.noteMatch === id));
      if (active && shouldNavigate) {
        const top = pane.getBoundingClientRect().top;
        pane.scrollTop += active.getBoundingClientRect().top - top - Math.min(90, pane.clientHeight / 3);
      }
    } else {
      onFindCount?.(matches.length);
      const match = matches[Math.min(find.index, matches.length - 1)];
      const input = inputRef.current;
      if (match && input && shouldNavigate) {
        const previous = document.activeElement as HTMLElement | null;
        input.focus({ preventScroll: true });
        input.setSelectionRange(match.start, match.end);
        keepCaretVisible(input, pane);
        if (previous?.isConnected && previous !== input) previous.focus({ preventScroll: true });
      }
    }
  }, [find, matches, preview, onFindCount, inputRef]);
  const scheduleCaretScroll = () => {
    if (caretScrollFrame.current !== null) cancelAnimationFrame(caretScrollFrame.current);
    caretScrollFrame.current = requestAnimationFrame(() => {
      caretScrollFrame.current = null;
      if (inputRef.current && scrollRef.current) keepCaretVisible(inputRef.current, scrollRef.current);
    });
  };
  useEffect(() => () => {
    if (caretScrollFrame.current !== null) cancelAnimationFrame(caretScrollFrame.current);
  }, []);
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
      } else {
        if (scrollRef.current && inputRef.current) editingPosition.current = captureEditingPosition(scrollRef.current, inputRef.current);
        onEndEdit();
      }
    };
    window.addEventListener("scribe:toggle-note-mode", toggle);
    return () => window.removeEventListener("scribe:toggle-note-mode", toggle);
  }, [preview, readOnly, value, onBeginEdit, onEndEdit, inputRef]);
  useLayoutEffect(() => {
    if (preview && editingPosition.current && scrollRef.current) {
      restorePreviewPosition(scrollRef.current, value, editingPosition.current);
      editingPosition.current = null;
    }
    if (preview && !previousPreview.current && (document.activeElement === document.body || document.activeElement === inputRef.current)) {
      scrollRef.current?.querySelector<HTMLElement>('.editor-body-view')?.focus({ preventScroll: true });
    }
    previousPreview.current = preview;
  }, [preview, value, inputRef]);
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
    if (!readOnly && !event.nativeEvent.isComposing) continueMarkdownList(event, onChange);
    if (!readOnly) indentCode(event, onChange);
    if (!readOnly && !['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) scheduleCaretScroll();
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
              findQuery={find?.query}
              findMatchCase={find?.matchCase}
              value={value}
              onToggleTask={readOnly ? undefined : toggleTask}
            />

          </div>
        ) : null}
          <textarea
            ref={inputRef}
            className="note-body-input"
            aria-label="Note body (Markdown)"
            aria-description="Inside a fenced code block, Tab indents and Shift+Tab unindents. Escape leaves editing."
            value={value}
            hidden={preview}
            readOnly={readOnly}
            onChange={(event) => {
              onChange(event.target.value);
              scheduleCaretScroll();
            }}
            onCompositionEnd={scheduleCaretScroll}
            onPaste={event => { pasteMarkdown(event, onChange); scheduleCaretScroll(); }}
            onKeyDown={handleKeyDown}
            placeholder="Start writing your Note..."
            spellCheck={writingPreferences.spellcheck}
          />
      </article>
    </div>
  );
}
