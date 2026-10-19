import { editTextarea } from './textareaEdit';
import type { MarkdownAction } from "./EditorToolbar";
import type { KeyboardEvent } from "react";
import { codeFenceFor, openingCodeFence, closesCodeFence, insideCodeFence } from '../../features/notes/codeFences';

export function indentCode(event: KeyboardEvent<HTMLTextAreaElement>, onChange: (value: string) => void) {
  if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
  const input = event.currentTarget, value = input.value;
  const start = input.selectionStart, end = input.selectionEnd;
  if (!insideCodeFence(value, start) || !insideCodeFence(value, end)) return;
  event.preventDefault();
  if (start === end && !event.shiftKey) {
    editTextarea(input, value.slice(0, start) + '  ' + value.slice(end), onChange, start + 2);
    return;
  }
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const lastPosition = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = value.indexOf('\n', lastPosition);
  const lineEnd = nextBreak < 0 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  let firstDelta = 0, totalDelta = 0;
  const replacement = lines.map((line, index) => {
    const changed = event.shiftKey ? line.replace(/^(?:\t| {1,2})/, '') : `  ${line}`;
    const delta = changed.length - line.length;
    if (index === 0) firstDelta = delta;
    totalDelta += delta;
    return changed;
  }).join('\n');
  editTextarea(input, value.slice(0, lineStart) + replacement + value.slice(lineEnd), onChange,
    Math.max(lineStart, start + firstDelta), Math.max(lineStart, end + totalDelta));
}

export function continueMarkdownList(event: KeyboardEvent<HTMLTextAreaElement>, onChange: (value: string) => void) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || event.nativeEvent.isComposing) return;
  const input = event.currentTarget;
  const value = input.value;
  const start = input.selectionStart;
  if (insideCodeFence(value, start)) return;
  const end = input.selectionEnd;
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = value.indexOf("\n", start);
  const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  const match = line.match(/^([ \t]*)([-*+]|(\d+)([.)]))[ \t]+(?:\[([ xX])\][ \t]+)?(.*)$/);
  if (!match || start < lineStart + match[0].length - match[6].length) return;
  event.preventDefault();
  let next: string;
  let caret: number;
  if (!match[6].trim()) {
    next = value.slice(0, lineStart) + match[1] + value.slice(lineEnd);
    caret = lineStart + match[1].length;
  } else {
    const marker = match[3] ? `${Number(match[3]) + 1}${match[4]}` : match[2];
    const prefix = `\n${match[1]}${marker} ${match[5] !== undefined ? "[ ] " : ""}`;
    next = value.slice(0, start) + prefix + value.slice(end);
    caret = start + prefix.length;
  }
  editTextarea(input, next, onChange, caret);
  requestAnimationFrame(() => {
    if (!input.isConnected) return;
    input.setSelectionRange(caret, caret);
  });
}

const inlineDelimiters: Partial<Record<MarkdownAction, [string, string]>> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["<u>", "</u>"],
  code: ["`", "`"],
  link: ["[", "](https://)"],
};

function trimMarkdownMarkers(value: string, start: number, end: number) {
  let contentStart = start;
  let contentEnd = end;
  const firstLineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const prefix = value.slice(firstLineStart, start);
  const listPrefixLength =
    prefix.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/)?.[0].length ?? 0;
  contentStart = Math.max(contentStart, firstLineStart + listPrefixLength);
  while (contentStart < contentEnd && /\s/.test(value[contentStart]))
    contentStart++;
  while (contentEnd > contentStart && /\s/.test(value[contentEnd - 1]))
    contentEnd--;
  return { contentStart, contentEnd };
}

function delimiterRange(
  value: string,
  contentStart: number,
  contentEnd: number,
  before: string,
  after: string,
) {
  let left = contentStart;
  let right = contentEnd;
  while (left < right && /\s/.test(value[left])) left++;
  while (right > left && /\s/.test(value[right - 1])) right--;
  const startsWith = value.slice(left - before.length, left) === before;
  const endsWith = value.slice(right, right + after.length) === after;
  return startsWith && endsWith
    ? {
        left: left - before.length,
        right: right + after.length,
        contentStart: left,
        contentEnd: right,
      }
    : null;
}

