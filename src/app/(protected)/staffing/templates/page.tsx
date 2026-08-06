import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { OperationalTemplateBuilderPanel } from "@/components/operational-evidence/template-builder-panel";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isDietaryOperationalEvidenceEnabled } from "@/lib/feature-flags";
import {
  listTemplatePresetSummaries,
  loadBuilderTemplates,
  resolveEvidenceAuthority,
} from "@/lib/operational-evidence";
import { prisma } from "@/lib/prisma";

export default async function OperationalTemplateBuilderPage() {
  noStore();

  if (!isDietaryOperationalEvidenceEnabled()) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/workspace");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const dietary =
    (deptNav.activeDepartmentId
      ? await prisma.department.findFirst({
          where: {
            id: deptNav.activeDepartmentId,
            facilityId: session.facilityId,
            key: "DIETARY",
            isActive: true,
          },
          select: { id: true, name: true },
        })
      : null) ??
    (await prisma.department.findFirst({
      where: { facilityId: session.facilityId, key: "DIETARY", isActive: true },
      select: { id: true, name: true },
    }));

  if (!dietary) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Operational Templates" subtitle="No Dietary department found." compact />
      </section>
    );
  }

  const authority = await resolveEvidenceAuthority(session, session.facilityId, dietary.id);
  if (!authority.canViewDepartment && !authority.canManage) {
    return (
      <section className="mx-auto max-w-5xl space-y-4" data-testid="operational-template-builder-denied">
        <PageHeader
          title="Operational Templates"
          subtitle={authority.reason ?? "Insufficient authority for Operational Templates."}
          compact
        />
      </section>
    );
  }

  const builder = await loadBuilderTemplates({
    session,
    facilityId: session.facilityId,
    departmentId: dietary.id,
  });
  const assets = await prisma.asset.findMany({
    where: {
      OR: [{ departmentId: dietary.id }, { departmentId: null }],
      status: { not: "RETIRED" },
      unit: { facilityId: session.facilityId },
    },
    select: { id: true, name: true, assetCode: true, equipmentType: true, unitId: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  const cycles = await prisma.departmentOperationalCycle.findMany({
    where: {
      facilityId: session.facilityId,
      departmentId: dietary.id,
      status: "PUBLISHED",
    },
    select: { stableKey: true, label: true, version: true },
    orderBy: [{ displaySequence: "asc" }, { version: "desc" }],
  });
  const uniqueCycles = Array.from(new Map(cycles.map((c) => [c.stableKey, c])).values());

  return (
    <section className="mx-auto max-w-5xl space-y-4" data-testid="operational-template-builder">
      <PageHeader
        title="Operational Templates"
        subtitle={`${dietary.name} — unified Logs, Checklists, and Inspections.`}
        compact
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/staffing/log-book" className="underline-offset-2 hover:underline">
              Log Book
            </Link>
            <Link href="/staffing/operations" className="underline-offset-2 hover:underline">
              Operations Board
            </Link>
            <Link
              href={`/admin/departments/${dietary.id}?tab=cycles`}
              className="underline-offset-2 hover:underline"
            >
              Cycles
            </Link>
          </div>
        }
      />
      {!authority.canManage ? (
        <StatusBadge variant="neutral">View only — Manager password required to edit.</StatusBadge>
      ) : null}
      <OperationalTemplateBuilderPanel
        facilityId={session.facilityId}
        departmentId={dietary.id}
        canManage={authority.canManage}
        canPublish={authority.canPublish}
        templates={builder.templates}
        presets={listTemplatePresetSummaries()}
        assets={assets}
        cycleOptions={uniqueCycles}
      />
    </section>
  );
}
