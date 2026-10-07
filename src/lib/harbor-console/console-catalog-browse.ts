/**
 * Marketplace browse state for the unified Console catalog projection.
 *
 * The page loads `listConsoleCatalogItems` once. Family, record subtype,
 * status, category, and search all filter that in-memory list. Nothing here
 * queries a source family on its own.
 *
 * Default sort inside a filtered set is name ascending (case-insensitive),
 * then stable key. Install count is not a sort.
 */

import { catalogPurposeLabel } from "@/lib/canonical-logs/catalog-browse";

import {
  CONSOLE_CATALOG_EMPTY,
  type ConsoleCatalogFamily,
  type ConsoleCatalogItem,
  type ConsoleCatalogRecordSubtype,
  type ConsoleCatalogUsageLabel,
} from "@/lib/harbor-console/console-catalog";

export const MARKETPLACE_BROWSE_PATH = "/console/catalog";

const MAX_QUERY_LENGTH = 200;

export const MARKETPLACE_FAMILIES = [
  { key: "all", label: "All" },
  { key: "departments", label: "Departments" },
  { key: "records", label: "Records" },
  { key: "work", label: "Work" },
] as const;

export type MarketplaceFamilyKey = (typeof MARKETPLACE_FAMILIES)[number]["key"];

export const MARKETPLACE_RECORD_TYPES = [
  { key: "all", label: "All" },
  { key: "log", label: "Logs" },
  { key: "checklist", label: "Checklists" },
  { key: "inspection", label: "Inspections" },
] as const;

export type MarketplaceRecordTypeKey = "log" | "checklist" | "inspection";

/** Matches `catalogProjectionStatusLabel` exactly, including the middle dot. */
export const MARKETPLACE_RECORD_STATUSES = [
  "Published",
  "Published \u00b7 Draft",
  "Draft",
  "Retired",
] as const;

export const MARKETPLACE_DEPARTMENT_STATUSES = ["AVAILABLE", "DEVELOPMENT", "RETIRED"] as const;

const FAMILY_TO_CATALOG: Record<Exclude<MarketplaceFamilyKey, "all">, ConsoleCatalogFamily> = {
  departments: "DEPARTMENTS",
  records: "RECORDS",
  work: "WORK",
};

const TYPE_TO_SUBTYPE: Record<MarketplaceRecordTypeKey, ConsoleCatalogRecordSubtype> = {
  log: "LOG",
  checklist: "CHECKLIST",
  inspection: "INSPECTION",
};

const USAGE_SINGULAR: Record<ConsoleCatalogUsageLabel, string> = {
  users: "user",
  placements: "placement",
  "published plans": "published plan",
};

export type MarketplaceBrowseParamInput = Record<string, string | string[] | undefined>;

export type MarketplaceBrowseQuery = {
  family: MarketplaceFamilyKey;
  type: MarketplaceRecordTypeKey | null;
  status: string | null;
  category: string | null;
  q: string | null;
};

export type MarketplaceCategoryOption = {
  key: string;
  label: string;
};

