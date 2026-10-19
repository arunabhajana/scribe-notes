import { useWritingPreferences } from "../../features/settings/writingPreferences";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import {
  ChevronDown,
  Maximize2,
  Pencil,
  Pin,
  PinOff,
  Send,
  Trash2,
  X,
  Minus,
} from "lucide-react";
import type { NoteFolder } from "../../types/note";
import { EditorToolbar, type MarkdownAction } from "../editor/EditorToolbar";
import { applyMarkdownAction, continueMarkdownList, indentCode } from "../editor/markdownFormatting";
import { MarkdownPreview } from "../editor/MarkdownPreview";
import { setMarkdownTaskCheckedAtLine } from "../../features/notes/markdownTasks";
import { isMacOS } from "../../features/shortcuts/keyboardShortcuts";
import { usePopupKeyboard } from '../../hooks/usePopupKeyboard';
import { pasteMarkdown } from '../editor/textareaEdit';
import { keepCaretVisible } from '../editor/keepCaretVisible';

type NoteDraft = {
  title: string;
  body: string;
  folderId: string | null;
  pinned: boolean;
};

export function NewNoteComposer({
  folders,
  initialFolderId = null,
  onSave,
  onClose,
  onDiscard,
  onModalActiveChange,
}: {
  folders: NoteFolder[];
  initialFolderId?: string | null;
  onSave: (draft: NoteDraft) => void;
  onClose: () => void;
  onDiscard: (draft: NoteDraft) => void;
  onModalActiveChange: (active: boolean) => void;
}) {
  const [writingPreferences] = useWritingPreferences();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const folder = folders.find((item) => item.id === folderId)?.name ?? "";
  const [pinned, setPinned] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const folderRoot = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const folderKeys = usePopupKeyboard(folderRoot, folderMenuOpen, setFolderMenuOpen);
  const [preview, setPreview] = useState(false);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const caretScrollFrame = useRef<number | null>(null);
  const scheduleCaretScroll = () => {
    if (caretScrollFrame.current !== null) cancelAnimationFrame(caretScrollFrame.current);
    caretScrollFrame.current = requestAnimationFrame(() => {
      caretScrollFrame.current = null;
      if (bodyInputRef.current && bodyScrollRef.current) keepCaretVisible(bodyInputRef.current, bodyScrollRef.current);
    });
  };
  useEffect(() => () => { if (caretScrollFrame.current !== null) cancelAnimationFrame(caretScrollFrame.current); }, []);
  const wordCount = useMemo(
    () => (body.trim() ? body.trim().split(/\s+/).length : 0),
    [body],
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || minimized) return;
      event.preventDefault();
      if (folderMenuOpen) { setFolderMenuOpen(false); folderRoot.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus(); }
      else {
        if (title.trim() || body.trim()) onDiscard({ title, body, folderId, pinned });
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [minimized, onClose, folderMenuOpen, title, body, folderId, pinned, onDiscard]);

  useEffect(() => {
    const restoreDraft = (event: Event) => {
      const destination: unknown = (event as CustomEvent<{ folderId?: string | null }>).detail?.folderId;
      if (destination === null || typeof destination === "string") setFolderId(destination);
      setMinimized(false);
      setFolderMenuOpen(false);
      onModalActiveChange(true);
    };
    const minimizeDraft = () => { setMinimized(true); setFolderMenuOpen(false); onModalActiveChange(false); };
    window.addEventListener("scribe:restore-note-draft", restoreDraft);
    window.addEventListener("scribe:minimize-note-draft", minimizeDraft);
    return () => {
      window.removeEventListener("scribe:restore-note-draft", restoreDraft);
      window.removeEventListener("scribe:minimize-note-draft", minimizeDraft);
    };
  }, [onModalActiveChange]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ title, body, folderId, pinned });
  };
  const discardOrKeepDraft = () => {
    if (title.trim() || body.trim())
      onDiscard({ title, body, folderId, pinned });
    onClose();
  };

  const minimizeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.target === event.currentTarget) {
      setFolderMenuOpen(false);
      setMinimized(true);
      onModalActiveChange(false);
    }
  };
  const toggleMinimized = () => {
    onModalActiveChange(minimized);
    setMinimized(!minimized);
  };
  const applyAction = (action: MarkdownAction) => {
    applyMarkdownAction(bodyInputRef.current, body, action, setBody);
    scheduleCaretScroll();
  };
  const handleFormattingKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    scheduleCaretScroll();
    continueMarkdownList(event, setBody);
    indentCode(event, setBody);
    if (!(isMacOS() ? event.metaKey : event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const action: MarkdownAction | null =
      !event.altKey && !event.shiftKey && key === "b"
        ? "bold"
        : !event.altKey && !event.shiftKey && key === "i"
          ? "italic"
          : !event.altKey && !event.shiftKey && key === "u"
            ? "underline"
          : !event.altKey && !event.shiftKey && key === "k"
            ? "link"
            : event.altKey && !event.shiftKey && key === "1"
              ? "heading1"
              : event.altKey && !event.shiftKey && key === "2"
                ? "heading2"
                : event.altKey && !event.shiftKey && key === "3"
                  ? "heading3"
                : null;
    if (!action) return;
    event.preventDefault();
    applyAction(action);
  };

  return (
    <div
      className={`compose-layer ${minimized ? "is-minimized" : ""}`}
      onClick={minimizeOnBackdrop}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <form ref={formRef} onKeyDown={event => {
        if (event.key !== 'Tab' || minimized || event.defaultPrevented) return;
        const elements = [...formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []].filter(element => element.getClientRects().length > 0);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
        className="composer-window"
        onSubmit={submit}
        role="dialog"
        aria-modal={!minimized}
        aria-label="Create a Note"
      >
        <header className="composer-header">
          <div className="composer-heading">
            <span className="composer-mark">
              <Pencil size={14} />
            </span>
            <div>
              <strong>
                {minimized
                  ? `Draft: ${title.trim() || "No title"}`
                  : "New Note"}
              </strong>
              <span>{folder ? `In ${folder}` : "A new thought"}</span>
            </div>
          </div>
          <div className="composer-window-actions">
            <button
              type="button"
              className="composer-control"
              onClick={toggleMinimized}
              aria-label={minimized ? "Restore draft" : "Minimize draft"}
              data-tooltip={minimized ? "Restore draft" : "Minimize draft"}
            >
              {minimized ? <Maximize2 size={13} /> : <Minus size={14} />}
            </button>
            <button
              type="button"
              className="composer-control composer-close"
              onClick={discardOrKeepDraft}
              aria-label="Close and keep as draft"
              data-tooltip="Close and keep as draft · Escape"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div ref={bodyScrollRef} className="composer-body">
          <div className="composer-folder-row">
            <label>Folder</label>
            <div className="composer-folder-picker" ref={folderRoot} onKeyDown={folderKeys}>
              <button
                type="button"
                className={`composer-folder-trigger ${folderMenuOpen ? "is-open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={folderMenuOpen}
                onClick={() => setFolderMenuOpen((value) => !value)}
              >
                <span>{folder || "No folder"}</span>
                <ChevronDown size={14} />
              </button>
              {folderMenuOpen && (
                <>
                  <button
                    className="composer-menu-dismiss"
                    type="button"
                    aria-label="Close folder menu"
                    onClick={() => setFolderMenuOpen(false)}
                  />
                  <div
                    className="composer-folder-menu"
                    role="listbox"
                    aria-label="Choose folder"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={!folder}
                      className={!folder ? "is-selected" : ""}
                      onClick={() => {
                        setFolderId(null);
                        setFolderMenuOpen(false);
                      }}
                    >
                      No folder
                    </button>
                    {folders.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={folderId === item.id}
                        className={folderId === item.id ? "is-selected" : ""}
                        onClick={() => {
                          setFolderId(item.id);
                          setFolderMenuOpen(false);
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <input
            className="composer-title-input"
            data-tour="note-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give your Note a title"
            aria-label="Note title"
          />
          <EditorToolbar
            className="composer-format-toolbar"
            preview={preview}
            onTogglePreview={() => setPreview((value) => !value)}
            onAction={applyAction}
          />
          {preview ? (
            <div className="composer-content-preview">
              <MarkdownPreview value={body} onToggleTask={(lineIndex, checked) => {
                setBody((current) => setMarkdownTaskCheckedAtLine(current, lineIndex, checked));
              }} />
            </div>
          ) : null}
            <textarea hidden={preview}
              ref={bodyInputRef}
              className="composer-content-input"
              data-tour="note-content"
              value={body}
              onChange={(event) => { setBody(event.target.value); scheduleCaretScroll(); }}
              onCompositionEnd={scheduleCaretScroll}
              onPaste={event => { pasteMarkdown(event, setBody); scheduleCaretScroll(); }}
              onKeyDown={handleFormattingKeyDown}
              placeholder="Start writing..."
              aria-label="Note content (Markdown)"
              aria-description="Inside a fenced code block, Tab indents and Shift+Tab unindents. Escape keeps your work as a draft and closes."
              spellCheck={writingPreferences.spellcheck}
            />
        </div>

        <footer className="composer-footer">
          <div className="composer-footer-meta">
            <button
              type="button"
              className={`composer-pin ${pinned ? "is-pinned" : ""}`}
              onClick={() => setPinned((value) => !value)}
              data-tooltip={pinned ? "Unpin after saving" : "Pin after saving"}
            >
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
              <span>{pinned ? "Pinned" : "Pin Note"}</span>
            </button>
            <span className="composer-count">
              {wordCount} {wordCount === 1 ? "word" : "words"} <i />{" "}
              {body.length} characters
            </span>
          </div>
          <div className="composer-footer-actions">
            <button
              type="button"
              className="composer-discard"
              onClick={discardOrKeepDraft}
              data-tooltip="Discard this draft"
            >
              <Trash2 size={15} />
              <span>Discard</span>
            </button>
            <button
              type="submit"
              className="composer-save"
              data-tour="save-note"
              data-tooltip="Save Note"
            >
              <span>Save Note</span>
              <Send size={14} />
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
