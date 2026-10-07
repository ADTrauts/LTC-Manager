/**
 * Install a Vssyl Department Product at one Facility.
 *
 * Creates (or returns) the facility-scoped Department row whose `key` is the
 * product key. Does not create billing entitlements — those stay on checkout.
 * Does not materialize cycle/work/evidence starters — those remain
 * configuration-time.
 */

import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { ensureInitialDepartmentOperator } from "@/lib/department-operators";

import {
  getDepartmentProduct,
  isDepartmentProductAvailableForInstall,
  matchDepartmentRecordForProduct,
  type DepartmentProduct,
  type DepartmentProductStatus,
} from "./registry";

export type DepartmentProductInstallAudience = "customer" | "internal-development";

export type DepartmentProductDbClient = PrismaClient | Prisma.TransactionClient;

export type DepartmentProductInstallErrorCode =
  | "UNKNOWN_PRODUCT"
  | "UNAVAILABLE_PRODUCT"
  | "FACILITY_NOT_FOUND"
  | "INVALID_INPUT";

export class DepartmentProductInstallError extends Error {
  readonly code: DepartmentProductInstallErrorCode;

  constructor(code: DepartmentProductInstallErrorCode, message: string) {
    super(message);
    this.name = "DepartmentProductInstallError";
    this.code = code;
  }
}

export type InstalledDepartmentProduct = {
  id: string;
  facilityId: string;
  key: string;
  name: string;
  productKey: string;
  created: boolean;
};

export type InstallDepartmentProductInput = {
  facilityId: string;
  productKey: string;
  prisma: DepartmentProductDbClient;
};

/**
 * Validate customer-selected keys against the AVAILABLE registry.
 * Rejects blank input and unknown, DEVELOPMENT, or RETIRED keys.
 */
export function resolvePublishedDepartmentProductKeys(
  keys: readonly string[],
): string[] {
  const unique = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new DepartmentProductInstallError(
      "INVALID_INPUT",
      "Select at least one Department Product.",
    );
  }
  const installationKeys: string[] = [];
  const seen = new Set<string>();
  for (const key of unique) {
    const installationKey = resolveDepartmentProductForInstall(key).installationKey;
    if (seen.has(installationKey)) continue;
    seen.add(installationKey);
    installationKeys.push(installationKey);
  }
  return installationKeys;
}

export function resolveDepartmentProductForInstall(
  productKey: string,
): DepartmentProduct {
  const trimmed = productKey.trim();
  if (!trimmed) {
    throw new DepartmentProductInstallError(
      "INVALID_INPUT",
      "A Department Product key is required.",
    );
  }
  const product = getDepartmentProduct(trimmed);
  if (!product) {
    throw new DepartmentProductInstallError(
      "UNKNOWN_PRODUCT",
      "That Department Product is not published by Vssyl.",
    );
  }
  if (!isDepartmentProductAvailableForInstall(product)) {
    throw new DepartmentProductInstallError(
      "UNAVAILABLE_PRODUCT",
      `${product.name} is not available for installation.`,
    );
  }
  return product;
}

export function resolveDepartmentProductForInternalInstall(
  productKey: string,
): DepartmentProduct {
  const trimmed = productKey.trim();
  if (!trimmed) {
    throw new DepartmentProductInstallError(
      "INVALID_INPUT",
      "A Department Product key is required.",
    );
  }
  const product = getDepartmentProduct(trimmed);
  if (!product) {
    throw new DepartmentProductInstallError(
      "UNKNOWN_PRODUCT",
      "That Department Product is not published by Vssyl.",
    );
  }
  return product;
}

/**
 * Materialize a resolved Department Product as a facility Department row.
 * Test-only products may be passed here without being in the production registry.
 */
