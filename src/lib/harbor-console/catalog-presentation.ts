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
