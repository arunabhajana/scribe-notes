export type CodeFence = { marker: '`' | '~'; length: number };

// Older toolbar output could attach triple backticks to both ends of code.
// Recover only paired blocks whose opening line contains code, not a language tag.
export function compactCodeBlock(lines: string[], start: number): { end: number; lines: string[] } | null {
  const opening = lines[start].match(/^ {0,3}(`{3,})(.+)$/);
  if (!opening || /^[\w#+.-]+\s*$/.test(opening[2])) return null;
  const fence = opening[1];
  const content: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = index === start ? opening[2] : lines[index];
    const trimmed = line.trimEnd();
    if (trimmed.endsWith(fence) && trimmed[trimmed.length - fence.length - 1] !== '`') {
      const last = trimmed.slice(0, -fence.length);
      if (last || index === start) content.push(last);
      return { end: index, lines: content };
    }
    content.push(line);
  }
  return null;
}

export function openingCodeFence(line: string): CodeFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { marker: match[1][0] as CodeFence['marker'], length: match[1].length };
}
export function closesCodeFence(line: string, fence: CodeFence): boolean {
  const match = line.match(/^ {0,3}(`+|~+)[ \t]*\r?$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}
export function codeFenceFor(content: string): string {
  const longest = (content.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}
export function insideCodeFence(value: string, offset: number): boolean {
  let fence: CodeFence | null = null;
  for (const line of value.slice(0, offset).split(/\r?\n/)) {
    if (fence) { if (closesCodeFence(line, fence)) fence = null; }
    else fence = openingCodeFence(line);
  }
  return fence !== null;
}
