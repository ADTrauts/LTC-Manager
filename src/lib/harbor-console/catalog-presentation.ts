import type { CatalogLogStatus } from "@prisma/client";

export type CatalogVersionSummary = {
  version: number;
  status: CatalogLogStatus;
};

export function catalogLineStatusLabel(versions: readonly CatalogVersionSummary[]): string {
  const published = versions
    .filter((row) => row.status === "PUBLISHED")
    .sort((a, b) => b.version - a.version)[0];
  const draft = versions.find((row) => row.status === "DRAFT");
  const retired = versions
    .filter((row) => row.status === "RETIRED")
    .sort((a, b) => b.version - a.version)[0];

  if (draft && published) {
    return `Published v${published.version} · Draft v${draft.version}`;
  }
  if (draft) return `Draft v${draft.version}`;
  if (published) return `Published v${published.version}`;
  if (retired) return `Retired v${retired.version}`;
  return "No versions";
}

function highestVersion(
  versions: readonly CatalogVersionSummary[],
  status: CatalogLogStatus,
): CatalogVersionSummary | undefined {
  return versions
    .filter((row) => row.status === status)
    .sort((a, b) => b.version - a.version)[0];
}

/**
 * Unified catalog version. Highest published version, otherwise the current draft,
 * otherwise the newest retired version. Facility install pins are not catalog version.
 */
export function catalogProjectionVersionDisplay(
  versions: readonly CatalogVersionSummary[],
): string {
  const current =
    highestVersion(versions, "PUBLISHED") ??
    highestVersion(versions, "DRAFT") ??
    highestVersion(versions, "RETIRED");
  return current ? `v${current.version}` : "\u2014";
}

/**
 * Unified catalog status. Version stays in the version column.
 * A published lineage with an open draft is "Published · Draft".
 */
export function catalogProjectionStatusLabel(
  versions: readonly CatalogVersionSummary[],
): string {
  const published = highestVersion(versions, "PUBLISHED");
  const draft = highestVersion(versions, "DRAFT");
  const retired = highestVersion(versions, "RETIRED");
  if (draft && published) return "Published \u00b7 Draft";
  if (published) return "Published";
  if (draft) return "Draft";
  if (retired) return "Retired";
  return "\u2014";
}

export function catalogStatusLabel(status: CatalogLogStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PUBLISHED":
      return "Published";
    case "RETIRED":
      return "Retired";
    default:
      return status;
  }
}
