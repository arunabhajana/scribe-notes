// Textareas scroll internally, but their visible area can also be clipped by
// the surrounding editor pane. Keep the insertion line inside both viewports.
export function keepCaretVisible(input: HTMLTextAreaElement, pane: HTMLElement) {
  if (document.activeElement !== input) return;
  const style = getComputedStyle(input);
  const mirror = document.createElement("div");
  for (const property of ["font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "word-spacing", "text-indent", "tab-size", "padding", "border", "box-sizing", "word-break", "overflow-wrap", "text-transform"]) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, { position: "fixed", visibility: "hidden", pointerEvents: "none", width: `${input.clientWidth}px`, whiteSpace: "pre-wrap", top: "0", left: "0" });
  const offset = input.selectionDirection === "backward" ? input.selectionStart : input.selectionEnd;
  mirror.textContent = input.value.slice(0, offset);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  // Include the suffix so wrapping at the caret matches the real textarea.
  mirror.append(document.createTextNode(input.value.slice(offset)));
  document.body.append(mirror);
  const caretY = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
  mirror.remove();
  const lineHeight = Number.parseFloat(style.lineHeight) || 24;
  const margin = Math.min(24, input.clientHeight / 4);
  if (caretY < input.scrollTop + margin) input.scrollTop = Math.max(0, caretY - margin);
  else if (caretY + lineHeight > input.scrollTop + input.clientHeight - margin) {
    input.scrollTop = caretY + lineHeight - input.clientHeight + margin;
  }
  const paneRect = pane.getBoundingClientRect();
  const caretTop = input.getBoundingClientRect().top + caretY - input.scrollTop;
  if (caretTop < paneRect.top + margin) pane.scrollTop += caretTop - paneRect.top - margin;
  else if (caretTop + lineHeight > paneRect.bottom - margin) {
    pane.scrollTop += caretTop + lineHeight - paneRect.bottom + margin;
  }
}
