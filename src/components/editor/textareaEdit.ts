// Chromium's insertText command keeps programmatic Markdown edits in the same
// undo history as typing/paste. Fall back explicitly when it is unavailable.
export function editTextarea(input: HTMLTextAreaElement, next: string, onChange: (value: string) => void, selectionStart?: number, selectionEnd = selectionStart) {
  const previous = input.value;
  if (previous === next) return;
  let left = 0;
  while (left < previous.length && left < next.length && previous[left] === next[left]) left++;
  let right = 0;
  while (right < previous.length - left && right < next.length - left && previous[previous.length - 1 - right] === next[next.length - 1 - right]) right++;
  input.focus({ preventScroll: true });
  input.setSelectionRange(left, previous.length - right);
  let inserted = false;
  try { inserted = document.execCommand('insertText', false, next.slice(left, next.length - right)); } catch { /* Non-Chromium fallback below. */ }
  if (!inserted || input.value !== next) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, next);
  }
  onChange(next);
  if (selectionStart !== undefined) input.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
}

export function pasteMarkdown(event: React.ClipboardEvent<HTMLTextAreaElement>, onChange: (value: string) => void) {
  const text = event.clipboardData.getData('text/plain');
  // Native plain-text paste already preserves indentation and the undo stack.
  // Only intercept Windows/legacy line endings that need normalization.
  if (!text.includes('\r')) return;
  event.preventDefault();
  const input = event.currentTarget;
  const start = input.selectionStart, end = input.selectionEnd;
  const normalized = text.replace(/\r\n?/g, '\n');
  editTextarea(input, input.value.slice(0, start) + normalized + input.value.slice(end), onChange, start + normalized.length);
}
