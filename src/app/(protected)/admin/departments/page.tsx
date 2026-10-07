import Link from "next/link";
import { redirect } from "next/navigation";

import { DepartmentMarketplace } from "@/app/(protected)/admin/departments/department-marketplace";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { applyCheckoutSessionId } from "@/lib/billing/sync-from-stripe";
import { areAllCatalogPricesConfigured } from "@/lib/billing/stripe-prices";
import {
  ADMIN_DEPARTMENTS_HREF,
  ADMIN_DEPARTMENTS_MARKETPLACE_HREF,
  adminDepartmentManageHref,
} from "@/lib/department-administration";
import {
  canPurchaseDepartmentProducts,
  findCatalogItemForDepartmentKey,
  getDepartmentProduct,
  loadCustomerOperableDepartments,
  loadFacilityDepartmentCatalog,
} from "@/lib/department-products";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { prisma } from "@/lib/prisma";
import { isStripeSecretConfigured } from "@/lib/stripe";

type PageProps = {
  searchParams: Promise<{
    checkout?: string;
    session_id?: string;
    marketplace?: string;
  }>;
};

export default async function AdminDepartmentsPage({ searchParams }: PageProps) {
  const session = await assertFacilityAdministratorPage();
  const facilityId = session.facilityId;
  const query = await searchParams;
  const showMarketplace = query.marketplace === "1";

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

  const [operableDepartments, catalog, billing] = await Promise.all([
    loadCustomerOperableDepartments(prisma, facilityId),
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
            headEmployee: { select: { firstName: true, lastName: true } },
          },
        });

  if (catalogBeforeCheckout) {
    const newlyInstalled = catalog.filter((item) => {
      const previous = catalogBeforeCheckout.find((row) => row.productKey === item.productKey);
      return item.installed && item.departmentId && !previous?.installed;
    });
    if (newlyInstalled.length === 1 && newlyInstalled[0]?.departmentId) {
      redirect(adminDepartmentManageHref(newlyInstalled[0].departmentId));
    }
  }

  const canPurchase = canPurchaseDepartmentProducts(session.role);
  const alreadySubscribed = billing?.status === "ACTIVE" || billing?.status === "PAST_DUE";
  const checkoutReady = isStripeSecretConfigured() && areAllCatalogPricesConfigured();

  if (showMarketplace) {
    if (!canPurchase) {
      redirect(ADMIN_DEPARTMENTS_HREF);
    }
    return (
      <div className="mx-auto max-w-5xl space-y-4" data-testid="department-marketplace-page">
        <AdminPageHeader
          title="Add Department"
          subtitle="Choose a Vssyl Department Product. Licensing happens before installation."
          trail={[
            { label: "Departments", href: ADMIN_DEPARTMENTS_HREF },
            { label: "Add Department" },
          ]}
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
    <div className="mx-auto max-w-3xl space-y-4" data-testid="admin-departments">
      <AdminPageHeader
        title="Departments"
        subtitle="Installed Department Products for this facility. Add Departments from the Marketplace."
        trail={[{ label: "Departments" }]}
        actions={
          canPurchase ? (
            <Link
              href={ADMIN_DEPARTMENTS_MARKETPLACE_HREF}
              className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-700"
              data-testid="add-department-button"
            >
              Add Department
            </Link>
          ) : undefined
        }
      />

      {query.checkout === "canceled" ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Checkout was canceled. No department was licensed or installed.
        </p>
      ) : null}

      {departments.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          No departments are installed at this facility yet. Add a Vssyl department from the
          Marketplace.
        </div>
      ) : (
        <section className="space-y-2" data-testid="installed-departments">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Installed Departments
          </h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {departments.map((d) => {
              const product = getDepartmentProduct(d.key);
              const catalogItem = findCatalogItemForDepartmentKey(catalog, d.key);
              const licensed = catalogItem?.licensed ?? false;
              const managerName =
                d.headEmployee?.firstName && d.headEmployee?.lastName
                  ? `${d.headEmployee.firstName} ${d.headEmployee.lastName}`
                  : "Not assigned";
              return (
                <li key={d.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{d.name}</p>
                      {product ? (
                        <p className="mt-0.5 text-xs text-zinc-600">Product: {product.name}</p>
                      ) : null}
                      <p className="text-xs text-zinc-500">
                        {licensed ? (
                          <span className="text-emerald-800">Licensed</span>
                        ) : (
                          <span>Installed</span>
                        )}
                        <span className="mx-1.5 text-zinc-300">·</span>
                        {d.isActive ? (
                          <span>Enabled</span>
                        ) : (
                          <span className="text-zinc-600">Inactive</span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Department Manager: {managerName}
                      </p>
                    </div>
                    <Link
                      href={adminDepartmentManageHref(d.id)}
                      className="inline-flex self-start rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                      data-testid="manage-department"
                    >
                      Manage
                    </Link>
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
