export function inlineLinkPreview(urlText: string, escapedLabel?: string) {
  try {
    const url = new URL(urlText.replace(/&amp;/g, "&"));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const host = url.hostname.replace(/^www\./, "");
    const label = escapedLabel?.replace(/\*\*|__|[*_`]/g, "");
    const title = label || escape(host);
    const address = host + (url.pathname === "/" ? "" : url.pathname) + url.search + url.hash;
    // Supplemental address text is excluded from click-to-edit caret mapping.
    return `<a class="link-preview-card inline-link-preview" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer" data-preview-text="${label || escape(urlText.replace(/&amp;/g, "&"))}" data-tooltip="Open ${escape(url.href)}"><span class="link-preview-icon" aria-hidden="true" data-preview-extra="true">↗</span><span class="link-preview-copy"><strong>${title}</strong><span data-preview-extra="true">${escape(address)}</span></span><span class="link-preview-open" aria-hidden="true" data-preview-extra="true">↗</span></a>`;
  } catch { return null; }
}
