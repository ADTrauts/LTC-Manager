"use client";

import { EmploymentType, EmployeeStatus, RoleKey } from "@prisma/client";
import { useState } from "react";

import {
  createEmployeeAction,
  previewEmployeeAccountAction,
} from "@/app/(protected)/employees/actions";
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
import { mayAuthenticateWithQuickPin } from "@/lib/credential-policy";
import { Drawer } from "@/components/drawer";

type UnitOption = { id: string; name: string };
type TeamOption = { id: string; displayName: string; departmentId: string };

type CreateEmployeeDrawerProps = {
  facilityDisplayName: string;
  units: UnitOption[];
  departments: UnitOption[];
  jobTitles: UnitOption[];
  teams: TeamOption[];
  jobRoles?: OrganizationJobRoleOption[];
};

export function CreateEmployeeDrawer({
  facilityDisplayName,
  units: _units,
  departments,
  jobTitles: _jobTitles,
  teams,
  jobRoles = [],
}: CreateEmployeeDrawerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [roleType, setRoleType] = useState<RoleKey>(RoleKey.STAFF);
  const [existingAccount, setExistingAccount] = useState<{
    displayName: string;
    email: string;
    activated: boolean;
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmExistingUser, setConfirmExistingUser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pinRequired = mayAuthenticateWithQuickPin(roleType);

  async function goToConfirmation(formData: FormData) {
    setLookupError(null);
    const email = String(formData.get("email") ?? "");
    const preview = await previewEmployeeAccountAction(email);
    if ("error" in preview) {
      setLookupError(preview.error);
      return;
    }
    setExistingAccount(
      preview.exists
        ? { displayName: preview.displayName, email: preview.email, activated: preview.activated }
        : null,
    );
    setConfirmExistingUser(false);
    setStep(2);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="shrink-0">
        Add employee
      </Button>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
          setStep(1);
          setExistingAccount(null);
          setLookupError(null);
        }}
        title="Add employee"
      >
        <form
          action={async (formData) => {
            if (step === 1) {
              await goToConfirmation(formData);
              return;
            }
            setSubmitting(true);
            try {
              await createEmployeeAction(formData);
              setOpen(false);
            } finally {
              setSubmitting(false);
            }
          }}
          className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <TextInput name="firstName" label="First name" required autoComplete="given-name" />
          <TextInput name="lastName" label="Last name" required autoComplete="family-name" />
          <TextInput
            name="email"
            type="email"
            label="Email"
            required
            autoComplete="email"
          />
          <TextInput name="phone" label="Phone" helper="Optional" autoComplete="tel" />
          <Select
            name="roleType"
            label="Platform authority"
            helper="Controls application-level access. Department work permissions come from Job Roles."
            value={roleType}
            onChange={(event) => setRoleType(event.currentTarget.value as RoleKey)}
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
          {pinRequired ? (
            <>
              <TextInput name="pin" label="PIN" required autoComplete="off" />
              <TextInput name="confirmPin" label="Confirm PIN" required autoComplete="off" />
            </>
          ) : (
            <p className="sm:col-span-2 text-sm text-zinc-600">
              This role uses Vssyl account sign-in. PIN access is for Staff and Lead roles.
            </p>
          )}
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
          {lookupError ? <p className="sm:col-span-2 text-sm text-red-700">{lookupError}</p> : null}
          {step === 2 ? (
            <div className="sm:col-span-2 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm">
              {existingAccount ? (
                <>
                  <p className="font-medium text-zinc-900">Existing Vssyl account found</p>
                  <p>
                    {existingAccount.displayName}
                    <br />
                    {existingAccount.email}
                  </p>
                  <p>This person will be added to {facilityDisplayName}.</p>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={confirmExistingUser}
                      onChange={(event) => setConfirmExistingUser(event.target.checked)}
                    />
                    I confirm this is the correct Vssyl account.
                  </label>
                  {confirmExistingUser ? <input type="hidden" name="confirmExistingUser" value="1" /> : null}
                </>
              ) : (
                <p>
                  A new Vssyl account will be created. They will receive an account activation email
                  and can use PIN access while activation is pending.
                </p>
              )}
              <button type="button" className="text-sm underline" onClick={() => setStep(1)}>
                Back
              </button>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={
                departments.length === 0 ||
                submitting ||
                (step === 2 && Boolean(existingAccount) && !confirmExistingUser)
              }
            >
              {step === 1 ? "Continue" : "Add employee"}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
