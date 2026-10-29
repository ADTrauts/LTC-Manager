/**
 * Canonical Logs RUN nav.
 *
 * Due Logs (`/staffing/logs`) and Log Book (`/staffing/log-book`) are distinct:
 *   Logs     — what must be recorded now
 *   Log Book — what has already been recorded
 *
 * SUPERVISOR+ keep both. STAFF keep due Logs only (Log Book is SUPERVISOR-gated).
 * Legacy `/logs` is hidden while canonical logs are on, including All Departments.
 * A department still on the previous engine keeps legacy `/logs` and drops due Logs.
 * `/staffing/templates` is not the canonical Build surface (`/build/logs` is).
 */

export type CanonicalLogsNavRewriteOptions = {
  /** When false, STAFF keep a Logs tab and Log Book is omitted. Default true. */
  canViewLogBook?: boolean;
};

const LEGACY_LOGS_HREF = "/logs";
const DUE_LOGS_HREF = "/staffing/logs";
const LOG_BOOK_HREF = "/staffing/log-book";
const PHASE_9C_TEMPLATES_HREF = "/staffing/templates";

function withHrefLabel<T extends { href: string }>(template: T, href: string, label: string): T {
  return { ...template, href, ...("label" in template ? { label } : {}) } as T;
}

function injectIfMissing<T extends { href: string }>(
  items: T[],
  source: readonly T[],
  href: string,
  label: string,
): void {
  if (items.some((item) => item.href === href)) return;
  const template = items[0] ?? source[0];
  if (template) items.push(withHrefLabel(template, href, label));
}

export function applyCanonicalLogsNavRewrite<T extends { href: string }>(
  items: readonly T[],
  canonicalLogsEnabled: boolean,
  options?: CanonicalLogsNavRewriteOptions,
): T[] {
  if (!canonicalLogsEnabled) return [...items];

  const canViewLogBook = options?.canViewLogBook !== false;
  const result: T[] = [];
  let placedDue = false;
  let placedBook = false;

  for (const item of items) {
    if (item.href === PHASE_9C_TEMPLATES_HREF) continue;
    if (item.href === LEGACY_LOGS_HREF) {
      if (!placedDue) {
        result.push(withHrefLabel(item, DUE_LOGS_HREF, "Logs"));
        placedDue = true;
      }
      continue;
    }
    if (item.href === DUE_LOGS_HREF) {
      if (!placedDue) {
        result.push(withHrefLabel(item, DUE_LOGS_HREF, "Logs"));
        placedDue = true;
      }
      continue;
    }
    if (item.href === LOG_BOOK_HREF) {
      if (canViewLogBook && !placedBook) {
        result.push(withHrefLabel(item, LOG_BOOK_HREF, "Log Book"));
        placedBook = true;
      }
      continue;
    }
    result.push(item);
  }

  injectIfMissing(result, items, DUE_LOGS_HREF, "Logs");
  if (canViewLogBook) {
    injectIfMissing(result, items, LOG_BOOK_HREF, "Log Book");
  }

  return result;
}

/**
 * All Departments follows the facility capability. A selected department follows its engine.
 * The previous engine keeps one Logs item, the legacy surface.
 */
export function applyRunLogsNav<T extends { href: string }>(
  items: readonly T[],
  input: {
    capabilityEnabled: boolean;
    activeDepartmentId: string | null;
    departmentUsesCanonical: boolean;
    canViewLogBook?: boolean;
  },
): T[] {
  const canonical =
    input.capabilityEnabled &&
    (!input.activeDepartmentId || input.departmentUsesCanonical);
  const rewritten = applyCanonicalLogsNavRewrite(items, canonical, {
    canViewLogBook: input.canViewLogBook,
  });
  if (input.capabilityEnabled && !canonical) {
    return rewritten.filter((item) => item.href !== DUE_LOGS_HREF);
  }
  return rewritten;
}
