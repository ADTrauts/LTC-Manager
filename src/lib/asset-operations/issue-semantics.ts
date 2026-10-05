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
