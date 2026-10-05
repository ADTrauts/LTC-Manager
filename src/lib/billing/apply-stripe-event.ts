import type { BillingInterval, BillingSetupPath } from "./catalog";
import {
  departmentProductLineageKeys,
  getDepartmentProduct,
  installDepartmentsForActiveEntitlements,
  isDepartmentProductCommerciallyRecognized,
  matchDepartmentRecordForProduct,
  shouldInstallLicensedDepartmentProducts,
} from "@/lib/department-products";
import { prisma } from "@/lib/prisma";

export async function applyFacilitySubscription(input: {
  facilityId: string;
  status: "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  interval?: BillingInterval;
  setupPath?: BillingSetupPath;
  stripeSubscriptionId?: string | null;
  departmentKeys?: readonly string[];
}): Promise<void> {
  const departmentKeys = [
    ...new Set(
      (input.departmentKeys ?? []).flatMap((key) => {
        const product = getDepartmentProduct(key);
        if (!product || !isDepartmentProductCommerciallyRecognized(product)) return [];
        return [product.installationKey];
      }),
    ),
  ];

  await prisma.$transaction(async (tx) => {
    const billing = await tx.facilityBilling.upsert({
      where: { facilityId: input.facilityId },
      create: {
        facilityId: input.facilityId,
        status: input.status,
        interval: input.interval ?? "ANNUAL",
        setupPath: input.setupPath ?? "SELF_SERVE",
        stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
        licensedDepartmentCount: departmentKeys.length > 0 ? departmentKeys.length : undefined,
      },
      update: {
        status: input.status,
        ...(input.interval ? { interval: input.interval } : {}),
        ...(input.setupPath ? { setupPath: input.setupPath } : {}),
        ...(input.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: input.stripeSubscriptionId }
          : {}),
        ...(departmentKeys.length > 0 ? { licensedDepartmentCount: departmentKeys.length } : {}),
      },
    });

    if (departmentKeys.length === 0) {
      return;
    }

    const lookupKeys = [
      ...new Set(
        departmentKeys.flatMap((key) => {
          const product = getDepartmentProduct(key);
          return product ? departmentProductLineageKeys(product) : [key];
        }),
      ),
    ];
    const departments = await tx.department.findMany({
      where: { facilityId: input.facilityId, key: { in: lookupKeys } },
      select: { id: true, key: true },
    });
    const departmentIdByKey = new Map<string, string>();
    for (const departmentKey of departmentKeys) {
      const product = getDepartmentProduct(departmentKey);
      const row = product
        ? matchDepartmentRecordForProduct(departments, product)
        : departments.find((item) => item.key === departmentKey);
      if (row) departmentIdByKey.set(departmentKey, row.id);
    }

    await tx.facilityDepartmentEntitlement.updateMany({
      where: {
        facilityBillingId: billing.id,
        departmentKey: { notIn: [...departmentKeys] },
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    for (const departmentKey of departmentKeys) {
      await tx.facilityDepartmentEntitlement.upsert({
        where: {
          facilityBillingId_departmentKey: {
            facilityBillingId: billing.id,
            departmentKey,
          },
        },
        create: {
          facilityBillingId: billing.id,
          facilityId: input.facilityId,
          departmentKey,
          departmentId: departmentIdByKey.get(departmentKey) ?? null,
          status: "ACTIVE",
          activatedAt: new Date(),
        },
        update: {
          status: "ACTIVE",
          departmentId: departmentIdByKey.get(departmentKey) ?? null,
          revokedAt: null,
        },
      });
    }
  });

  if (
    departmentKeys.length > 0 &&
    shouldInstallLicensedDepartmentProducts(input.status)
  ) {
    await installDepartmentsForActiveEntitlements({
      facilityId: input.facilityId,
      productKeys: departmentKeys,
      prisma,
    });
  }
}
