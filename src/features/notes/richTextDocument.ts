import { openingCodeFence, closesCodeFence, codeFenceFor, compactCodeBlock } from './codeFences.ts';
export type TextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

export type RichTextNode =
  | { type: "text"; text: string; marks?: TextMark[] }
  | { type: "hardBreak" }
  | { type: "paragraph"; content: RichTextNode[] }
  | { type: "heading"; attrs: { level: 1 | 2 | 3 }; content: RichTextNode[] }
  | {
      type: "bulletList" | "orderedList";
      attrs?: { start: number };
      content: Array<{ type: "listItem"; content: RichTextNode[] }>;
    }
  | {
      type: "taskList";
      content: Array<{ type: "taskItem"; attrs: { checked: boolean }; content: RichTextNode[] }>;
    }
  | { type: "blockquote"; content: RichTextNode[] }
  | { type: "codeBlock"; content: Array<{ type: "text"; text: string }> }
  /** Used only to preserve Markdown content during the text-to-JSONB migration. */
  | { type: "legacyMarkdown"; text: string };

export type RichTextDocument = {
  type: "doc";
  version: 1;
  content: RichTextNode[];
};

function parseInline(value: string): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\][\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor)
      nodes.push({ type: "text", text: value.slice(cursor, index) });
    const token = match[0];
    const link = token.match(/^\[([^\][\n]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link)
      nodes.push({
        type: "text",
        text: link[1],
        marks: [{ type: "link", attrs: { href: link[2] } }],
      });
    else if (token.startsWith("**"))
      nodes.push({
        type: "text",
        text: token.slice(2, -2),
        marks: [{ type: "bold" }],
      });
    else if (token.startsWith("*"))
      nodes.push({
        type: "text",
        text: token.slice(1, -1),
        marks: [{ type: "italic" }],
      });
    else
      nodes.push({
        type: "text",
        text: token.slice(1, -1),
        marks: [{ type: "code" }],
      });
    cursor = index + token.length;
  }
  if (cursor < value.length)
    nodes.push({ type: "text", text: value.slice(cursor) });
  return nodes;
}

export function markdownToDocument(markdown: string): RichTextDocument {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content: RichTextNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const compact = compactCodeBlock(lines, i);
    if (compact) {
      content.push({ type: "codeBlock", content: [{ type: "text", text: compact.lines.join("\n") }] });
      i = compact.end + 1;
      continue;
    }
    const fence = openingCodeFence(lines[i]);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !closesCodeFence(lines[i], fence))
        code.push(lines[i++]);
      if (i < lines.length) i++;
      content.push({
        type: "codeBlock",
        content: [{ type: "text", text: code.join("\n") }],
      });
      continue;
    }
    const heading = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      content.push({
        type: "heading",
        attrs: { level: heading[1].length as 1 | 2 | 3 },
        content: parseInline(heading[2]),
      });
      i++;
      continue;
    }
    const taskItem = lines[i].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskItem) {
      const items: Array<{ type: "taskItem"; attrs: { checked: boolean }; content: RichTextNode[] }> = [];
      while (i < lines.length) {
        const match = lines[i].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
        if (!match) break;
        items.push({
          type: "taskItem",
          attrs: { checked: match[1].toLowerCase() === "x" },
          content: [{ type: "paragraph", content: parseInline(match[2]) }],
        });
        i++;
      }
      content.push({ type: "taskList", content: items });
      continue;
    }
    const listPattern = /^[ \t]*(?:([-*+])[ \t]+|(\d+)[.)][ \t]+)(.*)$/;
    const listItem = lines[i].match(listPattern);
    if (listItem) {
      const ordered = Boolean(listItem[2]);
      const start = ordered ? Number(listItem[2]) : 1;
      const items: Array<{ type: "listItem"; content: RichTextNode[] }> = [];
      while (
        i < lines.length &&
        listPattern.test(lines[i]) &&
        Boolean(lines[i].match(listPattern)?.[2]) === ordered &&
        (!ordered || Number(lines[i].match(listPattern)?.[2]) === start + items.length) &&
        !/^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]+/.test(lines[i])
      ) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: parseInline(
                lines[i].match(listPattern)![3],
              ),
            },
          ],
        });
        i++;
      }
      content.push({
        type: ordered ? "orderedList" : "bulletList",
        ...(ordered ? { attrs: { start } } : {}),
        content: items,
      });
      continue;
    }
    if (/^> /.test(lines[i])) {
      const quote: string[] = [];
      while (i < lines.length && /^> ?/.test(lines[i]))
        quote.push(lines[i++].replace(/^> ?/, ""));
      content.push({
        type: "blockquote",
        content: [
          { type: "paragraph", content: parseInline(quote.join("\n")) },
        ],
      });
      continue;
    }
    const paragraph = [lines[i++]];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !openingCodeFence(lines[i]) &&
      !/^(#{1,3})\s|^```|^[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+)|^> /.test(lines[i])
    )
      paragraph.push(lines[i++]);
    const inline: RichTextNode[] = [];
    paragraph.forEach((line, index) => {
      if (index) inline.push({ type: "hardBreak" });
      inline.push(...parseInline(line));
    });
    content.push({ type: "paragraph", content: inline });
  }
  return { type: "doc", version: 1, content };
}

