import {
  getDepartmentProduct,
  isDepartmentProductAvailableForInstall,
} from "./registry";
import {
  installDepartmentProduct,
  type DepartmentProductDbClient,
  type InstalledDepartmentProduct,
} from "./install";

export function shouldInstallLicensedDepartmentProducts(
  status: "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "CANCELED",
): boolean {
  return status === "ACTIVE" || status === "PAST_DUE";
}

/**
 * After commercial entitlement is ACTIVE, install each AVAILABLE product.
 * DEVELOPMENT and RETIRED keys are skipped (no new customer install).
 * Idempotent: existing Department rows are reused. Safe for webhook retries.
 */
export async function installDepartmentsForActiveEntitlements(input: {
  facilityId: string;
  productKeys: readonly string[];
  prisma: DepartmentProductDbClient;
}): Promise<InstalledDepartmentProduct[]> {
  const installed: InstalledDepartmentProduct[] = [];
  const uniqueKeys = [...new Set(input.productKeys.map((key) => key.trim()).filter(Boolean))];

  for (const productKey of uniqueKeys) {
    const product = getDepartmentProduct(productKey);
    if (!product || !isDepartmentProductAvailableForInstall(product)) {
      continue;
    }
    installed.push(
      await installDepartmentProduct({
        facilityId: input.facilityId,
        productKey: product.productKey,
        prisma: input.prisma,
      }),
    );
  }

  await linkEntitlementsToInstalledDepartments({
    facilityId: input.facilityId,
    installed,
    prisma: input.prisma,
  });

  return installed;
}

async function linkEntitlementsToInstalledDepartments(input: {
  facilityId: string;
  installed: readonly InstalledDepartmentProduct[];
  prisma: DepartmentProductDbClient;
}): Promise<void> {
  if (input.installed.length === 0) return;

  const billing = await input.prisma.facilityBilling.findUnique({
    where: { facilityId: input.facilityId },
    select: { id: true },
  });
  if (!billing) return;

  for (const row of input.installed) {
    await input.prisma.facilityDepartmentEntitlement.updateMany({
      where: {
        facilityBillingId: billing.id,
        departmentKey: row.key,
        status: "ACTIVE",
      },
      data: { departmentId: row.id },
    });
  }
}