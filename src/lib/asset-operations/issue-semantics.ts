/**
 * Canonical Issue status projection.
 *
 * Stored AssetIssueStatus values remain readable (compatibility).
 * Do not rewrite historical rows.
 *
 * Issue = a known undesirable condition. Not a Request. Not a Work Order.
 */

import type { AssetIssueStatus } from "@prisma/client";

/** Conceptual Issue authority. Not a Prisma enum. */
export type IssueAuthority = "OPEN" | "MONITORING" | "RESOLVED" | "CANCELED";

export function presentIssueAuthority(
  status: AssetIssueStatus | string | null | undefined,
): IssueAuthority {
  if (status === "MONITORING") return "MONITORING";
  if (status === "RESOLVED" || status === "CLOSED") return "RESOLVED";
  if (status === "CANCELLED") return "CANCELED";
  return "OPEN";
}

export function issueAuthorityLabel(status: IssueAuthority): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "MONITORING":
      return "Monitoring";
    case "RESOLVED":
      return "Resolved";
    case "CANCELED":
      return "Canceled";
    default:
      return "Open";
  }
}

export function isOpenIssueAuthority(status: AssetIssueStatus | string | null | undefined): boolean {
  const authority = presentIssueAuthority(status);
  return authority === "OPEN" || authority === "MONITORING";
}

export type IssueListView = "OPEN" | "MONITORING" | "RESOLVED" | "CANCELED";

export function issueStatusesForListView(view: IssueListView | string | null | undefined): AssetIssueStatus[] {
  switch (view) {
    case "MONITORING":
      return ["MONITORING"];
    case "RESOLVED":
      return ["RESOLVED", "CLOSED"];
    case "CANCELED":
      return ["CANCELLED"];
    case "OPEN":
    default:
      return ["REPORTED", "ACKNOWLEDGED", "TRIAGED"];
  }
}

export function parseIssueListView(raw: string | null | undefined): IssueListView {
  if (raw === "MONITORING" || raw === "RESOLVED" || raw === "CANCELED") return raw;
  return "OPEN";
}
