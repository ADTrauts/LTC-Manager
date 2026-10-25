import type { Prisma, PrismaClient } from "@prisma/client";

import type { DashboardAuthority, DashboardLayoutOwner, DashboardScopeKind } from "@/lib/dashboard/viewer/types";

import { readDashboardLayoutItems, type DashboardLayoutItemInput } from "./parse";

type LayoutDb = PrismaClient | Prisma.TransactionClient;

function ownerWhere(owner: Exclude<DashboardLayoutOwner, null>, scopeKind: DashboardScopeKind) {
  if (owner.kind === "USER") {
    return { userId: owner.userId, employeeId: null, scopeKind };
  }
  return { userId: null, employeeId: owner.employeeId, scopeKind };
}

export async function loadPersonalDashboardLayout(
  db: LayoutDb,
  input: {
    facilityId: string;
    owner: Exclude<DashboardLayoutOwner, null>;
    scopeKind: DashboardScopeKind;
  },
): Promise<DashboardLayoutItemInput[] | null> {
  const row = await db.dashboardLayout.findFirst({
    where: { facilityId: input.facilityId, ...ownerWhere(input.owner, input.scopeKind) },
    select: { items: true },
  });
  if (!row) return null;
  return readDashboardLayoutItems(row.items);
}

export async function savePersonalDashboardLayout(
  db: LayoutDb,
  input: {
    facilityId: string;
    owner: Exclude<DashboardLayoutOwner, null>;
    scopeKind: DashboardScopeKind;
    items: readonly DashboardLayoutItemInput[];
  },
): Promise<void> {
  const items = input.items.map((item) => ({ card: item.card, size: item.size, rows: item.rows }));
  if (input.owner.kind === "USER") {
    await db.dashboardLayout.upsert({
      where: {
        facilityId_userId_scopeKind: {
          facilityId: input.facilityId,
          userId: input.owner.userId,
          scopeKind: input.scopeKind,
        },
      },
      create: {
        facilityId: input.facilityId,
        userId: input.owner.userId,
        scopeKind: input.scopeKind,
        items,
      },
      update: { items, schemaVersion: 1 },
    });
    return;
  }
  await db.dashboardLayout.upsert({
    where: {
      facilityId_employeeId_scopeKind: {
        facilityId: input.facilityId,
        employeeId: input.owner.employeeId,
        scopeKind: input.scopeKind,
      },
    },
    create: {
      facilityId: input.facilityId,
      employeeId: input.owner.employeeId,
      scopeKind: input.scopeKind,
      items,
    },
    update: { items, schemaVersion: 1 },
  });
}

export async function resetPersonalDashboardLayout(
  db: LayoutDb,
  input: {
    facilityId: string;
    owner: Exclude<DashboardLayoutOwner, null>;
    scopeKind: DashboardScopeKind;
  },
): Promise<void> {
  await db.dashboardLayout.deleteMany({
    where: { facilityId: input.facilityId, ...ownerWhere(input.owner, input.scopeKind) },
  });
}

export async function loadFacilityDashboardDefault(
  db: LayoutDb,
  input: {
    facilityId: string;
    authority: DashboardAuthority;
    scopeKind: DashboardScopeKind;
  },
): Promise<DashboardLayoutItemInput[] | null> {
  const row = await db.dashboardFacilityDefault.findUnique({
    where: {
      facilityId_authority_scopeKind: {
        facilityId: input.facilityId,
        authority: input.authority,
        scopeKind: input.scopeKind,
      },
    },
    select: { items: true },
  });
  if (!row) return null;
  return readDashboardLayoutItems(row.items);
}

export async function saveFacilityDashboardDefault(
  db: LayoutDb,
  input: {
    facilityId: string;
    authority: DashboardAuthority;
    scopeKind: DashboardScopeKind;
    items: readonly DashboardLayoutItemInput[];
  },
): Promise<void> {
  const items = input.items.map((item) => ({ card: item.card, size: item.size, rows: item.rows }));
  await db.dashboardFacilityDefault.upsert({
    where: {
      facilityId_authority_scopeKind: {
        facilityId: input.facilityId,
        authority: input.authority,
        scopeKind: input.scopeKind,
      },
    },
    create: {
      facilityId: input.facilityId,
      authority: input.authority,
      scopeKind: input.scopeKind,
      items,
    },
    update: { items, schemaVersion: 1 },
  });
}
