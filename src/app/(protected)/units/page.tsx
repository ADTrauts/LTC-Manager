import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { UnitsManager } from "@/components/units-manager";
import { getSession } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function UnitsPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const facilityId = session.facilityId;

  const [units, templates, logAssignments] = await Promise.all([
    prisma.unit.findMany({
      where: { facilityId },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        unitType: true,
        parentUnitId: true,
        isActive: true,
        displayOrder: true,
        description: true,
        mealTimes: {
          where: { isActive: true },
          select: { mealType: true, scheduledTime: true },
        },
      },
    }),
    prisma.logTemplate.findMany({
      where: { facilityId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.logAssignment.findMany({
      where: { unit: { facilityId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        unitId: true,
        isActive: true,
        recurrence: true,
        mealType: true,
        timesPerDay: true,
        template: { select: { name: true } },
      },
    }),
  ]);

  const parentOptions = units.map((unit) => ({ id: unit.id, name: unit.name }));
  const canManageLogAssignments = hasAtLeastRole(session.role, "MANAGER");

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Units</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Configure each location: type-specific details, sidebar order, and which compliance logs apply. Log
          templates are built under Logs; managers can attach them to a unit here or on the Logs → Assignments
          tab.
        </p>
      </header>
      <UnitsManager
        units={units}
        parentOptions={parentOptions}
        templates={canManageLogAssignments ? templates : []}
        logAssignments={logAssignments}
        canManageLogAssignments={canManageLogAssignments}
      />
    </section>
  );
}
