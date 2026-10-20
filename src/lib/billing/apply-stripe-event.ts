import { Prisma, type PrismaClient, type FacilityBillingStatus } from "@prisma/client";
import type { BillingInterval, BillingSetupPath } from "./catalog";
import {
  departmentProductLineageKeys, getDepartmentProduct, installDepartmentsForActiveEntitlements,
  isDepartmentProductCommerciallyRecognized, matchDepartmentRecordForProduct, matchEntitlementStatusForProduct,
  shouldInstallLicensedDepartmentProducts,
} from "@/lib/department-products";
import { prisma } from "@/lib/prisma";

export class SubscriptionMirrorConflict extends Error {}

export async function applyFacilitySubscription(input: {
  facilityId: string;
  status: Exclude<FacilityBillingStatus, "UNMANAGED">;
  interval?: BillingInterval;
  setupPath?: BillingSetupPath;
  stripeSubscriptionId?: string | null;
  departmentKeys?: readonly string[];
  expectedRevision?: string | null;
}, db: PrismaClient = prisma): Promise<{ installationPending: boolean }> {
  const departmentKeys = [...new Set((input.departmentKeys ?? []).map((key) => {
    const product = getDepartmentProduct(key);
    if (!product || !isDepartmentProductCommerciallyRecognized(product)) {
      throw new Error("Unrecognized commercial Product; subscription mirror not changed.");
    }
    return product.installationKey;
  }))];

  await db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${input.facilityId} FOR UPDATE`);
    const previous = await tx.facilityBilling.findUnique({ where: { facilityId: input.facilityId } });
    if (input.expectedRevision !== undefined && (previous?.updatedAt.toISOString() ?? null) !== input.expectedRevision) {
      throw new SubscriptionMirrorConflict("Billing changed during synchronization; retry current Stripe state.");
    }
    if (previous?.stripeSubscriptionId && input.stripeSubscriptionId &&
        previous.stripeSubscriptionId !== input.stripeSubscriptionId &&
        previous.status !== "CANCELED" && previous.status !== "INCOMPLETE") {
      throw new SubscriptionMirrorConflict("Current subscription changed; synchronize again.");
    }
    const billing = await tx.facilityBilling.upsert({
      where: { facilityId: input.facilityId },
      create: {
        facilityId: input.facilityId, status: input.status,
        interval: input.interval ?? "ANNUAL", setupPath: input.setupPath ?? "SELF_SERVE",
        stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
        licensedDepartmentCount: 0,
      },
      update: {
        status: input.status,
        ...(input.interval ? { interval: input.interval } : {}),
        ...(input.setupPath ? { setupPath: input.setupPath } : {}),
        ...(input.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
      },
    });
    const grantsAccess = input.status === "ACTIVE" || input.status === "PAST_DUE";
    await tx.facilityDepartmentEntitlement.updateMany({
      where: {
        facilityId: input.facilityId, status: "ACTIVE",
        ...(grantsAccess && input.departmentKeys !== undefined ? { departmentKey: { notIn: departmentKeys } } : {}),
        // Without an authoritative selection, do not revoke valid access on a status-only grace update.
        ...(grantsAccess && input.departmentKeys === undefined ? { id: { in: [] } } : {}),
      },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    // Grace retains existing grants only; it cannot activate a newly selected Product.
    if (input.status === "ACTIVE") {
      const lookupKeys = [...new Set(departmentKeys.flatMap((key) => departmentProductLineageKeys(getDepartmentProduct(key)!)))];
      const departments = await tx.department.findMany({
        where: { facilityId: input.facilityId, key: { in: lookupKeys } }, select: { id: true, key: true },
      });
      for (const departmentKey of departmentKeys) {
        const row = matchDepartmentRecordForProduct(departments, getDepartmentProduct(departmentKey)!);
        await tx.facilityDepartmentEntitlement.upsert({
          where: { facilityBillingId_departmentKey: { facilityBillingId: billing.id, departmentKey } },
          create: {
            facilityBillingId: billing.id, facilityId: input.facilityId, departmentKey,
            departmentId: row?.id ?? null, status: "ACTIVE", activatedAt: new Date(),
          },
          update: { status: "ACTIVE", departmentId: row?.id ?? null, revokedAt: null },
        });
      }
    }
    const count = await tx.facilityDepartmentEntitlement.count({ where: { facilityId: input.facilityId, status: "ACTIVE" } });
    await tx.facilityBilling.update({ where: { id: billing.id }, data: { licensedDepartmentCount: count } });
  });
  return recoverLicensedDepartmentInstallation(db, input.facilityId);
}

/** Lock + live mirror recheck protects installation from concurrent revocation.
 * Mirror and install are separate commits. Installation failure rolls back only
 * the installation transaction; an already-matching sync must retry this owner.
 */
export async function recoverLicensedDepartmentInstallation(db: PrismaClient, facilityId: string) {
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${facilityId} FOR UPDATE`);
      const billing = await tx.facilityBilling.findUnique({ where: { facilityId }, select: { status: true } });
      if (!billing || !shouldInstallLicensedDepartmentProducts(billing.status)) return;
      const entitlements = await tx.facilityDepartmentEntitlement.findMany({
        where: { facilityId }, select: { departmentKey: true, status: true },
      });
      await installDepartmentsForActiveEntitlements({
        facilityId,
        productKeys: entitlements.flatMap((row) => {
          const product = getDepartmentProduct(row.departmentKey);
          return product && matchEntitlementStatusForProduct(entitlements, product) === "ACTIVE" ? [product.installationKey] : [];
        }),
        prisma: tx,
      });
    }, { timeout: 20_000 });
    return { installationPending: false };
  } catch (error) {
    console.error("billing.installation.pending", { facilityId, error: error instanceof Error ? error.name : "unknown" });
    return { installationPending: true };
  }
}
