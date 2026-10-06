import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import {
  createIssueFromRecordAction,
  reportDirectIssueAction,
} from "@/app/(protected)/asset-issues/actions";
import {
  issueAuthorityLabel,
  listIssuesForDepartment,
  parseIssueListView,
  presentIssueAuthority,
  resolveAssetOperationsAuthority,
} from "@/lib/asset-operations";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isDietaryAssetOperationsEnabled, isPlantOperationsEnabled } from "@/lib/feature-flags";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type Props = {
  searchParams: Promise<{ view?: string; q?: string; unit?: string }>;
};

const VIEWS = [
  { value: "OPEN", label: "Open" },
  { value: "MONITORING", label: "Monitoring" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CANCELED", label: "Canceled" },
] as const;

function ageLabel(reportedAt: Date) {
  const days = Math.floor((Date.now() - reportedAt.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export default async function IssuesIndexPage({ searchParams }: Props) {
  noStore();
  if (!isDietaryAssetOperationsEnabled() && !isPlantOperationsEnabled()) {
    redirect("/assets");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  const params = await searchParams;
  const view = parseIssueListView(params.view);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const unitId = typeof params.unit === "string" ? params.unit.trim() : "";

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

  const [issues, units] = await Promise.all([
    listIssuesForDepartment(session, {
      facilityId: session.facilityId,
      departmentId,
      view,
      q,
      unitId: unitId || null,
      take: 80,
    }),
    prisma.unit.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <section className="space-y-4" data-testid="issues-index">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Issues</h1>
        <p className="text-sm text-zinc-600">
          Known undesirable conditions. Not Requests. Not Work Orders.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Issue status">
        {VIEWS.map((tab) => {
          const href = tab.value === "OPEN" ? "/asset-issues" : `/asset-issues?view=${tab.value}`;
          const active = view === tab.value;
          return (
            <Link
              key={tab.value}
              href={href}
              className={
                active
                  ? "rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                  : "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <form method="get" className="flex flex-wrap gap-2" role="search">
        {view !== "OPEN" ? <input type="hidden" name="view" value={view} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search Issues"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <select name="unit" defaultValue={unitId} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="">All locations</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
          Filter
        </button>
      </form>

      {authority.canReportIssue ? (
        <details className="rounded-xl border border-zinc-200 bg-white p-3" data-testid="direct-issue-create">
          <summary className="cursor-pointer text-sm font-medium">Create Issue</summary>
          <form action={reportDirectIssueAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="departmentId" value={departmentId} />
            <label className="text-sm sm:col-span-2">
              Summary
              <input name="summary" required className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" />
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <textarea name="description" required className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              Location
              <select name="unitId" required className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2">
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Asset ID (optional)
              <input name="assetId" className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2" />
            </label>
            <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white sm:col-span-2">
              Create Issue
            </button>
          </form>
          <form action={createIssueFromRecordAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="departmentId" value={departmentId} />
            <input
              name="evidenceRecordId"
              placeholder="Create from Record ID"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              data-testid="create-issue-from-record-id"
            />
            <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              Create Issue from Record
            </button>
          </form>
        </details>
      ) : null}

      {issues.length === 0 ? (
        <p className="text-sm text-zinc-500">No Issues in this view.</p>
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
                {" · "}
                {issue._count.workOrders} Work Order{issue._count.workOrders === 1 ? "" : "s"}
                {" · "}
                {issue._count.relatedFromOperationalRequests} Request
                {issue._count.relatedFromOperationalRequests === 1 ? "" : "s"}
                {" · "}
                {ageLabel(issue.reportedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
