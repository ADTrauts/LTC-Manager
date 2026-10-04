import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { setDepartmentHeadAction } from "@/app/(protected)/admin/departments/actions";
import { DepartmentMarketplace } from "@/app/(protected)/admin/departments/department-marketplace";
import { DepartmentVisibilityForm } from "@/app/(protected)/admin/departments/department-visibility-form";
import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { applyCheckoutSessionId } from "@/lib/billing/sync-from-stripe";
import { areAllCatalogPricesConfigured } from "@/lib/billing/stripe-prices";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import {
  departmentBuilderWorkspaceHref,
  shouldRedirectDepartmentsListToWorkspace,
} from "@/lib/department-administration";
import {
  canPurchaseDepartmentProducts,
  getDepartmentProduct,
  loadCustomerOperableDepartments,
  loadFacilityDepartmentCatalog,
} from "@/lib/department-products";
import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { prisma } from "@/lib/prisma";
import { isStripeSecretConfigured } from "@/lib/stripe";
import { EmployeeStatus } from "@prisma/client";

type PageProps = {
  searchParams: Promise<{
    all?: string;
    checkout?: string;
    session_id?: string;
    departments?: string;
    marketplace?: string;
  }>;
};

/**
 * Facility-level “All Departments” management.
 * Lists Department Products installed and customer-operable at this facility.
 * When a global department is selected, redirects into that department’s Builder
 * unless `?all=1` forces this management list.
 */
