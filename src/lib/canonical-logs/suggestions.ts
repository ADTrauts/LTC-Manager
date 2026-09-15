/**
 * Deterministic Catalog suggestion matching for BUILD discovery.
 * Suggestion only — never auto-attaches.
 */

export type CatalogSuggestions = {
  assetTypes: string[];
  spaceTypes: string[];
  departmentKeys: string[];
  keywords: string[];
};

export type SuggestionTargetContext = {
  kind: "ASSET" | "SPACE" | "UNIT" | "DEPARTMENT" | "FACILITY";
  equipmentType?: string | null;
  spaceType?: string | null;
  /** Facility room type key / display name when available. */
  roomTypeHints?: readonly string[];
  unitName?: string | null;
  departmentKey?: string | null;
};

export function normalizeSuggestionToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCatalogSuggestions(raw: unknown): CatalogSuggestions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { assetTypes: [], spaceTypes: [], departmentKeys: [], keywords: [] };
  }
  const obj = raw as Record<string, unknown>;
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  return {
    assetTypes: asList(obj.assetTypes),
    spaceTypes: asList(obj.spaceTypes),
    departmentKeys: asList(obj.departmentKeys),
    keywords: asList(obj.keywords),
  };
}

function tokenSetMatch(haystack: string | null | undefined, needles: readonly string[]): boolean {
  if (!haystack?.trim() || needles.length === 0) return false;
  const hay = normalizeSuggestionToken(haystack);
  return needles.some((n) => {
    const needle = normalizeSuggestionToken(n);
    if (!needle) return false;
    return hay === needle || hay.includes(needle) || needle.includes(hay);
  });
}

function anyTokenMatch(values: readonly string[], needles: readonly string[]): boolean {
  return values.some((v) => tokenSetMatch(v, needles));
}

/**
 * Returns true when Catalog suggestionsJson matches the current target context.
 * Matching is forgiving (normalized contains) but deterministic — no fuzzy AI.
 */
export function catalogMatchesTarget(
  suggestions: CatalogSuggestions,
  target: SuggestionTargetContext,
): boolean {
  switch (target.kind) {
    case "ASSET":
      return tokenSetMatch(target.equipmentType, suggestions.assetTypes);
    case "SPACE":
      return (
        tokenSetMatch(target.spaceType, suggestions.spaceTypes) ||
        anyTokenMatch(target.roomTypeHints ?? [], suggestions.spaceTypes) ||
        anyTokenMatch(target.roomTypeHints ?? [], suggestions.keywords)
      );
    case "UNIT":
      return (
        tokenSetMatch(target.unitName, suggestions.keywords) ||
        tokenSetMatch(target.departmentKey, suggestions.departmentKeys)
      );
    case "DEPARTMENT":
      return tokenSetMatch(target.departmentKey, suggestions.departmentKeys);
    case "FACILITY":
      return false;
  }
}

export type RankedCatalogItem<T> = T & { suggested: boolean };

/**
 * Sort suggested Catalog entries first; preserve relative order within each bucket.
 */
export function rankCatalogBySuggestion<T>(
  items: readonly T[],
  isSuggested: (item: T) => boolean,
): RankedCatalogItem<T>[] {
  const suggested: RankedCatalogItem<T>[] = [];
  const rest: RankedCatalogItem<T>[] = [];
  for (const item of items) {
    const row = { ...item, suggested: isSuggested(item) };
    if (row.suggested) suggested.push(row);
    else rest.push(row);
  }
  return [...suggested, ...rest];
}
