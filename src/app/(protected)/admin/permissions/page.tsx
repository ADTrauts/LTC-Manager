import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { PermissionsManager } from "./permissions-manager";

export default async function AdminPermissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (ROLE_PRIORITY[session.role as AppRole] < ROLE_PRIORITY.GM) {
    redirect("/dashboard");
  }

  const [roles, routes, permissions] = await Promise.all([
    prisma.role.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isActive: true,
      },
    }),
    prisma.appRoute.findMany({
      where: { isActive: true },
      orderBy: [{ navOrder: "asc" }, { pathPrefix: "asc" }],
      select: {
        id: true,
        label: true,
        pathPrefix: true,
        isCritical: true,
      },
    }),
    prisma.roleRoutePermission.findMany({
      select: {
        roleId: true,
        appRouteId: true,
        allowed: true,
      },
    }),
  ]);

  const permissionMap = new Map<string, boolean>();
  for (const item of permissions) {
    permissionMap.set(`${item.appRouteId}:${item.roleId}`, item.allowed);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AdminPageHeader
        title="Roles & Permissions"
        trail={[{ label: "Roles & Permissions" }]}
        subtitle="Configure application roles and control which areas each role may access."
      />

      <PermissionsManager
        roles={roles}
        routes={routes.map((route) => ({
          ...route,
          permissionsByRoleId: Object.fromEntries(
            roles.map((role) => [role.id, permissionMap.get(`${route.id}:${role.id}`) ?? false]),
          ),
        }))}
      />
    </div>
  );
}
