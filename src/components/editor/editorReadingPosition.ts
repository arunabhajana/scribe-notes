export type ReadingPosition = { offset: number; viewportY: number };

// Use source lines, since rendered headings/lists have different heights from Markdown.
export function captureReadingPosition(container: HTMLElement, value: string): ReadingPosition {
  const top = container.getBoundingClientRect().top + 12;
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
    viewportY: Math.max(12, rect.top - container.getBoundingClientRect().top),
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
  mirror.remove();
  input.focus({ preventScroll: true });
  input.setSelectionRange(offset, offset);
  // The preview scrolls its outer pane; the textarea scrolls internally.
  container.scrollTop = 0;
  const inputY = input.getBoundingClientRect().top - container.getBoundingClientRect().top;
  input.scrollTop = Math.max(0, caretY + inputY - position.viewportY);
}
