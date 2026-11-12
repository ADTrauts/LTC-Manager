"use client";

import { useState } from "react";

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  qualifiedRoleKeys: string[];
};

type RoleOption = { key: string; label: string };

export function AssignmentEligibilityFields({
  employees,
  roles,
  canOverride = false,
}: {
  employees: EmployeeOption[];
  roles: RoleOption[];
  canOverride?: boolean;
}) {
  const [roleKey, setRoleKey] = useState("");
  const [exception, setException] = useState(false);
  const qualified = employees.filter((employee) => employee.qualifiedRoleKeys.includes(roleKey));
  const shown = !roleKey ? [] : exception ? employees : qualified;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          name="roleKey"
          aria-label="Operational role"
          required
          value={roleKey}
          onChange={(event) => {
            setRoleKey(event.target.value);
            setException(false);
          }}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="">Operational role…</option>
          {roles.map((role) => (
            <option key={role.key} value={role.key}>
              {role.label}
            </option>
          ))}
        </select>
        <select key={`${roleKey}:${exception}`} name="employeeId" aria-label="Employee" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
          <option value="">{roleKey ? "Eligible employee…" : "Choose a role first"}</option>
          {shown.map((employee) => {
            const eligible = employee.qualifiedRoleKeys.includes(roleKey);
            return (
              <option key={employee.id} value={employee.id}>
                {employee.lastName}, {employee.firstName}
                {eligible ? "" : " (not eligible)"}
              </option>
            );
          })}
        </select>
      </div>
      {roleKey && canOverride ? (
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={exception}
            onChange={(event) => setException(event.target.checked)}
          />
          Assign someone who is not eligible for this role
        </label>
      ) : null}
      {exception ? (
        <input
          type="text"
          name="eligibilityExceptionReason"
          aria-label="Eligibility exception reason"
          required
          maxLength={500}
          placeholder="Why this person is being assigned without eligibility"
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      ) : null}
    </div>
  );
}
