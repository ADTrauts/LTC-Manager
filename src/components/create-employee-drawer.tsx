"use client";

import { EmploymentType, EmployeeStatus, RoleKey } from "@prisma/client";
import { useState } from "react";

import { createEmployeeAction } from "@/app/(protected)/employees/actions";
import {
  EmployeeOrganizationFields,
  type OrganizationJobRoleOption,
} from "@/components/employee-organization-fields";
import { Button } from "@/components/design-system/Button";
import { Select, TextInput } from "@/components/design-system/Field";
import {
  AUTHORITY_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
} from "@/lib/employee-hr-labels";
import {
  defaultAccessMethodForRole,
  type AccessMethod,
  requiresEmailPasswordAccount,
} from "@/lib/credential-policy";
import { Drawer } from "@/components/drawer";

type UnitOption = { id: string; name: string };
type TeamOption = { id: string; displayName: string; departmentId: string };

type CreateEmployeeDrawerProps = {
  units: UnitOption[];
  departments: UnitOption[];
  jobTitles: UnitOption[];
  teams: TeamOption[];
  jobRoles?: OrganizationJobRoleOption[];
};

export function CreateEmployeeDrawer({
  units: _units,
  departments,
  jobTitles: _jobTitles,
  teams,
  jobRoles = [],
}: CreateEmployeeDrawerProps) {
  const [open, setOpen] = useState(false);
  const [roleType, setRoleType] = useState<RoleKey>(RoleKey.STAFF);
  const [accessMethod, setAccessMethod] = useState<AccessMethod>(defaultAccessMethodForRole(RoleKey.STAFF));

  function onRoleChange(nextRole: RoleKey) {
    setRoleType(nextRole);
    setAccessMethod(defaultAccessMethodForRole(nextRole));
  }

  const emailRequired =
    requiresEmailPasswordAccount(roleType) || accessMethod === "EMAIL_PASSWORD";

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="shrink-0">
        Add employee
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Add employee">
        <form
          action={async (formData) => {
            await createEmployeeAction(formData);
            setOpen(false);
          }}
          className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <TextInput name="firstName" label="First name" required autoComplete="given-name" />
          <TextInput name="lastName" label="Last name" required autoComplete="family-name" />
          <TextInput
            name="email"
            type="email"
            label="Email"
            required={emailRequired}
            helper={emailRequired ? undefined : "Optional"}
            autoComplete="email"
          />
          <TextInput name="phone" label="Phone" helper="Optional" autoComplete="tel" />
          <Select
            name="roleType"
            label="Platform authority"
            helper="Controls application-level access. Department work permissions come from Job Roles."
            value={roleType}
            onChange={(event) => onRoleChange(event.currentTarget.value as RoleKey)}
          >
            {Object.values(RoleKey).map((value) => (
              <option key={value} value={value}>
                {AUTHORITY_LABEL[value]}
              </option>
            ))}
          </Select>
          <Select name="employmentType" label="Employment type" defaultValue={EmploymentType.FULL_TIME}>
            {Object.values(EmploymentType).map((value) => (
              <option key={value} value={value}>
                {EMPLOYMENT_TYPE_LABEL[value]}
              </option>
            ))}
          </Select>
          <Select name="status" label="Status" defaultValue={EmployeeStatus.ACTIVE}>
            {Object.values(EmployeeStatus).map((value) => (
              <option key={value} value={value}>
                {EMPLOYEE_STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm sm:col-span-2">
            {requiresEmailPasswordAccount(roleType) ? (
              <>
                <input type="hidden" name="accessMethod" value="EMAIL_PASSWORD" />
                <p className="text-xs font-medium text-zinc-700">Access method</p>
                <p className="mt-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
                  Email + password{" "}
                  <span className="text-zinc-500">(required for GM, Manager, and Supervisor)</span>
                </p>
              </>
            ) : (
              <Select
                name="accessMethod"
                label="Access method"
                value={accessMethod}
                onChange={(event) => setAccessMethod(event.currentTarget.value as AccessMethod)}
              >
                <option value="PIN_ONLY">PIN only</option>
                <option value="EMAIL_PASSWORD">Email + password</option>
              </Select>
            )}
            <p className="mt-2 text-xs text-zinc-600">
              {emailRequired
                ? "Creates an email/password login now; this person can still use a PIN if one is set later."
                : "PIN can be assigned after creation from the employee card."}
            </p>
          </div>
          {emailRequired ? (
            <>
              <TextInput
                name="initialPassword"
                type="password"
                label="Initial password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
              <TextInput
                name="confirmInitialPassword"
                type="password"
                label="Confirm initial password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </>
          ) : null}
          <div className="min-w-0 sm:col-span-2">
            <EmployeeOrganizationFields
              departments={departments}
              teams={teams}
              jobRoles={jobRoles}
              primaryDepartmentId={departments[0]?.id ?? null}
              additionalDepartmentIds={[]}
              jobTitleId={null}
              teamMemberships={[]}
              jobRoleAssignments={[]}
              requirePrimaryDepartment
            />
          </div>
          <div className="min-w-0 space-y-3 sm:col-span-2">
            <label className="block text-xs text-zinc-600">
              Hire date
              <input
                name="hireDate"
                type="date"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="unionMember" />
                Union member
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="onLeave" />
                On leave
              </label>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={departments.length === 0}>
              Add employee
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
