import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { OperationalTemplateBuilderPanel } from "@/components/operational-evidence/template-builder-panel";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAnyStaffingOperationalFeatureEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import {
  listTemplatePresetSummaries,
  loadBuilderTemplates,
  resolveEvidenceAuthority,
} from "@/lib/operational-evidence";
import { prisma } from "@/lib/prisma";

export default async function OperationalTemplateBuilderPage() {
  noStore();

  if (!isAnyStaffingOperationalFeatureEnabled("evidence")) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/workspace");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const department = await resolveStaffingOperationalDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    feature: "evidence",
  });

  if (!department) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Operational Templates" subtitle="No operational department found." compact />
      </section>
    );
  }

  const authority = await resolveEvidenceAuthority(session, session.facilityId, department.id);
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
    departmentId: department.id,
  });
  const assets = await prisma.asset.findMany({
    where: {
      OR: [{ departmentId: department.id }, { departmentId: null }],
      status: { not: "RETIRED" },
      unit: { facilityId: session.facilityId },
    },
    select: { id: true, name: true, assetCode: true, equipmentType: true, unitId: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  const units = await prisma.unit.findMany({
    where: {
      facilityId: session.facilityId,
      isActive: true,
      departmentResponsibilities: { some: { departmentId: department.id } },
    },
    select: { id: true, name: true, unitType: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  const unitIds = units.map((u) => u.id);
  const spaces = await prisma.unitSpace.findMany({
    where: {
      facilityId: session.facilityId,
      isActive: true,
      OR: [{ unitId: { in: unitIds } }, { unitId: null }],
    },
    select: { id: true, name: true, spaceType: true, unitId: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  const cycles = await prisma.departmentOperationalCycle.findMany({
    where: {
      facilityId: session.facilityId,
      departmentId: department.id,
      status: "PUBLISHED",
    },
    select: { stableKey: true, label: true, version: true },
    orderBy: [{ displaySequence: "asc" }, { version: "desc" }],
  });
  const uniqueCycles = Array.from(new Map(cycles.map((c) => [c.stableKey, c])).values());
  const assetTypes = Array.from(new Set(assets.map((a) => a.equipmentType).filter(Boolean))).sort();

  const templatesForPanel = builder.templates.map((t) => ({
    id: t.id,
    name: t.name,
    purposeType: t.purposeType,
    status: t.status,
    version: t.version,
    stableKey: t.stableKey,
    presetKey: t.presetKey,
    description: t.description,
    instructions: t.instructions,
    allowAdHoc: t.allowAdHoc,
    fields: t.fields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      displaySequence: f.displaySequence,
      helpText: f.helpText,
      unitLabel: f.unitLabel,
      minNumber: f.minNumber,
      maxNumber: f.maxNumber,
      allowedSelections: f.allowedSelections,
      correctiveActionTrigger: f.correctiveActionTrigger,
      correctiveActionRequired: f.correctiveActionRequired,
    })),
    applicabilities: t.applicabilities.map((a) => ({
      kind: a.kind,
      assetId: a.assetId,
      assetType: a.assetType,
      spaceId: a.spaceId,
      spaceType: a.spaceType,
      unitId: a.unitId,
    })),
    schedules: t.schedules.map((s) => ({
      kind: s.kind,
      cycleStableKey: s.cycleStableKey,
      windowStartLocal: s.windowStartLocal,
      windowEndLocal: s.windowEndLocal,
    })),
    _count: t._count,
  }));

  return (
    <section className="mx-auto max-w-5xl space-y-4" data-testid="operational-template-builder">
      <PageHeader
        title="Operational Templates"
        subtitle={`${department.name} — unified Logs, Checklists, and Inspections.`}
        compact
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/staffing/log-book" className="underline-offset-2 hover:underline">
              Log Book
            </Link>
            <Link href="/staffing/work-plans" className="underline-offset-2 hover:underline">
              Work Plans
            </Link>
            <Link href="/staffing/operations" className="underline-offset-2 hover:underline">
              Operations Board
            </Link>
            <Link
              href={`/admin/departments/${department.id}?tab=cycles`}
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
        departmentId={department.id}
        canManage={authority.canManage}
        canPublish={authority.canPublish}
        templates={templatesForPanel}
        presets={listTemplatePresetSummaries()}
        assets={assets}
        spaces={spaces}
        units={units}
        cycleOptions={uniqueCycles}
        assetTypes={assetTypes}
      />
    </section>
  );
}
