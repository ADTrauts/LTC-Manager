import { ContextEntryError, type ParsedContextKey } from "./types";

const PREFIXES = ["organization", "facility_internal", "facility_partner"] as const;

/**
 * Accepts exact `organization:<id>`, `facility_internal:<id>`, or `facility_partner:<id>`.
 * Extra `:` segments, unknown prefixes, and empty ids are rejected.
 */
export function parseContextKey(raw: string): ParsedContextKey {
  if (typeof raw !== "string") {
    throw new ContextEntryError("INVALID_CONTEXT_KEY", "Context key is invalid.");
  }
  const value = raw.trim();
  const separator = value.indexOf(":");
  if (separator <= 0) {
    throw new ContextEntryError("INVALID_CONTEXT_KEY", "Context key is invalid.");
  }
  const prefix = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!(PREFIXES as readonly string[]).includes(prefix)) {
    throw new ContextEntryError("INVALID_CONTEXT_KEY", "Context key is invalid.");
  }
  if (!id || id.includes(":") || id.trim() !== id || id.trim().length === 0) {
    throw new ContextEntryError("INVALID_CONTEXT_KEY", "Context key is invalid.");
  }

  if (prefix === "organization") {
    return { kind: "organization", organizationId: id, contextKey: `organization:${id}` };
  }
  if (prefix === "facility_internal") {
    return { kind: "facility_internal", facilityId: id, contextKey: `facility_internal:${id}` };
  }
  return {
    kind: "facility_partner",
    facilityPartnerOrganizationId: id,
    contextKey: `facility_partner:${id}`,
  };
}
