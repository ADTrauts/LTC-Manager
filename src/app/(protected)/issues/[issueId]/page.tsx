import { redirect } from "next/navigation";

import { issueDetailPath } from "@/lib/work/issues/issue-copy";

type LegacyIssueDetailPageProps = {
  params: Promise<{ issueId: string }>;
};

/**
 * Legacy Repair façade deep link.
 * Canonical detail lives at `/repairs/[id]`.
 */
export default async function LegacyIssueDetailRedirectPage({
  params,
}: LegacyIssueDetailPageProps) {
  const { issueId } = await params;
  redirect(issueDetailPath(issueId));
}