export default async function AdminDepartmentsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const query = await searchParams;
  const forceAll = query.all === "1";
  const showMarketplace = query.marketplace === "1";

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  if (
    !showMarketplace &&
    shouldRedirectDepartmentsListToWorkspace({
      activeDepartmentId: deptNav.activeDepartmentId,
      forceAllDepartments: forceAll,
    })
  ) {
    redirect(departmentBuilderWorkspaceHref(deptNav.activeDepartmentId!));
  }

  const catalogBeforeCheckout = query.session_id
    ? await loadFacilityDepartmentCatalog(prisma, facilityId)
    : null;
  if (query.session_id) {
    try {
      await applyCheckoutSessionId({
        checkoutSessionId: query.session_id,
        expectedFacilityId: facilityId,
      });
    } catch (error) {
      console.error("departments.checkout.sync.failed", {
        facilityId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const [operableDepartments, employees, catalog, billing] = await Promise.all([
    loadCustomerOperableDepartments(prisma, facilityId),
    prisma.employee.findMany({
      where: { facilityId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        primaryDepartmentId: true,
        employeeDepartments: { select: { departmentId: true } },
      },
    }),
    loadFacilityDepartmentCatalog(prisma, facilityId),
    prisma.facilityBilling.findUnique({
      where: { facilityId },
      select: { status: true },
    }),
  ]);

  const operableIds = operableDepartments.map((row) => row.id);
  const departments =
    operableIds.length === 0
      ? []
      : await prisma.department.findMany({
          where: { facilityId, id: { in: operableIds } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            key: true,
            name: true,
            isActive: true,
            showInEmployeeApp: true,
            headEmployeeId: true,
            headEmployee: { select: { firstName: true, lastName: true } },
          },
        });

  if (catalogBeforeCheckout) {
    const newlyInstalled = catalog.filter((item) => {
      const previous = catalogBeforeCheckout.find((row) => row.productKey === item.productKey);
      return item.installed && item.departmentId && !previous?.installed;
    });
    if (newlyInstalled.length === 1 && newlyInstalled[0]?.departmentId) {
      redirect(departmentBuilderWorkspaceHref(newlyInstalled[0].departmentId));
    }
  }

  const activeEmployees = employees
    .filter((e) => e.status !== EmployeeStatus.TERMINATED)
    .sort((a, b) =>
      `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`),
    );
  const isFa = isFacilityAdministratorRole(session.role);
  const canPurchase = canPurchaseDepartmentProducts(session.role);
  const alreadySubscribed = billing?.status === "ACTIVE" || billing?.status === "PAST_DUE";
  const checkoutReady = isStripeSecretConfigured() && areAllCatalogPricesConfigured();
  const licensedByKey = new Map(catalog.map((item) => [item.productKey, item.licensed]));

  function isOnDepartmentRoster(e: (typeof employees)[number], departmentId: string) {
    return employeeBelongsToDepartment(e, departmentId);
  }

  function assignedEmployeeCount(departmentId: string) {
    return employees.filter((e) => isOnDepartmentRoster(e, departmentId)).length;
  }

  if (showMarketplace) {
    if (!canPurchase) {
      redirect("/build/departments?all=1");
    }
    return (
      <div className="mx-auto max-w-3xl space-y-4" data-testid="departments-all-list">
        <BuildPageHeader
          title="Add Department"
          subtitle="Choose a Vssyl Department Product. Licensing happens before installation."
        />
        <DepartmentMarketplace
          catalog={catalog}
          alreadySubscribed={alreadySubscribed}
          checkoutReady={checkoutReady}
          canPurchase={canPurchase}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="departments-all-list">
      <BuildPageHeader
        title="Departments"
        subtitle="Department Products installed at this facility. Open Department Builder to configure people, locations, and operating times."
      />

      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        The global Department control is set to <span className="font-medium">All departments</span>.
        Department Builder tabs appear after you open a specific department.
      </p>

      {query.checkout === "canceled" ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Checkout was canceled. No department was licensed or installed.
        </p>
      ) : null}

      {isFa ? (
        <div className="flex justify-end">
          <Link
            href="/build/departments?all=1&marketplace=1"
            className="inline-flex rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            data-testid="add-department-button"
          >
            Add Department
          </Link>
        </div>
      ) : null}

      {departments.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          No departments are installed at this facility yet.
          {isFa
            ? " Add a Vssyl department from the Marketplace."
            : " A Facility Administrator can add departments from the Marketplace."}
        </div>
      ) : (
        <section className="space-y-2" data-testid="installed-departments">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Installed Departments
          </h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {departments.map((d) => {
              const product = getDepartmentProduct(d.key);
              const licensed = licensedByKey.get(d.key) ?? false;
              return (
                <li key={d.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{product?.name ?? d.name}</p>
                      <p className="text-xs text-zinc-500">
                        {licensed ? (
                          <span className="text-emerald-800">Licensed</span>
                        ) : (
                          <span>Included</span>
                        )}
                        <span className="mx-1.5 text-zinc-300">·</span>
                        {d.isActive ? (
                          <span>Enabled</span>
                        ) : (
                          <span className="text-zinc-600">Inactive</span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Department Manager:{" "}
                        {d.headEmployee?.firstName && d.headEmployee?.lastName
                          ? `${d.headEmployee.lastName}, ${d.headEmployee.firstName}`
                          : "Not assigned"}
                      </p>
                      <p className="mt-3">
                        <Link
                          href={departmentBuilderWorkspaceHref(d.id)}
                          className="inline-flex rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                          data-testid="open-department-builder"
                        >
                          Manage
                        </Link>
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:items-end">
                      <DepartmentVisibilityForm
                        departmentId={d.id}
                        showInEmployeeApp={d.showInEmployeeApp}
                        assignedEmployeeCount={assignedEmployeeCount(d.id)}
                      />
                      <form action={setDepartmentHeadAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="departmentId" value={d.id} />
                        <label className="text-xs font-medium text-zinc-700">
                          Department Manager
                          <select
                            name="headEmployeeId"
                            defaultValue={d.headEmployeeId ?? ""}
                            className="mt-1 block min-w-[12rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                          >
                            <option value="">Not assigned</option>
                            {(() => {
                              const onRoster = activeEmployees.filter((e) =>
                                isOnDepartmentRoster(e, d.id),
                              );
                              const elsewhere = activeEmployees.filter(
                                (e) => !isOnDepartmentRoster(e, d.id),
                              );
                              return (
                                <>
                                  {onRoster.length > 0 ? (
                                    <optgroup label={`On ${d.name} roster`}>
                                      {onRoster.map((e) => (
                                        <option key={e.id} value={e.id}>
                                          {e.lastName}, {e.firstName}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ) : null}
                                  {elsewhere.length > 0 ? (
                                    <optgroup label="Other employees — add Department membership in Employee Builder first">
                                      {elsewhere.map((e) => (
                                        <option key={e.id} value={e.id} disabled>
                                          {e.lastName}, {e.firstName}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ) : null}
                                </>
                              );
                            })()}
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                        >
                          Save manager
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
