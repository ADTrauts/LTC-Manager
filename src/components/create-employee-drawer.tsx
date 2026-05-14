"use client";

import { EmploymentType, EmployeeStatus, RoleKey } from "@prisma/client";
import { useState } from "react";

import { createEmployeeAction } from "@/app/(protected)/employees/actions";
import { EmployeeHrFormFields } from "@/app/(protected)/employees/employee-hr-form-fields";
import { EmployeeUnitAccessFields } from "@/app/(protected)/employees/employee-unit-access-fields";
import {
  defaultAccessMethodForRole,
  type AccessMethod,
  requiresEmailPasswordAccount,
} from "@/lib/credential-policy";
import { Drawer } from "@/components/drawer";

type UnitOption = { id: string; name: string };

type CreateEmployeeDrawerProps = {
  units: UnitOption[];
};

export function CreateEmployeeDrawer({ units }: CreateEmployeeDrawerProps) {
  const [open, setOpen] = useState(false);
  const [roleType, setRoleType] = useState<RoleKey>(RoleKey.STAFF);
  const [accessMethod, setAccessMethod] = useState<AccessMethod>(defaultAccessMethodForRole(RoleKey.STAFF));

  function onRoleChange(nextRole: RoleKey) {
    setRoleType(nextRole);
    setAccessMethod(defaultAccessMethodForRole(nextRole));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Add employee
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Add employee">
        <form
          action={async (formData) => {
            await createEmployeeAction(formData);
            setOpen(false);
          }}
          className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 [&>input]:min-w-0 [&>select]:min-w-0"
        >
          <input name="firstName" required placeholder="First name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <input name="lastName" required placeholder="Last name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <input
            name="email"
            type="email"
            required={requiresEmailPasswordAccount(roleType) || accessMethod === "EMAIL_PASSWORD"}
            placeholder={
              requiresEmailPasswordAccount(roleType) || accessMethod === "EMAIL_PASSWORD"
                ? "Email (required)"
                : "Email (optional)"
            }
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input name="phone" placeholder="Phone (optional)" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <select
            name="roleType"
            value={roleType}
            onChange={(event) => onRoleChange(event.currentTarget.value as RoleKey)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {Object.values(RoleKey).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select name="employmentType" defaultValue={EmploymentType.FULL_TIME} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            {Object.values(EmploymentType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={EmployeeStatus.ACTIVE} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            {Object.values(EmployeeStatus).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Access method
            </label>
            {requiresEmailPasswordAccount(roleType) ? (
              <>
                <input type="hidden" name="accessMethod" value="EMAIL_PASSWORD" />
                <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
                  Email + password <span className="text-zinc-500">(required for GM, Manager, and Supervisor)</span>
                </p>
              </>
            ) : (
              <select
                name="accessMethod"
                value={accessMethod}
                onChange={(event) => setAccessMethod(event.currentTarget.value as AccessMethod)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                <option value="PIN_ONLY">PIN only</option>
                <option value="EMAIL_PASSWORD">Email + password</option>
              </select>
            )}
            <p className="mt-2 text-xs text-zinc-600">
              {requiresEmailPasswordAccount(roleType) || accessMethod === "EMAIL_PASSWORD"
                ? "Creates an email/password login now; this person can still use a PIN if one is set later."
                : "PIN can be assigned after creation from the employee card."}
            </p>
          </div>
          {requiresEmailPasswordAccount(roleType) || accessMethod === "EMAIL_PASSWORD" ? (
            <>
              <input
                name="initialPassword"
                type="password"
                minLength={8}
                maxLength={128}
                required
                placeholder="Initial password"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                name="confirmInitialPassword"
                type="password"
                minLength={8}
                maxLength={128}
                required
                placeholder="Confirm initial password"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </>
          ) : null}
          <div className="min-w-0 sm:col-span-2">
            <EmployeeHrFormFields
              showTerminationSection={false}
              defaults={{
                unionMember: false,
                onLeave: false,
                hireDateIso: "",
                birthMonth: null,
                birthDay: null,
                jobClassification: null,
                chrcStatus: null,
                chrcClearedAtIso: "",
                chrcNotes: "",
                shirtSize: "",
                hrNotes: "",
                workStations: [],
                terminationDateIso: "",
                chrcOffboardingCompletedAtIso: "",
                chrcOffboardingNotes: "",
              }}
            />
          </div>
          <EmployeeUnitAccessFields units={units} />
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Add employee
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
