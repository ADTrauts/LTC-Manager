/**
 * Canonical Logs RUN nav: hide legacy /logs and keep a Logs destination in the header.
 *
 * SUPERVISOR+ get Log Book (history). STAFF keep today's due Logs at /staffing/logs,
 * because Log Book is SUPERVISOR-gated. Due work still lives on the room either way.
 */

export type CanonicalLogsNavRewriteOptions = {
  /** When false, STAFF keep a Logs tab instead of Log Book. Default true. */
  canViewLogBook?: boolean;
};

const LEGACY_LOGS_HREF = "/logs";
const DUE_LOGS_HREF = "/staffing/logs";
const LOG_BOOK_HREF = "/staffing/log-book";

function withHrefLabel<T extends { href: string }>(template: T, href: string, label: string): T {
  return { ...template, href, ...("label" in template ? { label } : {}) } as T;
}

export function applyCanonicalLogsNavRewrite<T extends { href: string }>(
  items: readonly T[],
  canonicalLogsEnabled: boolean,
  options?: CanonicalLogsNavRewriteOptions,
): T[] {
  if (!canonicalLogsEnabled) return [...items];

  const canViewLogBook = options?.canViewLogBook !== false;
  const canonicalHref = canViewLogBook ? LOG_BOOK_HREF : DUE_LOGS_HREF;
  const canonicalLabel = canViewLogBook ? "Log Book" : "Logs";

  const result: T[] = [];
  let placed = items.some((item) => item.href === canonicalHref);

  for (const item of items) {
    if (item.href === LEGACY_LOGS_HREF || item.href === DUE_LOGS_HREF) {
      if (!placed) {
        result.push(withHrefLabel(item, canonicalHref, canonicalLabel));
        placed = true;
      }
      continue;
    }
    if (!canViewLogBook && item.href === LOG_BOOK_HREF) {
      continue;
    }
    result.push(item);
  }

  if (!placed) {
    const template = result[0] ?? items[0];
    if (template) {
      result.push(withHrefLabel(template, canonicalHref, canonicalLabel));
    }
  }

  return result;
}
