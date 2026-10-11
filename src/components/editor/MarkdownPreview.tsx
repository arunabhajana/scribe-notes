function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(escaped: string) {
  return escaped
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

function listItem(line: string) {
  const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
  if (task) return { ordered: false, task: true, checked: task[1].toLowerCase() === "x", content: task[2] };
  const match = line.match(/^[ \t]*(?:([-*+])[ \t]+|(\d+)[.)][ \t]+)(.*)$/);
  if (!match) return null;
  return { ordered: Boolean(match[2]), task: false, checked: false, content: match[3] };
}

function markdownToHtml(markdown: string, tasksInteractive: boolean) {
  const lines = escapeHtml(markdown).replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol" | "tasks"; items: Array<{ content: string; checked: boolean; line: number }> } | null = null;
  let code: string[] | null = null;
  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list)
      blocks.push(
        list.type === "tasks"
          ? `<ul class="task-list">${list.items.map((item) => {
              return `<li class="task-list-item${item.checked ? " is-checked" : ""}"><input class="task-checkbox" type="checkbox" data-task-line="${item.line}" aria-label="${item.checked ? "Mark incomplete" : "Mark complete"}: ${item.content}" ${tasksInteractive ? "" : "disabled"} ${item.checked ? "checked" : ""}><span class="task-content">${inlineMarkdown(item.content)}</span></li>`;
            }).join("")}</ul>`
          : `<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item.content)}</li>`).join("")}</${list.type}>`,
      );
    list = null;
  };

  for (const [lineIndex, line] of lines.entries()) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (code) {
        blocks.push(`<pre><code>${code.join("\n")}</code></pre>`);
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const item = listItem(line);
    if (item) {
      flushParagraph();
      const type = item.task ? "tasks" : item.ordered ? "ol" : "ul";
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push({ content: item.content, checked: item.checked, line: lineIndex });
      continue;
    }
    flushList();
    const quote = line.match(/^\s*&gt;\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  if (code) blocks.push(`<pre><code>${code.join("\n")}</code></pre>`);
  return blocks.join("");
}

export function MarkdownPreview({
  value,
  onToggleTask,
}: {
  value: string;
  onToggleTask?: (lineIndex: number, checked: boolean) => void;
}) {
  if (!value.trim())
    return (
      <div className="markdown-preview-empty">
        Your formatted note preview will appear here.
      </div>
    );
  return (
    <div
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(value, Boolean(onToggleTask)) }}
      onClick={(event) => {
        const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>(
          ".task-checkbox[data-task-line]",
        );
        if (!checkbox || !onToggleTask) return;
        event.stopPropagation();
        const lineIndex = Number(checkbox.dataset.taskLine);
        if (Number.isInteger(lineIndex)) onToggleTask(lineIndex, checkbox.checked);
      }}
    />
  );
}
