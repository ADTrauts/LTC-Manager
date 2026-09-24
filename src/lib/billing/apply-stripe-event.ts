import type { BillingInterval, BillingSetupPath } from "./catalog";
import { prisma } from "@/lib/prisma";

export async function applyFacilitySubscription(input: {
  facilityId: string;
  status: "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  interval?: BillingInterval;
  setupPath?: BillingSetupPath;
  stripeSubscriptionId?: string | null;
  departmentKeys?: readonly string[];
}): Promise<void> {
  const departmentKeys = [...new Set(input.departmentKeys ?? [])];

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

    const departments = await tx.department.findMany({
      where: { facilityId: input.facilityId, key: { in: [...departmentKeys] } },
      select: { id: true, key: true },
    });
    const departmentIdByKey = new Map(departments.map((row) => [row.key, row.id]));

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
}
