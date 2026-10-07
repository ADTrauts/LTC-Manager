import { allocateDepartmentKey } from "@/lib/department-admission";
import { ensureInitialDepartmentOperator } from "@/lib/department-operators";
import { prisma } from "@/lib/prisma";

/**
 * Creates a facility Department that is NOT a Vssyl Department Product.
 *
 * Canonical product path: `installDepartmentProduct`.
 * This primitive remains for platform testing, internal use, and open-admission
 * proof. It never assigns reserved product/domain keys.
 */
export type CreatedDepartment = {
  id: string;
  key: string;
  name: string;
};

export async function createFacilityDepartment(input: {
  facilityId: string;
  name: string;
  createdByUserId?: string | null;
}): Promise<CreatedDepartment> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Enter a department name (1–80 characters).");
  }

  const existing = await prisma.department.findMany({
    where: { facilityId: input.facilityId },
    select: { key: true, sortOrder: true },
  });
  const key = allocateDepartmentKey(
    name,
    existing.map((row) => row.key),
  );
  const maxSort = existing.reduce((max, row) => Math.max(max, row.sortOrder), 100);

  const created = await prisma.department.create({
    data: {
      facilityId: input.facilityId,
      key,
      name,
      sortOrder: maxSort + 10,
      isActive: true,
      showInEmployeeApp: true,
    },
    select: { id: true, key: true, name: true },
  });

  await ensureInitialDepartmentOperator(prisma, {
    departmentId: created.id,
    facilityId: input.facilityId,
    createdByUserId: input.createdByUserId ?? null,
  });

  return created;
}
