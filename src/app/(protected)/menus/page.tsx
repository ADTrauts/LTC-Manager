import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { DepartmentViewNotice } from "@/components/department-view-notice";
import { DEPARTMENT_VIEW_REASON } from "@/lib/department-authority/access";
import { departmentViewOnlyNotice } from "@/lib/department-authority/view-notice";
import { CreateMenuForm } from "@/components/menus/create-menu-form";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import {
  departmentIsVisible,
  loadDepartmentVisibility,
} from "@/lib/department-authority/visibility";
import { departmentProductOffersMenus } from "@/lib/department-products";
import { requireFacilitySession } from "@/lib/facility-context";
import { resolveMenuListDepartmentScope } from "@/lib/menu-authority";
import { listMenus } from "@/lib/menu-db";
import { prisma } from "@/lib/prisma";

type MenusPageProps = {
  searchParams?: Promise<{ department?: string }>;
};

function formatCycleSummary(cycleLengthWeeks: number | null): string | null {
  if (cycleLengthWeeks === 3 || cycleLengthWeeks === 4) {
    return `${cycleLengthWeeks}-week cycle`;
  }
  return null;
}

export default async function MenusPage({ searchParams }: MenusPageProps) {
  noStore();
  const session = await requireFacilitySession();
  const params = searchParams ? await searchParams : undefined;
  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const requestedDepartmentId = typeof params?.department === "string" ? params.department : null;
  const visibility = await loadDepartmentVisibility(prisma, session, session.facilityId);
  if (requestedDepartmentId && !departmentIsVisible(visibility, requestedDepartmentId)) {
    notFound();
  }

  const scopedDepartmentId = resolveMenuListDepartmentScope({
    showAllDepartmentNav: deptNav.showAllDepartmentNav,
    activeDepartmentId: deptNav.activeDepartmentId,
    requestedDepartmentId,
  });

  const [menuList, departments] = await Promise.all([
    listMenus(prisma, {
      facilityId: session.facilityId,
      departmentId: scopedDepartmentId,
    }),
    prisma.department.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      select: { id: true, name: true, key: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const visibleDepartments = departments.filter(
    (department) => !visibility || visibility.pageDepartmentIds.has(department.id),
  );
  const createDepartments = visibleDepartments
    .filter((department) => departmentProductOffersMenus(department.key))
    .filter((department) => !visibility || visibility.manageDepartmentIds.has(department.id))
    .filter((department) => deptNav.showAllDepartmentNav || department.id === deptNav.activeDepartmentId)
    .map((department) => ({ id: department.id, name: department.name }));
  const menuViewNotice =
    visibility && createDepartments.length === 0
      ? departmentViewOnlyNotice(DEPARTMENT_VIEW_REASON)
      : null;

  const visibleMenus = menuList.menus.filter(
    (menu) => !visibility || visibility.pageDepartmentIds.has(menu.department.id),
  );
  const active = visibleMenus.filter((menu) => menu.status === "ACTIVE");
  const inactive = visibleMenus.filter((menu) => menu.status === "INACTIVE");

  return (
    <section className="space-y-4">
      <BuildPageHeader title="Menus" />
      {menuList.unavailableReason ? (
        <div className="max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {menuList.unavailableReason}
        </div>
      ) : null}

      {menuViewNotice ? <DepartmentViewNotice notice={menuViewNotice} /> : null}
      {createDepartments.length > 0 ? (
      <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Create menu</h2>
        <div className="mt-3">
          <CreateMenuForm
            departments={createDepartments}
            defaultDepartmentId={deptNav.activeDepartmentId}
            disabled={Boolean(menuList.unavailableReason)}
          />
        </div>
      </article>
      ) : null}

      <MenuSection title="Active" menus={active} empty="No active menus." />
      <MenuSection title="Inactive" menus={inactive} empty="No inactive menus." />
    </section>
  );
}

function MenuSection({
  title,
  menus,
  empty,
}: {
  title: string;
  menus: Array<{
    id: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
    updatedAt: Date;
    department: { name: string };
    cycleLengthWeeks: number | null;
  }>;
  empty: string;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      {menus.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200">
          {menus.map((menu) => {
            const cycle = formatCycleSummary(menu.cycleLengthWeeks);
            return (
              <li key={menu.id}>
                <Link
                  href={`/menus/${menu.id}?tab=menu`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-3 hover:bg-zinc-50"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{menu.name}</p>
                    <p className="text-sm text-zinc-600">
                      {menu.department.name}
                      {cycle ? ` · ${cycle}` : ""}
                    </p>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {menu.status === "ACTIVE" ? "Active" : "Inactive"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
