/**
 * Plain-text body storage. HTML is escaped on render; no arbitrary HTML injection.
 */
export function escapeKnowledgeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render article body as safe plain text with preserved line breaks. */
export function renderKnowledgeBodyPlainText(body: string): string {
  return escapeKnowledgeHtml(body);
}
