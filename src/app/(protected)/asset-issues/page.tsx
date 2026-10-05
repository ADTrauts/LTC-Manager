import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import {
  issueAuthorityLabel,
  listIssuesForDepartment,
  presentIssueAuthority,
  resolveAssetOperationsAuthority,
} from "@/lib/asset-operations";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isDietaryAssetOperationsEnabled, isPlantOperationsEnabled } from "@/lib/feature-flags";
import { cookies } from "next/headers";

export default async function IssuesIndexPage() {
  noStore();
  if (!isDietaryAssetOperationsEnabled() && !isPlantOperationsEnabled()) {
    redirect("/assets");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const departmentId = deptNav.activeDepartmentId;
  if (!departmentId) redirect("/assets");

  const authority = await resolveAssetOperationsAuthority(
    session,
    session.facilityId,
    departmentId,
  );
  if (!authority.canViewRuntime && !authority.canTriageIssue) {
    redirect("/assets");
  }

  const issues = await listIssuesForDepartment(session, {
    facilityId: session.facilityId,
    departmentId,
    status: "OPEN",
    take: 80,
  });

  return (
    <section className="space-y-4" data-testid="issues-index">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Issues</h1>
        <p className="text-sm text-zinc-600">Known undesirable conditions. Not Requests. Not Work Orders.</p>
      </header>
      {issues.length === 0 ? (
        <p className="text-sm text-zinc-500">No open Issues.</p>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue) => (
            <li key={issue.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
              <Link href={`/asset-issues/${issue.id}`} className="font-medium underline underline-offset-2">
                {issue.issueCode} · {issue.summary}
              </Link>
              <p className="mt-1 text-xs text-zinc-600">
                {issueAuthorityLabel(presentIssueAuthority(issue.status))} · {issue.unit.name}
                {issue.space ? ` · ${issue.space.name}` : ""}
                {issue.asset ? ` · ${issue.asset.assetCode}` : " · Location-only"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
