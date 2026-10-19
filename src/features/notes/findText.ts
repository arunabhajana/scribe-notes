export const FIND_LIMIT = 5000;
export function findText(text: string, query: string, matchCase = false) {
  const matches: Array<{ start: number; end: number }> = [];
  if (!query) return matches;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, matchCase ? 'gu' : 'giu');
  for (const match of text.matchAll(pattern)) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (matches.length >= FIND_LIMIT) break;
  }
  return matches;
}

// Highlight text nodes only. Never interpret the query as HTML or touch URLs,
// task attributes or the existing Markdown sanitizer's output structure.
export function highlightMarkdown(html: string, query: string, matchCase: boolean) {
  if (!query) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const groups = new Map<Element | null, Text[]>();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('[data-preview-extra]')) continue;
    const line = node.parentElement?.closest('[data-source-line]') ?? node.parentElement;
    const group = groups.get(line) ?? [];
    group.push(node); groups.set(line, group);
  }
  let count = 0;
  for (const nodes of groups.values()) {
    const text = nodes.map(node => node.data).join('');
    const matches = findText(text, query, matchCase).slice(0, FIND_LIMIT - count);
    if (!matches.length) continue;
    let offset = 0;
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      let position = 0;
      matches.forEach((match, index) => {
        const start = Math.max(0, match.start - offset), end = Math.min(node.length, match.end - offset);
        if (end <= start) return;
        fragment.append(node.data.slice(position, start));
        const mark = document.createElement('mark');
        mark.className = 'note-find-match';
        mark.dataset.noteMatch = String(count + index);
        mark.textContent = node.data.slice(start, end);
        fragment.append(mark);
        position = end;
      });
      offset += node.length;
      if (position) { fragment.append(node.data.slice(position)); node.replaceWith(fragment); }
    }
    count += matches.length;
    if (count >= FIND_LIMIT) break;
  }
  return template.innerHTML;
}