export async function installResolvedDepartmentProduct(input: {
  facilityId: string;
  product: {
    productKey: string;
    name: string;
    sortOrder: number;
    status: DepartmentProductStatus;
    installationKey?: string;
    defaultDepartmentName?: string;
  };
  prisma: DepartmentProductDbClient;
  audience?: DepartmentProductInstallAudience;
}): Promise<InstalledDepartmentProduct> {
  const audience = input.audience ?? "customer";
  if (
    audience !== "internal-development" &&
    !isDepartmentProductAvailableForInstall(input.product)
  ) {
    throw new DepartmentProductInstallError(
      "UNAVAILABLE_PRODUCT",
      `${input.product.name} is not available for installation.`,
    );
  }

  const facility = await input.prisma.facility.findUnique({
    where: { id: input.facilityId },
    select: { id: true },
  });
  if (!facility) {
    throw new DepartmentProductInstallError(
      "FACILITY_NOT_FOUND",
      "Facility not found.",
    );
  }

  const installationKey = input.product.installationKey ?? input.product.productKey;
  const localName = input.product.defaultDepartmentName ?? input.product.name;
  const lookupKeys = [...new Set([installationKey, input.product.productKey])];
  const existingRows = await Promise.all(
    lookupKeys.map((key) =>
      input.prisma.department.findUnique({
        where: {
          facilityId_key: {
            facilityId: input.facilityId,
            key,
          },
        },
        select: { id: true, facilityId: true, key: true, name: true },
      }),
    ),
  );
  const existing = matchDepartmentRecordForProduct(
    existingRows.filter((row): row is NonNullable<(typeof existingRows)[number]> => Boolean(row)),
    { productKey: input.product.productKey, installationKey },
  );
  if (existing) {
    await ensureInitialDepartmentOperator(input.prisma, {
      departmentId: existing.id,
      facilityId: existing.facilityId,
    });
    return {
      id: existing.id,
      facilityId: existing.facilityId,
      key: existing.key,
      name: existing.name,
      productKey: input.product.productKey,
      created: false,
    };
  }

  const created = await input.prisma.department.create({
    data: {
      facilityId: input.facilityId,
      key: installationKey,
      name: localName,
      sortOrder: input.product.sortOrder,
      isActive: true,
      showInEmployeeApp: true,
    },
    select: { id: true, facilityId: true, key: true, name: true },
  });

  await ensureInitialDepartmentOperator(input.prisma, {
    departmentId: created.id,
    facilityId: created.facilityId,
  });

  return {
    id: created.id,
    facilityId: created.facilityId,
    key: created.key,
    name: created.name,
    productKey: input.product.productKey,
    created: true,
  };
}

/**
 * Canonical operation: install this Vssyl Department Product at this facility.
 * Idempotent: a second call returns the existing Department row.
 * Never mints `DIETARY_2` for a second Dietary install at the same facility.
 */
export async function installDepartmentProduct(
  input: InstallDepartmentProductInput,
): Promise<InstalledDepartmentProduct> {
  const facilityId = input.facilityId.trim();
  if (!facilityId) {
    throw new DepartmentProductInstallError("INVALID_INPUT", "A facility is required.");
  }
  const product = resolveDepartmentProductForInstall(input.productKey);
  return installResolvedDepartmentProduct({
    facilityId,
    product,
    prisma: input.prisma,
    audience: "customer",
  });
}

/**
 * Seed / fixture / Harbor development install.
 * May materialize DEVELOPMENT products. Never used by customer Marketplace.
 */
export async function installDepartmentProductForInternalDevelopment(
  input: InstallDepartmentProductInput,
): Promise<InstalledDepartmentProduct> {
  const facilityId = input.facilityId.trim();
  if (!facilityId) {
    throw new DepartmentProductInstallError("INVALID_INPUT", "A facility is required.");
  }
  const product = resolveDepartmentProductForInternalInstall(input.productKey);
  return installResolvedDepartmentProduct({
    facilityId,
    product,
    prisma: input.prisma,
    audience: "internal-development",
  });
}