export type MarketplaceCreateAction = {
  href: string;
  label: string;
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function isFamilyKey(value: string | null): value is MarketplaceFamilyKey {
  return MARKETPLACE_FAMILIES.some((row) => row.key === value);
}

function isRecordTypeKey(value: string | null): value is MarketplaceRecordTypeKey {
  return value === "log" || value === "checklist" || value === "inspection";
}

export function marketplaceBrowseHref(query: MarketplaceBrowseQuery): string {
  const params = new URLSearchParams();
  if (query.family !== "all") params.set("family", query.family);
  if (query.family === "records" && query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.q) params.set("q", query.q);
  const serialized = params.toString();
  return serialized ? `${MARKETPLACE_BROWSE_PATH}?${serialized}` : MARKETPLACE_BROWSE_PATH;
}

/** Rebuilds the requested browse URL without dropping invalid values. */
export function marketplaceBrowseRequestHref(params: MarketplaceBrowseParamInput = {}): string {
  const search = new URLSearchParams();
  const family = firstParam(params.family);
  const type = firstParam(params.type);
  const status = firstParam(params.status);
  const category = firstParam(params.category);
  const q = firstParam(params.q);
  if (family) search.set("family", family);
  if (type) search.set("type", type);
  if (status) search.set("status", status);
  if (category) search.set("category", category);
  if (q) search.set("q", q);
  const serialized = search.toString();
  return serialized ? `${MARKETPLACE_BROWSE_PATH}?${serialized}` : MARKETPLACE_BROWSE_PATH;
}

function parseStructural(params: MarketplaceBrowseParamInput): MarketplaceBrowseQuery {
  const familyValue = firstParam(params.family);
  const family = isFamilyKey(familyValue) ? familyValue : "all";
  const typeValue = firstParam(params.type);
  const type = family === "records" && isRecordTypeKey(typeValue) ? typeValue : null;
  const qValue = firstParam(params.q);
  return {
    family,
    type,
    status: firstParam(params.status),
    category: firstParam(params.category),
    q: qValue ? qValue.slice(0, MAX_QUERY_LENGTH) : null,
  };
}

export function marketplaceStatusOptions(query: Pick<MarketplaceBrowseQuery, "family">): readonly string[] {
  if (query.family === "departments") return MARKETPLACE_DEPARTMENT_STATUSES;
  if (query.family === "records") return MARKETPLACE_RECORD_STATUSES;
  return [];
}

export function marketplaceCategoryOptions(
  items: readonly ConsoleCatalogItem[],
  query: Pick<MarketplaceBrowseQuery, "family" | "type">,
): MarketplaceCategoryOption[] {
  if (query.family === "all") return [];
  const labels = new Map<string, string>();
  for (const item of items) {
    if (!matchesFamily(item, query.family) || !matchesSubtype(item, query)) continue;
    if (!item.categoryKey || !item.categoryLabel) continue;
    labels.set(item.categoryKey, item.categoryLabel);
  }
  return [...labels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

export function resolveMarketplaceBrowse(
  params: MarketplaceBrowseParamInput,
  items: readonly ConsoleCatalogItem[],
): MarketplaceBrowseQuery {
  const structural = parseStructural(params);
  const statusOptions = marketplaceStatusOptions(structural);
  const status =
    structural.status && statusOptions.includes(structural.status) ? structural.status : null;
  const withStatus = { ...structural, status };
  const categoryOptions = marketplaceCategoryOptions(items, withStatus);
  const category =
    withStatus.category && categoryOptions.some((option) => option.key === withStatus.category)
      ? withStatus.category
      : null;
  return { ...withStatus, category };
}

export function marketplaceFamilyHref(
  query: MarketplaceBrowseQuery,
  family: MarketplaceFamilyKey,
): string {
  return marketplaceBrowseHref({
    family,
    type: null,
    status: null,
    category: null,
    q: query.q,
  });
}

export function marketplaceRecordTypeHref(
  query: MarketplaceBrowseQuery,
  type: MarketplaceRecordTypeKey | null,
): string {
  return marketplaceBrowseHref({
    ...query,
    family: "records",
    type,
  });
}

export function marketplaceRefinementsActive(query: MarketplaceBrowseQuery): boolean {
  return Boolean(query.q || query.status || query.category || query.type);
}

export function marketplaceClearHref(query: MarketplaceBrowseQuery): string {
  return marketplaceBrowseHref({
    family: query.family,
    type: null,
    status: null,
    category: null,
    q: null,
  });
}

function matchesFamily(item: ConsoleCatalogItem, family: MarketplaceFamilyKey): boolean {
  if (family === "all") return true;
  return item.catalogFamily === FAMILY_TO_CATALOG[family];
}

function matchesSubtype(
  item: ConsoleCatalogItem,
  query: Pick<MarketplaceBrowseQuery, "family" | "type">,
): boolean {
  if (query.family !== "records" || !query.type) return true;
  return item.catalogSubtype === TYPE_TO_SUBTYPE[query.type];
}

function searchHaystack(item: ConsoleCatalogItem): string {
  return [item.name, item.stableKey, item.categoryLabel, item.categoryKey]
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .toLowerCase();
}

function matchesSearch(item: ConsoleCatalogItem, q: string | null): boolean {
  if (!q) return true;
  return searchHaystack(item).includes(q.toLowerCase());
}

export function sortMarketplaceItems(items: readonly ConsoleCatalogItem[]): ConsoleCatalogItem[] {
  return [...items].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
      a.stableKey.localeCompare(b.stableKey, "en", { sensitivity: "base" }),
  );
}

export function filterMarketplaceItems(
  items: readonly ConsoleCatalogItem[],
  query: MarketplaceBrowseQuery,
): ConsoleCatalogItem[] {
  return sortMarketplaceItems(
    items.filter(
      (item) =>
        matchesFamily(item, query.family) &&
        matchesSubtype(item, query) &&
        (query.status == null || item.statusLabel === query.status) &&
        (query.category == null || item.categoryKey === query.category) &&
        matchesSearch(item, query.q),
    ),
  );
}

export function marketplaceTypeLabel(item: ConsoleCatalogItem): string {
  if (item.sourceType === "DEPARTMENT_PRODUCT") return "Department";
  if (item.sourceType === "WORK_PRESET") return "Work";
  if (item.catalogSubtype) return catalogPurposeLabel(item.catalogSubtype);
  return "Record";
}

export function formatMarketplaceInstallCount(count: number): string {
  if (count <= 0) return "None yet";
  if (count === 1) return "1 facility";
  return `${count} facilities`;
}

export function formatMarketplaceUsage(
  count: number | null,
  label: ConsoleCatalogUsageLabel | null,
): string {
  if (count == null || label == null) return CONSOLE_CATALOG_EMPTY;
  const noun = count === 1 ? USAGE_SINGULAR[label] : label;
  return `${count} ${noun}`;
}

export function formatMarketplaceResultCount(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

export function marketplaceEmptyCopy(query: MarketplaceBrowseQuery): string {
  if (query.q) {
    return query.type || query.status || query.category
      ? `No Marketplace items match “${query.q}” with the current filters.`
      : `No Marketplace items match “${query.q}”.`;
  }
  if (query.family === "departments") return "No Department Products match these filters.";
  if (query.family === "records") return "No catalog Records match these filters.";
  if (query.family === "work") return "No Work presets match these filters.";
  if (query.status || query.category) return "No Marketplace items match these filters.";
  return "No Marketplace items are available.";
}

/** Record, Department, and Work rows open their source detail routes. */
export function marketplaceRowHref(item: ConsoleCatalogItem): string | null {
  return item.detailHref || null;
}

export function marketplaceCreateAction(query: MarketplaceBrowseQuery): MarketplaceCreateAction | null {
  if (query.family === "departments" || query.family === "work") return null;
  if (query.family === "records" && query.type === "log") {
    return { href: "/console/catalog/new?type=log", label: "New catalog log" };
  }
  if (query.family === "records" && query.type === "checklist") {
    return { href: "/console/catalog/new?type=checklist", label: "New catalog checklist" };
  }
  if (query.family === "records" && query.type === "inspection") {
    return { href: "/console/catalog/new?type=inspection", label: "New catalog inspection" };
  }
  return { href: "/console/catalog/new", label: "New catalog record" };
}

export function marketplaceCreatePageModel(typeParam: string | null): {
  title: string;
  purposeType: "LOG" | "CHECKLIST" | "INSPECTION";
} {
  if (typeParam === "checklist") {
    return { title: "New catalog checklist", purposeType: "CHECKLIST" };
  }
  if (typeParam === "inspection") {
    return { title: "New catalog inspection", purposeType: "INSPECTION" };
  }
  if (typeParam === "log") {
    return { title: "New catalog log", purposeType: "LOG" };
  }
  return { title: "New catalog record", purposeType: "LOG" };
}
