"use client";

import { useMemo, useState } from "react";

import {
  archiveJobRoleAction,
  createJobRoleAction,
  updateJobRoleAction,
} from "@/app/(protected)/employees/job-roles/actions";
import { Button } from "@/components/design-system/Button";
import { EmptyState } from "@/components/design-system/EmptyState";
import { Select, TextArea, TextInput } from "@/components/design-system/Field";
import { Drawer } from "@/components/drawer";
import {
  DEPARTMENT_JOB_ROLE_TIERS,
  JOB_ROLE_TIER_LABEL,
  capabilitiesByCategory,
  defaultCapabilitiesForTier,
  type DepartmentJobRoleView,
  type JobRoleTier,
  type OperationalCapabilityKey,
} from "@/lib/department-job-roles";

type Props = {
  departmentId: string;
  departmentName: string;
  roles: DepartmentJobRoleView[];
  canManage: boolean;
};

function CapabilityEditor({
  selected,
  onChange,
}: {
  selected: Set<OperationalCapabilityKey>;
  onChange: (next: Set<OperationalCapabilityKey>) => void;
}) {
  const groups = useMemo(() => capabilitiesByCategory(), []);

  return (
    <div className="space-y-4" data-testid="job-role-capabilities">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Capabilities</p>
      {groups.map((group) => (
        <fieldset key={group.category} className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">{group.category}</legend>
          <div className="space-y-1.5">
            {group.items.map((item) => {
              const checked = selected.has(item.key);
              return (
                <label key={item.key} className="flex items-start gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    name="capabilities"
                    value={item.key}
                    checked={checked}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.currentTarget.checked) next.add(item.key);
                      else next.delete(item.key);
                      onChange(next);
                    }}
                    className="mt-0.5"
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function RoleFormFields({
  defaults,
}: {
  defaults?: {
    displayName: string;
    tier: JobRoleTier;
    description: string | null;
    capabilities: OperationalCapabilityKey[];
  };
}) {
  const [tier, setTier] = useState<JobRoleTier>(defaults?.tier ?? "TEAM_MEMBER");
  const [capabilities, setCapabilities] = useState<Set<OperationalCapabilityKey>>(
    () => new Set(defaults?.capabilities ?? defaultCapabilitiesForTier("TEAM_MEMBER")),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">About</p>
        <TextInput
          name="displayName"
          label="Name"
          required
          defaultValue={defaults?.displayName ?? ""}
          data-testid="job-role-display-name"
        />
        <Select
          name="tier"
          label="Generic tier"
          value={tier}
          onChange={(event) => {
            const next = event.currentTarget.value as JobRoleTier;
            setTier(next);
            if (!defaults) {
              setCapabilities(new Set(defaultCapabilitiesForTier(next)));
            }
          }}
          data-testid="job-role-tier"
        >
          {DEPARTMENT_JOB_ROLE_TIERS.map((value) => (
            <option key={value} value={value}>
              {JOB_ROLE_TIER_LABEL[value]}
            </option>
          ))}
        </Select>
        <TextArea
          name="description"
          label="Description"
          defaultValue={defaults?.description ?? ""}
          rows={3}
        />
      </div>
      <CapabilityEditor selected={capabilities} onChange={setCapabilities} />
    </div>
  );
}

export function JobRolesWorkspace({ departmentId, departmentName, roles, canManage }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const editing = roles.find((role) => role.id === editingRoleId) ?? null;

  return (
    <section className="space-y-4" data-testid="job-roles-workspace">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Job Roles</h1>
          <p className="max-w-3xl text-sm text-zinc-600">
            Operational roles for <span className="font-medium text-zinc-800">{departmentName}</span>.
            Rename freely — the generic tier stays the relative level underneath.
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={() => setCreateOpen(true)} data-testid="add-job-role">
            Add role
          </Button>
        ) : null}
      </header>

      {roles.length === 0 ? (
        <EmptyState
          title="No Job Roles yet"
          description="Add a role or wait for starter roles to appear for this Department."
        />
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {roles.map((role) => (
            <li
              key={role.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              data-testid={`job-role-row-${role.id}`}
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">{role.displayName}</p>
                <p className="text-sm text-zinc-600">
                  {JOB_ROLE_TIER_LABEL[role.tier]}
                  {role.employeeCount > 0
                    ? ` · ${role.employeeCount} employee${role.employeeCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditingRoleId(role.id)}
                    data-testid={`edit-job-role-${role.id}`}
                  >
                    Edit
                  </Button>
                  <form action={archiveJobRoleAction}>
                    <input type="hidden" name="roleId" value={role.id} />
                    <Button type="submit" variant="secondary" data-testid={`archive-job-role-${role.id}`}>
                      Archive
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Add Job Role">
        <form action={createJobRoleAction} className="space-y-4">
          <input type="hidden" name="departmentId" value={departmentId} />
          <RoleFormFields />
          <Button type="submit">Create role</Button>
        </form>
      </Drawer>

      <Drawer
        open={Boolean(editing)}
        onClose={() => setEditingRoleId(null)}
        title={editing ? `Edit ${editing.displayName}` : "Edit Job Role"}
      >
        {editing ? (
          <form action={updateJobRoleAction} className="space-y-4">
            <input type="hidden" name="roleId" value={editing.id} />
            <RoleFormFields
              defaults={{
                displayName: editing.displayName,
                tier: editing.tier,
                description: editing.description,
                capabilities: editing.capabilities,
              }}
            />
            <Button type="submit">Save changes</Button>
          </form>
        ) : null}
      </Drawer>
    </section>
  );
}
