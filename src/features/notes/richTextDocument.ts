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
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor)
      nodes.push({ type: "text", text: value.slice(cursor, index) });
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
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
    if (lines[i].startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```"))
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
      const items: Array<{ type: "listItem"; content: RichTextNode[] }> = [];
      while (
        i < lines.length &&
        listPattern.test(lines[i]) &&
        Boolean(lines[i].match(listPattern)?.[2]) === ordered &&
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
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const document = value as Partial<RichTextDocument>;
  if (!Array.isArray(document.content)) return "";
  return document.content
    .map((node) => {
      if (node.type === "legacyMarkdown") return node.text;
      if (node.type === "paragraph") return inlineToMarkdown(node.content);
      if (node.type === "heading")
        return `${"#".repeat(node.attrs.level)} ${inlineToMarkdown(node.content)}`;
      if (node.type === "codeBlock")
        return `\`\`\`\n${node.content.map((item) => item.text).join("")}\n\`\`\``;
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
              `${node.type === "bulletList" ? "- " : `${index + 1}. `}${item.content.map((child) => (child.type === "paragraph" ? inlineToMarkdown(child.content) : "")).join("")}`,
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