export function applyMarkdownAction(
  input: HTMLTextAreaElement | null,
  value: string,
  action: MarkdownAction,
  onChange: (value: string) => void,
) {
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = value.indexOf("\n", start);
  const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
  const currentLine = value.slice(lineStart, lineEnd);
  let next: string;
  let selectionStart = start;
  let selectionEnd = end;
  if (action === 'codeBlock' || (action === 'code' && /[\r\n]/.test(value.slice(start, end)))) {
    const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const blockStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = value.indexOf('\n', effectiveEnd);
    const blockEnd = nextBreak < 0 ? value.length : nextBreak;
    let content = value.slice(blockStart, blockEnd);
    let replaceStart = blockStart;
    let replaceEnd = blockEnd;
    let unwrap = false;
    const lines = content.split('\n');
    const includedFence = openingCodeFence(lines[0]);
    if (includedFence && lines.length > 1 && closesCodeFence(lines.at(-1)!, includedFence)) {
      content = lines.slice(1, -1).join('\n'); unwrap = true;
    } else if (blockStart > 0 && blockEnd < value.length) {
      const previousStart = blockStart < 2 ? 0 : value.lastIndexOf('\n', blockStart - 2) + 1;
      const previousFence = openingCodeFence(value.slice(previousStart, blockStart - 1));
      const followingEnd = value.indexOf('\n', blockEnd + 1);
      const followingLine = value.slice(blockEnd + 1, followingEnd < 0 ? value.length : followingEnd);
      if (previousFence && closesCodeFence(followingLine, previousFence)) {
        replaceStart = previousStart; replaceEnd = followingEnd < 0 ? value.length : followingEnd; unwrap = true;
      }
    }
    const fence = codeFenceFor(content);
    const insertion = unwrap ? content : `${fence}\n${content}\n${fence}`;
    next = value.slice(0, replaceStart) + insertion + value.slice(replaceEnd);
    selectionStart = replaceStart + (unwrap ? 0 : fence.length + 1);
    selectionEnd = selectionStart + content.length;
    editTextarea(input, next, onChange, selectionStart, selectionEnd);
    requestAnimationFrame(() => { if (input.isConnected) { input.focus({ preventScroll: true }); input.setSelectionRange(selectionStart, selectionEnd); } });
    return;
  }
  if (action === "todo") {
    const prefixMatch = currentLine.match(/^(\s*)(?:[-*+]\s+\[([ xX])\]\s+|[-*+]\s+)?(.*)$/);
    if (!prefixMatch) return;
    const indent = prefixMatch[1];
    const checked = prefixMatch[2];
    const body = prefixMatch[3];
    const replacement = checked === undefined ? `${indent}- [ ] ${body}` : `${indent}${body}`;
    next = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;
    selectionStart = lineStart + indent.length + (checked === undefined ? 6 : 0);
    selectionEnd = lineStart + replacement.length;
    editTextarea(input, next, onChange, selectionStart, selectionEnd);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(selectionStart, selectionEnd);
    });
    return;
  }

  if (["heading1", "heading2", "heading3", "bullet", "number", "quote"].includes(action)) {
    const marker =
      action === "heading1"
        ? "# "
        : action === "heading2"
          ? "## "
          : action === "heading3"
            ? "### "
          : action === "bullet"
            ? "- "
          : action === "number"
            ? "1. "
            : "> ";
    const existing =
      currentLine.match(/^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+)/)?.[0] ?? "";
    const content = existing ? currentLine.slice(existing.length) : currentLine;
    const replacement = existing === marker ? content : `${marker}${content}`;
    next = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;
    selectionStart = lineStart + (existing === marker ? 0 : marker.length);
    selectionEnd = lineStart + replacement.length;
  } else {
    const [before, after] = inlineDelimiters[action] ?? ["", ""];
    const range = trimMarkdownMarkers(value, start, end);
    const hasUsableSelection = range.contentEnd > range.contentStart;
    const content = hasUsableSelection
      ? value.slice(range.contentStart, range.contentEnd)
      : action === "link"
        ? "link text"
        : "text";
    const existing = hasUsableSelection
      ? delimiterRange(
          value,
          range.contentStart,
          range.contentEnd,
          before,
          after,
        )
      : null;
    const wraps = Boolean(existing);
    const replaceStart = existing?.left ?? range.contentStart;
    const replaceEnd = existing?.right ?? range.contentEnd;
    const insertion = wraps
      ? value.slice(existing!.contentStart, existing!.contentEnd)
      : `${before}${content}${after}`;
    next = `${value.slice(0, replaceStart)}${insertion}${value.slice(replaceEnd)}`;
    selectionStart = replaceStart + (wraps ? 0 : before.length);
    selectionEnd = selectionStart + content.length;
  }

  editTextarea(input, next, onChange, selectionStart, selectionEnd);
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);
  });
}
