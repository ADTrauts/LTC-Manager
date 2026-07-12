import { redirect } from "next/navigation";

import { issueDetailPath } from "@/lib/work/issues/issue-copy";

type RepairDetailAliasPageProps = {
  params: Promise<{ id: string }>;
};

/** Compatibility alias: /repairs/[id] → /issues/[id] (Repair remains SoT). */
export default async function RepairDetailAliasPage({ params }: RepairDetailAliasPageProps) {
  const { id } = await params;
  redirect(issueDetailPath(id));
}
