import { notFound } from "next/navigation";

import { DepartmentManagerForm } from "@/app/(protected)/admin/departments/[departmentId]/department-manager-form";
import { DepartmentVisibilityForm } from "@/app/(protected)/admin/departments/department-visibility-form";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { ADMIN_DEPARTMENTS_HREF } from "@/lib/department-administration";
import {
  getDepartmentProduct,
  loadCustomerOperableDepartments,
  loadFacilityDepartmentCatalog,
} from "@/lib/department-products";
import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { prisma } from "@/lib/prisma";
import { EmployeeStatus } from "@prisma/client";

type PageProps = {
  params: Promise<{ departmentId: string }>;
};

export default async function AdminManageDepartmentPage({ params }: PageProps) {
  const session = await assertFacilityAdministratorPage();
  const { departmentId } = await params;

  const [operable, catalog] = await Promise.all([
    loadCustomerOperableDepartments(prisma, session.facilityId),
    loadFacilityDepartmentCatalog(prisma, session.facilityId),
  ]);
  if (!operable.some((row) => row.id === departmentId)) {
    notFound();
  }

  const [department, employees] = await Promise.all([
    prisma.department.findFirst({
      where: { id: departmentId, facilityId: session.facilityId },
      select: {
        id: true,
        key: true,
        name: true,
        isActive: true,
        showInEmployeeApp: true,
        headEmployeeId: true,
        headEmployee: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.employee.findMany({
      where: { facilityId: session.facilityId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        primaryDepartmentId: true,
        employeeDepartments: { select: { departmentId: true } },
      },
    }),
  ]);
  if (!department) {
    notFound();
  }

  const product = getDepartmentProduct(department.key);
  const catalogItem = catalog.find((item) => item.productKey === department.key);
  const licensed = catalogItem?.licensed ?? false;
  const assignedEmployeeCount = employees.filter((employee) =>
    employeeBelongsToDepartment(employee, department.id),
  ).length;
  const managerOptions = employees
    .filter((employee) => employee.status !== EmployeeStatus.TERMINATED)
    .sort((a, b) =>
      `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`),
    )
    .map((employee) => ({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      onRoster: employeeBelongsToDepartment(employee, department.id),
    }));
  const managerName =
    department.headEmployee?.firstName && department.headEmployee?.lastName
      ? `${department.headEmployee.firstName} ${department.headEmployee.lastName}`
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="admin-manage-department">
      <AdminPageHeader
        title={product?.name ?? department.name}
        subtitle="Administrative ownership, employee availability, and installed Product state."
        trail={[
          { label: "Departments", href: ADMIN_DEPARTMENTS_HREF },
          { label: product?.name ?? department.name },
        ]}
      />

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="manage-department-identity">
        <p className="text-sm font-semibold text-zinc-900">{product?.name ?? department.name}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {product?.status === "AVAILABLE" ? (
            <>
              <span>AVAILABLE</span>
              <span className="mx-1.5 text-zinc-300">·</span>
            </>
          ) : null}
          {licensed ? <span className="text-emerald-800">Licensed</span> : <span>Installed</span>}
          <span className="mx-1.5 text-zinc-300">·</span>
          {department.isActive ? <span>Enabled</span> : <span>Inactive</span>}
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="manage-department-manager">
        <h2 className="text-sm font-semibold text-zinc-900">Department Manager</h2>
        {managerName ? (
          <p className="mt-1 text-base font-medium text-zinc-900">{managerName}</p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">No Department Manager assigned.</p>
        )}
        <p className="mt-1 text-xs text-zinc-500">
          Administrative owner for this installed Department Product. Operational teams stay in
          Department Builder → People & Coverage.
        </p>
        <DepartmentManagerForm
          departmentId={department.id}
          headEmployeeId={department.headEmployeeId}
          employees={managerOptions}
        />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="manage-department-visibility">
        <h2 className="text-sm font-semibold text-zinc-900">Employee application</h2>
        <p className="mt-1 mb-3 text-xs text-zinc-500">
          Controls whether this installed Department appears in the employee application.
        </p>
        <DepartmentVisibilityForm
          departmentId={department.id}
          showInEmployeeApp={department.showInEmployeeApp}
          assignedEmployeeCount={assignedEmployeeCount}
        />
      </section>
    </div>
  );
}