function inlineToMarkdown(nodes: RichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type !== "text") return "";
      let text = node.text;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = `**${text}**`;
        else if (mark.type === "italic") text = `*${text}*`;
        else if (mark.type === "code") text = `\`${text}\``;
        else if (mark.type === "link") text = `[${text}](${mark.attrs.href})`;
      }
      return text;
    })
    .join("");
}

export function documentToMarkdown(value: unknown): string {
  validateDocument(value);
  if (typeof value === "string") return value;
  const document = value as Partial<RichTextDocument>;
  return document.content!
    .map((node) => {
      if (node.type === "legacyMarkdown") return node.text;
      if (node.type === "paragraph") return inlineToMarkdown(node.content);
      if (node.type === "heading")
        return `${"#".repeat(node.attrs.level)} ${inlineToMarkdown(node.content)}`;
      if (node.type === "codeBlock") {
        const text = node.content.map((item) => item.text).join("");
        const fence = codeFenceFor(text);
        return `${fence}\n${text}\n${fence}`;
      }
      if (node.type === "blockquote")
        return node.content
          .map((child) =>
            child.type === "paragraph"
              ? inlineToMarkdown(child.content)
                  .split("\n")
                  .map((line) => `> ${line}`)
                  .join("\n")
              : "",
          )
          .join("\n");
      if (node.type === "bulletList" || node.type === "orderedList")
        return node.content
          .map(
            (item, index) =>
              `${node.type === "bulletList" ? "- " : `${(node.attrs?.start ?? 1) + index}. `}${item.content.map((child) => (child.type === "paragraph" ? inlineToMarkdown(child.content) : "")).join("")}`,
          )
          .join("\n");
      if (node.type === "taskList")
        return node.content
          .map((item) => `- [${item.attrs.checked ? "x" : " "}] ${item.content.map((child) => (child.type === "paragraph" ? inlineToMarkdown(child.content) : "")).join("")}`)
          .join("\n");
      return "";
    })
    .join("\n\n");
}

// Cloud JSON is untrusted. Reject malformed documents before traversing them;
// the sync caller keeps the last durable cache rather than saving an empty note.
function validateDocument(value: unknown): void {
  const invalid = () => { throw new Error("A cloud note has unsupported content. Your local notes were kept. Contact support before retrying this note."); };
  if (typeof value === "string") { if (value.length > 10 * 1024 * 1024) invalid(); return; }
  const record = (item: unknown): Record<string, unknown> => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
    return item as Record<string, unknown>;
  };
  const doc = record(value);
  if (doc.type !== "doc" || doc.version !== 1 || !Array.isArray(doc.content)) invalid();
  const children: Record<string, string[]> = {
    doc: ["paragraph", "heading", "codeBlock", "blockquote", "bulletList", "orderedList", "taskList", "legacyMarkdown"],
    paragraph: ["text", "hardBreak"], heading: ["text", "hardBreak"], codeBlock: ["text"],
    blockquote: ["paragraph"], bulletList: ["listItem"], orderedList: ["listItem"], taskList: ["taskItem"],
    listItem: ["paragraph"], taskItem: ["paragraph"],
  };
  const stack = (doc.content as unknown[]).map((item) => ({ item, depth: 1, parent: "doc" }));
  let nodes = 0, characters = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (++nodes > 200_000 || entry.depth > 32) invalid();
    const node = record(entry.item);
    if (!children[entry.parent]?.includes(String(node.type))) invalid();
    if (node.type === "text" || node.type === "legacyMarkdown") {
      if (typeof node.text !== "string") invalid();
      characters += (node.text as string).length;
      if (characters > 10 * 1024 * 1024) invalid();
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.length > 16) invalid();
        for (const item of node.marks as unknown[]) {
          const mark = record(item);
          if (!["bold", "italic", "code", "link"].includes(String(mark.type))) invalid();
          if (mark.type === "link") {
            const href = record(mark.attrs).href;
            if (typeof href !== "string" || href.length > 8192) invalid();
            // Links expand the serialized Markdown too; count them in the output budget.
            characters += (href as string).length;
            if (characters > 10 * 1024 * 1024) invalid();
          }
        }
      }
    } else if (node.type !== "hardBreak") {
      if (!["paragraph", "heading", "codeBlock", "blockquote", "bulletList", "orderedList", "taskList", "listItem", "taskItem"].includes(String(node.type)) || !Array.isArray(node.content)) invalid();
      if (node.type === "orderedList" && node.attrs !== undefined && (!Number.isSafeInteger(record(node.attrs).start) || Number(record(node.attrs).start) < 0)) invalid();
      if (node.type === "heading" && ![1, 2, 3].includes(record(node.attrs).level as number)) invalid();
      if (node.type === "taskItem" && typeof record(node.attrs).checked !== "boolean") invalid();
      for (const item of node.content as unknown[]) stack.push({ item, depth: entry.depth + 1, parent: String(node.type) });
    }
  }
}
