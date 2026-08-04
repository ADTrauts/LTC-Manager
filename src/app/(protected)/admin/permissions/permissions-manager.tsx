"use client";

import { RoleKey } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  cloneRolePermissionsAction,
  createRoleAction,
  setRoutePermissionAction,
  updateRoleAction,
} from "./actions";

type RoleView = {
  id: string;
  key: RoleKey;
  name: string;
  description: string | null;
  isActive: boolean;
};

type RouteView = {
  id: string;
  label: string;
  pathPrefix: string;
  isCritical: boolean;
  permissionsByRoleId: Record<string, boolean>;
};

const ROLE_KEYS: RoleKey[] = [
  RoleKey.FACILITY_ADMINISTRATOR,
  RoleKey.GM,
  RoleKey.MANAGER,
  RoleKey.SUPERVISOR,
  RoleKey.LEAD_TEAM_MEMBER,
  RoleKey.STAFF,
];

export function PermissionsManager({ roles, routes }: { roles: RoleView[]; routes: RouteView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const availableKeys = ROLE_KEYS.filter((key) => !roles.some((role) => role.key === key));

  async function runAction(key: string, fn: () => Promise<void>) {
    setError(null);
    setPendingKey(key);
    try {
      await fn();
      router.refresh();
    } catch {
      setError("Could not save permissions. Try again.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Roles</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Edit role labels and activate or deactivate roles used in access control.
        </p>
        <div className="mt-4 space-y-3">
          {roles.map((role) => (
            <form
              key={role.id}
              action={(formData) => runAction(`role-${role.id}`, () => updateRoleAction(formData))}
              className="grid gap-3 rounded-lg border border-zinc-200 p-3 md:grid-cols-[12rem_1fr_auto]"
            >
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">{role.key}</p>
                <p className="text-sm font-medium text-zinc-900">{role.name}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <input type="hidden" name="roleId" value={role.id} />
                <input
                  name="name"
                  defaultValue={role.name}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
                />
                <input
                  name="description"
                  defaultValue={role.description ?? ""}
                  placeholder="Optional description"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-900 focus:ring-2"
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input type="hidden" name="isActive" value="false" />
                  <input type="checkbox" name="isActive" value="true" defaultChecked={role.isActive} />
                  Active
                </label>
                <button
                  type="submit"
                  disabled={pendingKey === `role-${role.id}`}
                  className="app-accent-button rounded-md px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                >
                  Save
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Add role</h2>
            <p className="mt-1 text-sm text-zinc-600">Create a missing system role if it was previously removed.</p>
          </div>
          <form
            action={(formData) => runAction("role-create", () => createRoleAction(formData))}
            className="grid w-full max-w-xl gap-2 md:grid-cols-[10rem_1fr_1fr_auto]"
          >
            <select
              name="key"
              defaultValue={availableKeys[0] ?? ""}
              disabled={availableKeys.length === 0}
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm"
            >
              {availableKeys.length === 0 ? <option value="">No available keys</option> : null}
              {availableKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <input
              name="name"
              placeholder="Role display name"
              disabled={availableKeys.length === 0}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              name="description"
              placeholder="Description (optional)"
              disabled={availableKeys.length === 0}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={availableKeys.length === 0 || pendingKey === "role-create"}
              className="app-accent-button rounded-md px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              Add
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Route access matrix</h2>
            <p className="mt-1 text-sm text-zinc-600">Toggle page access per role. Critical routes must remain assigned.</p>
          </div>
          <form
            action={(formData) => runAction("clone", () => cloneRolePermissionsAction(formData))}
            className="flex items-center gap-2"
          >
            <select name="sourceRoleId" className="rounded-md border border-zinc-300 px-2 py-2 text-sm">
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  Copy from {role.name}
                </option>
              ))}
            </select>
            <select name="targetRoleId" className="rounded-md border border-zinc-300 px-2 py-2 text-sm">
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  To {role.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pendingKey === "clone"}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Clone
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-600">
                <th className="px-3 py-2 font-medium">Route</th>
                {roles.map((role) => (
                  <th key={role.id} className="px-3 py-2 font-medium">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-zinc-900">{route.label}</p>
                    <p className="text-xs text-zinc-500">
                      {route.pathPrefix}
                      {route.isCritical ? " • critical" : ""}
                    </p>
                  </td>
                  {roles.map((role) => {
                    const allowed = route.permissionsByRoleId[role.id] ?? false;
                    const rowKey = `${route.id}:${role.id}`;
                    return (
                      <td key={rowKey} className="px-3 py-2">
                        <form
                          action={(formData) => runAction(rowKey, () => setRoutePermissionAction(formData))}
                          className="inline-flex items-center gap-2"
                        >
                          <input type="hidden" name="roleId" value={role.id} />
                          <input type="hidden" name="appRouteId" value={route.id} />
                          <input type="hidden" name="allowed" value={allowed ? "false" : "true"} />
                          <button
                            type="submit"
                            disabled={pendingKey === rowKey || !role.isActive}
                            className={`rounded-md px-2 py-1 text-xs font-medium ${
                              allowed
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                            } disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500`}
                          >
                            {allowed ? "Allowed" : "Blocked"}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
