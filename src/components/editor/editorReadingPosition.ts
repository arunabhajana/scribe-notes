export type ReadingPosition = { offset: number; viewportY: number };

// Keep source offsets while removing the syntax hidden by the preview renderer.
function visibleSourceOffsets(source: string, code: boolean) {
  let characters = source.split("").map((text, offset) => ({ text, offset }));
  const removeSyntax = (pattern: RegExp, contentGroup: number, preservePrefix = false) => {
    const text = characters.map((character) => character.text).join("");
    for (const match of [...text.matchAll(pattern)].reverse()) {
      const start = match.index;
      const prefix = preservePrefix ? match[1].length : 0;
      const contentStart = match[0].indexOf(match[contentGroup], prefix + 1);
      if (contentStart < 0) continue;
      const kept = characters.slice(start + contentStart, start + contentStart + match[contentGroup].length);
      characters.splice(start, match[0].length, ...characters.slice(start, start + prefix), ...kept);
    }
  };
  if (!code) {
    const prefix = source.match(/^(?:#{1,6}\s+|\s*>\s?|\s*[-*+]\s+\[[ xX]\]\s+|[ \t]*(?:[-*+]|\d+[.)])[ \t]+)/)?.[0].length ?? 0;
    characters = characters.slice(prefix);
    removeSyntax(/`([^`\n]+)`/g, 1);
    removeSyntax(/<u>(.+?)<\/u>/g, 1);
    removeSyntax(/\*\*([^*\n]+)\*\*/g, 1);
    removeSyntax(/__([^_\n]+)__/g, 1);
    removeSyntax(/(^|[^*])\*([^*\n]+)\*/g, 2, true);
    removeSyntax(/(^|[^_])_([^_\n]+)_/g, 2, true);
    removeSyntax(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, 1);
  }
  return characters;
}

export function captureClickedPosition(container: HTMLElement, value: string, x: number, y: number): ReadingPosition {
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const range = documentWithCaret.caretRangeFromPoint?.(x, y);
  const caret = range ? { offsetNode: range.startContainer, offset: range.startOffset } : documentWithCaret.caretPositionFromPoint?.(x, y);
  const element = caret?.offsetNode.nodeType === Node.ELEMENT_NODE ? caret.offsetNode as Element : caret?.offsetNode.parentElement;
  const anchor = element?.closest<HTMLElement>("[data-source-line]");
  if (!caret || !anchor || !container.contains(anchor)) return captureReadingPosition(container, value);
  const source = [...value.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)][Number(anchor.dataset.sourceLine)];
  if (!source) return captureReadingPosition(container, value);
  const before = document.createRange();
  before.selectNodeContents(anchor);
  before.setEnd(caret.offsetNode, caret.offset);
  const visibleOffset = before.toString().length;
  const raw = source[0].replace(/[\r\n]+$/, "");
  const characters = visibleSourceOffsets(raw, Boolean(anchor.closest("pre")));
  const offset = characters[visibleOffset]?.offset ?? (characters.at(-1)?.offset ?? -1) + 1;
  return { offset: (source.index ?? 0) + offset, viewportY: y - container.getBoundingClientRect().top };
}

// Use source lines, since rendered headings/lists have different heights from Markdown.
export function captureReadingPosition(container: HTMLElement, value: string): ReadingPosition {
  const containerTop = container.getBoundingClientRect().top;
  const toolbarBottom = container.querySelector<HTMLElement>(".note-reading-toolbar")?.getBoundingClientRect().bottom ?? containerTop;
  const top = Math.max(containerTop, toolbarBottom) + 12;
  const bottom = container.getBoundingClientRect().bottom;
  const lines = [...container.querySelectorAll<HTMLElement>("[data-source-line]")];
  const anchor = lines.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > top && rect.top < bottom;
  }) ?? lines.at(-1);
  if (!anchor) return { offset: 0, viewportY: 12 };
  const sourceLines = [...value.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)];
  const source = sourceLines[Number(anchor.dataset.sourceLine)];
  const rect = anchor.getBoundingClientRect();
  const lineHeight = Number.parseFloat(getComputedStyle(anchor).lineHeight) || 20;
  const wrappedRows = Math.max(1, Math.round(rect.height / lineHeight));
  const hiddenRows = Math.min(wrappedRows - 1, Math.max(0, Math.floor((top - rect.top) / lineHeight)));
  const text = source?.[0].replace(/[\r\n]+$/, "") ?? "";
  return {
    offset: (source?.index ?? 0) + Math.floor(text.length * hiddenRows / wrappedRows),
    viewportY: Math.max(top - containerTop, rect.top - containerTop),
  };
}

export function restoreReadingPosition(container: HTMLElement, input: HTMLTextAreaElement, position: ReadingPosition) {
  const offset = Math.min(position.offset, input.value.length);
  const style = getComputedStyle(input);
  const mirror = document.createElement("div");
  for (const property of ["font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "word-spacing", "text-indent", "tab-size", "padding", "box-sizing", "word-break", "overflow-wrap"]) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, { position: "fixed", top: "0", left: "0", visibility: "hidden", pointerEvents: "none", width: `${input.clientWidth}px`, whiteSpace: "pre-wrap" });
  mirror.textContent = input.value.slice(0, offset);
  const caret = document.createElement("span");
  caret.textContent = "\u200b";
  mirror.append(caret);
  document.body.append(mirror);
  const caretY = caret.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
  const caretX = caret.getBoundingClientRect().left - mirror.getBoundingClientRect().left;
  mirror.remove();
  input.focus({ preventScroll: true });
  input.setSelectionRange(offset, offset);
  // The preview scrolls its outer pane; the textarea scrolls internally.
  container.scrollTop = 0;
  const inputY = input.getBoundingClientRect().top - container.getBoundingClientRect().top;
  const lineHeight = Number.parseFloat(style.lineHeight) || 24;
  const desiredY = Math.max(inputY + lineHeight, Math.min(inputY + input.clientHeight - lineHeight * 2, position.viewportY));
  input.scrollTop = Math.max(0, caretY + inputY - desiredY);
  // Long unwrapped code lines also need their insertion point visible horizontally.
  input.scrollLeft = Math.max(0, caretX - input.clientWidth + 24);
}
