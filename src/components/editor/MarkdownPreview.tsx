import { inlineLinkPreview } from "./inlineLinkPreview";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import "./linkPreviews.css";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(escaped: string) {
  const tokens: string[] = [];
  const token = (html: string) => { tokens.push(html); return `\uE000${tokens.length - 1}\uE001`; };
  return escaped
    .replace(/`([^`\n]+)`|\[([^\][\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"[\]]+)/g, (match: string, code: string | undefined, label: string | undefined, markdownUrl: string | undefined, bareUrl: string | undefined) => {
      if (code !== undefined) return token(`<code>${code}</code>`);
      const url = markdownUrl ?? bareUrl?.split(/&(?:lt|gt|quot|#39);/)[0].replace(/[),.;!?]+$/, "");
      if (!url) return match;
      const preview = inlineLinkPreview(url, label);
      return preview ? token(preview) + (bareUrl ? bareUrl.slice(url.length) : "") : match;
    })
    .replace(/&lt;u&gt;((?:(?!&lt;u&gt;|&lt;\/u&gt;)[^\n])+)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/\uE000(\d+)\uE001/g, (match, index: string) => tokens[Number(index)] ?? match);
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
  let paragraph: Array<{ text: string; line: number }> = [];
  let list: { type: "ul" | "ol" | "tasks"; items: Array<{ content: string; checked: boolean; line: number }> } | null = null;
  let code: Array<{ text: string; line: number }> | null = null;
  const codeHtml = () => code?.map((item) => `<span data-source-line="${item.line}">${item.text || "&#8203;"}</span>`).join("\n") ?? "";
  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push(`<p>${paragraph.map((item) => `<span data-source-line="${item.line}">${inlineMarkdown(item.text)}</span>`).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list)
      blocks.push(
        list.type === "tasks"
          ? `<ul class="task-list">${list.items.map((item) => {
              return `<li data-source-line="${item.line}" class="task-list-item${item.checked ? " is-checked" : ""}"><input class="task-checkbox" type="checkbox" data-task-line="${item.line}" aria-label="${item.checked ? "Mark incomplete" : "Mark complete"}: ${item.content}" ${tasksInteractive ? "" : "disabled"} ${item.checked ? "checked" : ""}><span class="task-content">${inlineMarkdown(item.content)}</span></li>`;
            }).join("")}</ul>`
          : `<${list.type}>${list.items.map((item) => `<li data-source-line="${item.line}">${inlineMarkdown(item.content)}</li>`).join("")}</${list.type}>`,
      );
    list = null;
  };

  for (const [lineIndex, line] of lines.entries()) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (code) {
        blocks.push(`<pre><code>${codeHtml()}</code></pre>`);
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push({ text: line, line: lineIndex });
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
      blocks.push(`<blockquote data-source-line="${lineIndex}">${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level} data-source-line="${lineIndex}">${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    paragraph.push({ text: line, line: lineIndex });
  }
  flushParagraph();
  flushList();
  if (code) blocks.push(`<pre><code>${codeHtml()}</code></pre>`);
  return blocks.join("");
}

export function MarkdownPreview({
  value,
  onToggleTask,
}: {
  value: string;
  onToggleTask?: (lineIndex: number, checked: boolean) => void;
}) {
  const [linkError, setLinkError] = useState("");
  if (!value.trim())
    return (
      <div className="markdown-preview-empty">
        Your formatted Note preview will appear here.
      </div>
    );
  return (
    <>
    <div
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(value, Boolean(onToggleTask)) }}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a.inline-link-preview");
        if (link) {
          event.stopPropagation();
          if (isTauri()) { event.preventDefault(); setLinkError(""); void openUrl(link.href).catch(() => setLinkError("Could not open this link. Copy its address to open it in your browser.")); }
          return;
        }
        const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>(
          ".task-checkbox[data-task-line]",
        );
        if (!checkbox || !onToggleTask) return;
        event.stopPropagation();
        const lineIndex = Number(checkbox.dataset.taskLine);
        if (Number.isInteger(lineIndex)) onToggleTask(lineIndex, checkbox.checked);
      }}
    />
    {linkError && <p className="link-preview-error" role="status">{linkError}</p>}
    </>
  );
}
