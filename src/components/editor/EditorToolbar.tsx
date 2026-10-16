import {
  Bold,
  Code2,
  SquareCode,
  CheckSquare,
  BookOpen,
  Pencil,
  Heading1,
  Heading2,
  Heading3,
  Underline,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./editorToolbar.css";
import {
  getAltModifierLabel,
  getModifierLabel,
} from "../../features/shortcuts/keyboardShortcuts";

export type MarkdownAction =
  | "bold"
  | "italic"
  | "underline"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "number"
  | "todo"
  | "quote"
  | "code"
  | "codeBlock"
  | "link";

export function EditorToolbar({
  preview,
  onTogglePreview,
  onAction,
  className = "",
  disabled = false,
  editModeShortcut,
}: {
  preview: boolean;
  onTogglePreview: () => void;
  onAction: (action: MarkdownAction) => void;
  className?: string;
  disabled?: boolean;
  editModeShortcut?: string;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const pane = toolbar?.closest<HTMLElement>(".editor-pane");
    const content = pane?.querySelector<HTMLElement>(".note-reading-content");
    const toggle = toolbar?.querySelector<HTMLElement>(".markdown-view-toggle");
    if (!toolbar || !pane || !content || !toggle) return;
    const align = () => {
      const toolbarPadding = Number.parseFloat(getComputedStyle(toolbar).paddingRight) || 0;
      const contentPadding = Number.parseFloat(getComputedStyle(content).paddingRight) || 0;
      const rightEdge = content.getBoundingClientRect().right - contentPadding;
      toggle.style.marginRight = `${Math.max(0, toolbar.getBoundingClientRect().right - toolbarPadding - rightEdge)}px`;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(pane);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  const modifier = getModifierLabel();
  const altModifier = getAltModifierLabel();
  const button = (
    label: string,
    action: MarkdownAction,
    icon: ReactNode,
    shortcut = "",
  ) => (
    <button
      type="button"
      className="format-button"
      data-tooltip={`${label}${shortcut ? ` · ${modifier} + ${shortcut}` : ""}`}
      aria-label={label}
      disabled={preview || disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onAction(action)}
    >
      {icon}
    </button>
  );
  return (
    <div
      ref={toolbarRef}
      className={`format-toolbar format-toolbar-refined ${className}`}
      role="toolbar"
      aria-label="Markdown formatting"
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0 || !buttons.length) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }}
    >
      <div className="format-tools">
      <div className="format-group" role="group" aria-label="Headings">
        {button(
          "Heading 1",
          "heading1",
          <Heading1 size={16} />,
          `${altModifier} + 1`,
        )}
        {button(
          "Heading 2",
          "heading2",
          <Heading2 size={16} />,
          `${altModifier} + 2`,
        )}
        {button("Heading 3", "heading3", <Heading3 size={16} />, `${altModifier} + 3`)}
      </div>
      <div className="format-group" role="group" aria-label="Text emphasis">
        {button("Bold", "bold", <Bold size={15} />, "B")}
        {button("Italic", "italic", <Italic size={15} />, "I")}
        {button("Underline", "underline", <Underline size={15} />, "U")}
      </div>
      <div className="format-group" role="group" aria-label="Lists">
        {button("Bulleted list", "bullet", <List size={16} />)}
        {button("Numbered list", "number", <ListOrdered size={16} />)}
        {button("To-do list", "todo", <CheckSquare size={16} />)}
      </div>
      <div className="format-group" role="group" aria-label="Insert quote, code or link">
        {button("Quote", "quote", <Quote size={15} />)}
        {button("Inline code", "code", <Code2 size={15} />)}
        {button("Code block", "codeBlock", <SquareCode size={15} />)}
        {button("Link", "link", <Link2 size={15} />, "K")}
      </div>
      </div>
      <div className="format-group markdown-view-toggle">
        <button
          type="button"
          className={`format-button ${preview ? "active" : ""}`}
          disabled={disabled}
          onClick={onTogglePreview}
          data-tooltip={`${preview ? "Edit the note" : "Switch to reading mode"}${editModeShortcut ? ` · ${editModeShortcut}` : ""}`}
          aria-label={preview ? "Edit note" : "Switch to reading mode"}
        >
          {preview ? <Pencil size={15} /> : <BookOpen size={15} />}
          <span>{preview ? "Edit" : "Reading mode"}</span>
        </button>
      </div>
    </div>
  );
}
