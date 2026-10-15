const clean = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[\u200b\ufeff]/g, "");
function webUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
const label = (text: string) => text.replace(/[\\[\]]/g, "\\$&");
const destination = (url: string) => url.replace(/\(/g, "%28").replace(/\)/g, "%29");

/** Clipboard-only: preserve links, strip pasted styling, never fetch a page. */
export function smartPaste(text: string, html: string, selection: string, plain = false) {
  const value = clean(text);
  if (plain) return value;
  const url = webUrl(value.trim());
  if (url && selection && !selection.includes("\n")) return `[${label(selection)}](${destination(url)})`;
  if (!html || html.length > 1_000_000) return value;
  // Detached template content stays inert; pasted media and scripts are never
  // attached to the page. Only text and safe link destinations are retained.
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,style,iframe,object,noscript").forEach((node) => node.remove());
  if (!template.content.querySelector("a[href]")) return value;
  let visited = 0;
  const render = (node: Node, depth = 0): string => {
    if (++visited > 20_000 || depth > 64) throw new Error("Clipboard structure is too complex.");
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element)) return "";
    const content = [...node.childNodes].map(child => render(child, depth + 1)).join("");
    if (node.tagName === "A") {
      const href = webUrl(node.getAttribute("href") ?? "");
      return href && content.trim() && content.trim() !== href ? `[${label(content.trim())}](${destination(href)})` : content;
    }
    if (node.tagName === "BR") return "\n";
    if (["P", "DIV", "SECTION", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "TR"].includes(node.tagName)) return `${content}\n`;
    if (node.tagName === "LI") return `- ${content.trim()}\n`;
    return content;
  };
  try {
    return clean([...template.content.childNodes].map(node => render(node)).join("")).replace(/\n{3,}/g, "\n\n").trim() || value;
  } catch {
    // Keep the plain clipboard text rather than recurse through adversarial HTML.
    return value;
  }
}
