"use server";

import { RoleKey } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { clearRoutePermissionCache } from "@/lib/route-permissions";

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(280).optional(),
  isActive: z.boolean(),
});

const setPermissionSchema = z.object({
  roleId: z.string().min(1),
  appRouteId: z.string().min(1),
  allowed: z.boolean(),
});

const createRoleSchema = z.object({
  key: z.nativeEnum(RoleKey),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(280).optional(),
});

async function assertFacilityAdministratorSession() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  return session;
}

function revalidatePermissionsViews() {
  clearRoutePermissionCache();
  revalidatePath("/admin/permissions");
}

export async function updateRoleAction(formData: FormData) {
  const session = await assertFacilityAdministratorSession();
  const parsed = updateRoleSchema.parse({
    roleId: formData.get("roleId"),
    name: formData.get("name"),
    description:
      typeof formData.get("description") === "string" && String(formData.get("description")).trim() !== ""
        ? formData.get("description")
        : undefined,
    isActive: formData.get("isActive") === "true",
  });

  const role = await prisma.role.findUnique({
    where: { id: parsed.roleId },
    select: { key: true },
  });
  if (!role) throw new Error("Role not found.");
  if (role.key === RoleKey.GM && !parsed.isActive) {
    throw new Error("General Manager role cannot be deactivated.");
  }
  if (role.key === RoleKey.FACILITY_ADMINISTRATOR && !parsed.isActive) {
    throw new Error("Facility Administrator role cannot be deactivated.");
  }
  if (role.key === session.role && !parsed.isActive) {
    throw new Error("You cannot deactivate your current role.");
  }

  await prisma.role.update({
    where: { id: parsed.roleId },
    data: {
      name: parsed.name,
      description: parsed.description ?? null,
      isActive: parsed.isActive,
    },
  });

  revalidatePermissionsViews();
}

export async function createRoleAction(formData: FormData) {
  await assertFacilityAdministratorSession();
  const parsed = createRoleSchema.parse({
    key: formData.get("key"),
    name: formData.get("name"),
    description:
      typeof formData.get("description") === "string" && String(formData.get("description")).trim() !== ""
        ? formData.get("description")
        : undefined,
  });

  const existing = await prisma.role.findUnique({ where: { key: parsed.key }, select: { id: true } });
  if (existing) {
    throw new Error("That role key already exists.");
  }

  const role = await prisma.role.create({
    data: {
      key: parsed.key,
      name: parsed.name,
      description: parsed.description ?? null,
      isActive: true,
    },
    select: { id: true },
  });

  const routes = await prisma.appRoute.findMany({
    where: { isActive: true },
    select: { id: true, isCritical: true },
  });

  if (routes.length > 0) {
    await prisma.roleRoutePermission.createMany({
      data: routes.map((route) => ({
        roleId: role.id,
        appRouteId: route.id,
        allowed:
          route.isCritical ?
            parsed.key === RoleKey.FACILITY_ADMINISTRATOR || parsed.key === RoleKey.GM
          : false,
      })),
    });
  }

  revalidatePermissionsViews();
}

export async function setRoutePermissionAction(formData: FormData) {
  await assertFacilityAdministratorSession();
  const parsed = setPermissionSchema.parse({
    roleId: formData.get("roleId"),
    appRouteId: formData.get("appRouteId"),
    allowed: formData.get("allowed") === "true",
  });

  const [route, role] = await Promise.all([
    prisma.appRoute.findUnique({
      where: { id: parsed.appRouteId },
      select: { id: true, isCritical: true, pathPrefix: true },
    }),
    prisma.role.findUnique({
      where: { id: parsed.roleId },
      select: { id: true, key: true, isActive: true },
    }),
  ]);

  if (!route || !role) throw new Error("Invalid role or route.");
  if (!role.isActive) throw new Error("Cannot assign permissions to an inactive role.");

  if (route.isCritical && !parsed.allowed) {
    const stillAllowedCount = await prisma.roleRoutePermission.count({
      where: {
        appRouteId: route.id,
        allowed: true,
        role: { isActive: true },
        NOT: { roleId: role.id },
      },
    });
    if (stillAllowedCount === 0) {
      throw new Error("Critical routes must remain assigned to at least one active role.");
    }
  }

  await prisma.roleRoutePermission.upsert({
    where: {
      roleId_appRouteId: {
        roleId: role.id,
        appRouteId: route.id,
      },
    },
    update: { allowed: parsed.allowed },
    create: {
      roleId: role.id,
      appRouteId: route.id,
      allowed: parsed.allowed,
    },
  });

  revalidatePermissionsViews();
}

export async function cloneRolePermissionsAction(formData: FormData) {
  await assertFacilityAdministratorSession();
  const sourceRoleId = String(formData.get("sourceRoleId") ?? "");
  const targetRoleId = String(formData.get("targetRoleId") ?? "");
  if (!sourceRoleId || !targetRoleId || sourceRoleId === targetRoleId) {
    throw new Error("Choose source and target roles.");
  }

  const sourcePerms = await prisma.roleRoutePermission.findMany({
    where: { roleId: sourceRoleId },
    select: { appRouteId: true, allowed: true },
  });

  await prisma.$transaction(
    sourcePerms.map((perm) =>
      prisma.roleRoutePermission.upsert({
        where: {
          roleId_appRouteId: {
            roleId: targetRoleId,
            appRouteId: perm.appRouteId,
          },
        },
        update: { allowed: perm.allowed },
        create: {
          roleId: targetRoleId,
          appRouteId: perm.appRouteId,
          allowed: perm.allowed,
        },
      }),
    ),
  );

  revalidatePermissionsViews();
}
