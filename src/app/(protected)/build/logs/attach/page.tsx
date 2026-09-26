import { redirect, notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { AddLogFlowClient } from "@/components/canonical-logs/add-log-flow";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadTargetLogsBuildContext } from "@/lib/canonical-logs/load-target-build-context";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";

type SearchParams = Promise<{
  targetKind?: string;
  targetId?: string;
  catalog?: string;
  departmentId?: string;
  returnTo?: string;
}>;

export default async function AttachLogPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/build");

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/build");

  const query = await searchParams;
  const targetKind = query.targetKind;
  const targetId = query.targetId?.trim();
  if (
    !targetId ||
    (targetKind !== "ASSET" &&
      targetKind !== "SPACE" &&
      targetKind !== "UNIT" &&
      targetKind !== "DEPARTMENT")
  ) {
    redirect("/build/logs");
  }

  const ctx = await loadTargetLogsBuildContext({
    facilityId: session.facilityId,
    targetKind,
    targetId,
    departmentId: query.departmentId ?? null,
    includeCatalogStableKey: query.catalog ?? null,
  });
  if (!ctx || !ctx.departmentId || !ctx.departmentName) {
    notFound();
  }

  return (
    <AddLogFlowClient
      facilityId={session.facilityId}
      departmentId={ctx.departmentId}
      departmentName={ctx.departmentName}
      targetKind={targetKind}
      targetId={targetId}
      targetTitle={ctx.label.title}
      targetSubtitle={ctx.label.subtitle}
      catalogCards={ctx.catalogCards}
      suggestedStableKeys={ctx.suggestedStableKeys}
      initialCatalogStableKey={query.catalog ?? null}
      cycleOptions={ctx.cycleOptions}
      defaultTimingByStableKey={ctx.defaultTimingByStableKey}
      effectiveFromKey={ctx.effective.effectiveFromKey}
      effectiveLabel={ctx.effective.label}
      cancelHref={
        query.returnTo?.startsWith("/admin/departments/")
          ? query.returnTo
          : targetKind === "DEPARTMENT"
            ? `/admin/departments/${targetId}`
            : `/build/logs/targets/${targetKind.toLowerCase()}/${targetId}`
      }
      returnTo={query.returnTo ?? null}
    />
  );
}
