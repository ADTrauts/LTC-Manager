import Link from "next/link";
import { redirect } from "next/navigation";

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
      <div>
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="font-medium text-zinc-700 hover:text-zinc-900">
            Admin
          </Link>
          <span className="mx-1.5 text-zinc-400">/</span>
          <span className="text-zinc-600">Permissions</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Jobs and route permissions</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Manage app jobs and control which routes each job can access.
        </p>
      </div>

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
