"use client";

import {
  ChrcStatus,
  EmploymentType,
  EmployeeStatus,
  JobClassification,
  RoleKey,
  WorkStation,
} from "@prisma/client";
import { useState } from "react";

import type { DisciplineEntryForCard } from "@/app/(protected)/employees/employee-discipline-section";
import {
  clearEmployeePinAction,
  setEmployeePinAction,
  updateEmployeeProfileAction,
} from "@/app/(protected)/employees/actions";
import {
  AUTHORITY_LABEL,
  employeeStatusLabel,
  employmentTypeLabel,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  formatSeniorityFromHireDate,
} from "@/lib/employee-hr-labels";
import { requiresEmailPasswordAccount } from "@/lib/credential-policy";
import { JOB_ROLE_TIER_LABEL } from "@/lib/department-job-roles";
import {
  EmployeeOrganizationFields,
  type OrganizationJobRoleAssignment,
  type OrganizationJobRoleOption,
} from "@/components/employee-organization-fields";

export type EmployeeCardAssignment = {
  id: string;
  roleType: RoleKey;
  unit: { name: string };
};

export type EmployeeForManagementCard = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** True when an active `User` exists at this facility with the same email (case-insensitive). */
  hasAppLogin: boolean;
  phone: string | null;
  roleType: RoleKey;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  primaryUnitId: string | null;
  primaryDepartmentId: string | null;
  additionalDepartmentIds: string[];
  jobTitleId: string | null;
  teamMemberships: { teamId: string; isPrimary: boolean }[];
  jobRoleAssignments: OrganizationJobRoleAssignment[];
  unitAccesses: { unitId: string }[];
  defaultAssignments: EmployeeCardAssignment[];
  unionMember: boolean;
  onLeave: boolean;
  hireDateIso: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  jobClassification: JobClassification | null;
  chrcStatus: ChrcStatus | null;
  chrcClearedAtIso: string | null;
  chrcNotes: string | null;
  shirtSize: string | null;
  hrNotes: string | null;
  workStations: WorkStation[];
  disciplineEntries: DisciplineEntryForCard[];
  disciplineTotals: { attendance: number; performance: number; total: number };
  terminationDateIso: string | null;
  chrcOffboardingCompletedAtIso: string | null;
  chrcOffboardingNotes: string | null;
};

type UnitOption = { id: string; name: string };
type DeptJobOption = { id: string; name: string; showInEmployeeApp?: boolean };
type TeamOption = { id: string; displayName: string; departmentId: string };

type EmployeeManagementCardProps = {
  employee: EmployeeForManagementCard;
  units: UnitOption[];
  departments?: DeptJobOption[];
  jobTitles?: DeptJobOption[];
  teams?: TeamOption[];
  jobRoles?: OrganizationJobRoleOption[];
  showManagerTools: boolean;
  /** When false, PIN blocks are not rendered at all (only GMs). */
  showPinManagement: boolean;
  /** Omit for non-GMs. */
  hasPinSet?: boolean;
};

function EmployeeProfileForm({
  employee,
  departments,
  teams,
  jobRoles,
}: {
  employee: EmployeeForManagementCard;
  departments: DeptJobOption[];
  teams: TeamOption[];
  jobRoles: OrganizationJobRoleOption[];
}) {
  const [statusDraft, setStatusDraft] = useState(employee.status);
  const [roleDraft, setRoleDraft] = useState<RoleKey>(employee.roleType);
  const [emailDraft, setEmailDraft] = useState(employee.email ?? "");

  const initialEmailNormalized = (employee.email ?? "").trim().toLowerCase();
  const emailDraftNormalized = emailDraft.trim().toLowerCase();
  const emailChanged = emailDraftNormalized !== initialEmailNormalized;
  const needsAppPasswordSetup =
    requiresEmailPasswordAccount(roleDraft) &&
    Boolean(emailDraftNormalized) &&
    (!employee.hasAppLogin || emailChanged);
  const passwordFieldsRequired =
    needsAppPasswordSetup && !emailChanged && !employee.hasAppLogin;

  return (
    <form action={updateEmployeeProfileAction} className="space-y-6">
      <input type="hidden" name="employeeId" value={employee.id} />
      <input type="hidden" name="employeeProfileMode" value="essentials" />

      <section className="space-y-3" data-testid="employee-profile-section">
        <h3 className="text-sm font-medium text-zinc-900">Profile</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            name="firstName"
            required
            defaultValue={employee.firstName}
            placeholder="First name"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            name="lastName"
            required
            defaultValue={employee.lastName}
            placeholder="Last name"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            name="email"
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder={
              requiresEmailPasswordAccount(roleDraft) ? "Email (needed for app login)" : "Email (optional)"
            }
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            name="phone"
            defaultValue={employee.phone ?? ""}
            placeholder="Phone (optional)"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          {requiresEmailPasswordAccount(roleDraft) ? (
            <p className="text-xs text-zinc-600 md:col-span-2 xl:col-span-4">
              {emailDraft.trim()
                ? needsAppPasswordSetup
                  ? "Set an initial app password below when promoting to this role or using a new email, unless this email already has an account."
                  : "This email already has an app login for this facility."
                : "Email should be set for this platform authority. You can still save Job Roles and organization; add an email before relying on app login."}
            </p>
          ) : null}
          {needsAppPasswordSetup ? (
            <>
              <input
                name="initialPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required={passwordFieldsRequired}
                placeholder="Initial app password"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                name="confirmInitialPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required={passwordFieldsRequired}
                placeholder="Confirm initial password"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </>
          ) : null}
          <label className="flex flex-col gap-1 text-xs text-zinc-600 md:col-span-2">
            Platform authority
            <select
              name="roleType"
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value as RoleKey)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {Object.values(RoleKey).map((value) => (
                <option key={value} value={value}>
                  {AUTHORITY_LABEL[value]}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">
              Controls application-level access. Department work permissions come from Job Roles.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Employment type
            <select
              name="employmentType"
              defaultValue={employee.employmentType}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {Object.values(EmploymentType).map((value) => (
                <option key={value} value={value}>
                  {EMPLOYMENT_TYPE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Status
            <select
              name="status"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value as EmployeeStatus)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {Object.values(EmployeeStatus).map((value) => (
                <option key={value} value={value}>
                  {EMPLOYEE_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Hire date
            <input
              name="hireDate"
              type="date"
              defaultValue={employee.hireDateIso ?? ""}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          {statusDraft === EmployeeStatus.TERMINATED ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Termination date
              <input
                name="terminationDate"
                type="date"
                defaultValue={employee.terminationDateIso ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
            <input type="checkbox" name="unionMember" defaultChecked={employee.unionMember} />
            Union member
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
            <input type="checkbox" name="onLeave" defaultChecked={employee.onLeave} />
            On leave
          </label>
          <div className="md:col-span-2 xl:col-span-4">
            <EmployeeOrganizationFields
              departments={departments}
              teams={teams}
              jobRoles={jobRoles}
              primaryDepartmentId={employee.primaryDepartmentId}
              additionalDepartmentIds={employee.additionalDepartmentIds}
              jobTitleId={employee.jobTitleId}
              teamMemberships={employee.teamMemberships}
              jobRoleAssignments={employee.jobRoleAssignments}
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Save profile
        </button>
      </section>
    </form>
  );
}

function EmployeePinSection({
  employeeId,
  hasPinSet,
  isActive,
}: {
  employeeId: string;
  hasPinSet: boolean;
  isActive: boolean;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");
  const pinInputId = `employee-pin-${employeeId}`;
  const confirmInputId = `employee-pin-confirm-${employeeId}`;

  function closeEditor() {
    setEditorOpen(false);
    setPinVisible(false);
    setPinDraft("");
    setConfirmDraft("");
  }

  return (
    <div className="space-y-3" data-testid="employee-pin-section">
      <h3 className="text-sm font-medium text-zinc-900">PIN sign-in</h3>
      <p className="text-xs text-zinc-600">
        Use a unique 6-digit PIN for quick access on shared facility devices. Employees with an email
        login can also use their PIN.
      </p>
      <p className="text-sm text-zinc-800">
        {hasPinSet ? "PIN configured" : "No PIN configured"}
      </p>
      {!isActive ? (
        <p className="text-xs text-zinc-500">Only active employees can set or reset a PIN.</p>
      ) : editorOpen ? (
        <form
          action={async (formData) => {
            await setEmployeePinAction(formData);
            closeEditor();
          }}
          className="space-y-3 rounded-md border border-zinc-200 bg-white p-3"
        >
          <input type="hidden" name="employeeId" value={employeeId} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="text-xs text-zinc-600">
              <label htmlFor={pinInputId} className="block">
                New PIN (6 digits)
              </label>
              <div className="mt-1 flex items-stretch gap-1">
                <input
                  key={pinVisible ? "pin-show" : "pin-hide"}
                  id={pinInputId}
                  name="pin"
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  type={pinVisible ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  pattern="\d{6}"
                  placeholder="••••••"
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setPinVisible((v) => !v)}
                  className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white px-2 text-zinc-600 hover:bg-zinc-50"
                  aria-label={pinVisible ? "Hide PIN while typing" : "Show PIN while typing"}
                  aria-pressed={pinVisible}
                  title={pinVisible ? "Hide PIN" : "Show PIN"}
                >
                  {pinVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
            <div className="text-xs text-zinc-600">
              <label htmlFor={confirmInputId} className="block">
                Confirm PIN
              </label>
              <input
                id={confirmInputId}
                name="confirmPin"
                value={confirmDraft}
                onChange={(e) => setConfirmDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                type={pinVisible ? "text" : "password"}
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
                required
                pattern="\d{6}"
                placeholder="••••••"
                className="mt-1 w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm tracking-widest"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            The saved PIN is hashed and cannot be shown again. Reveal only works while typing a new
            PIN before save.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              {hasPinSet ? "Save new PIN" : "Save PIN"}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
          >
            {hasPinSet ? "Reset PIN" : "Set PIN"}
          </button>
          {hasPinSet ? (
            <form action={clearEmployeePinAction}>
              <input type="hidden" name="employeeId" value={employeeId} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                Clear PIN
              </button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function EmployeeManagementCard({
  employee,
  units: _units,
  departments = [],
  jobTitles: _jobTitles = [],
  teams = [],
  jobRoles = [],
  showManagerTools,
  showPinManagement,
  hasPinSet = false,
}: EmployeeManagementCardProps) {
  const [cardOpen, setCardOpen] = useState(false);

  const departmentName =
    departments.find((d) => d.id === employee.primaryDepartmentId)?.name ?? null;
  const primaryJobRole = employee.jobRoleAssignments.find(
    (assignment) => assignment.departmentId === employee.primaryDepartmentId,
  );
  const primaryJobRoleOption = primaryJobRole
    ? jobRoles.find((role) => role.id === primaryJobRole.jobRoleId)
    : null;
  const jobRoleSummary = primaryJobRoleOption
    ? `${primaryJobRoleOption.displayName} (${JOB_ROLE_TIER_LABEL[primaryJobRoleOption.tier]})`
    : "No Job Role";
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const primaryDeptTeams = employee.teamMemberships.filter((membership) => {
    const team = teamById.get(membership.teamId);
    return team && membership.isPrimary && team.departmentId === employee.primaryDepartmentId;
  });
  const anyPrimaryTeam = employee.teamMemberships.find((membership) => membership.isPrimary);
  const displayTeamId =
    primaryDeptTeams[0]?.teamId ?? anyPrimaryTeam?.teamId ?? employee.teamMemberships[0]?.teamId;
  const displayTeamName = displayTeamId ? teamById.get(displayTeamId)?.displayName ?? null : null;
  const extraTeamCount = Math.max(0, employee.teamMemberships.length - (displayTeamId ? 1 : 0));

  const seniorityLabel =
    employee.unionMember && employee.hireDateIso
      ? formatSeniorityFromHireDate(new Date(employee.hireDateIso))
      : null;

  return (
    <section
      id={`employee-${employee.id}`}
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={() => setCardOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50"
        aria-expanded={cardOpen}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-900">
            {employee.firstName} {employee.lastName}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {[
              departmentName,
              displayTeamName
                ? extraTeamCount > 0
                  ? `${displayTeamName} +${extraTeamCount}`
                  : displayTeamName
                : null,
              `Job Role: ${jobRoleSummary}`,
              employeeStatusLabel(employee.status),
              employmentTypeLabel(employee.employmentType),
              showPinManagement ? (hasPinSet ? "PIN configured" : "No PIN") : null,
              `Platform: ${AUTHORITY_LABEL[employee.roleType]}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            {employee.unionMember ? " · Union" : ""}
            {seniorityLabel ? ` · Seniority ${seniorityLabel}` : ""}
            {employee.onLeave ? " · On leave" : ""}
          </p>
        </div>
        <span className={`shrink-0 text-zinc-400 transition-transform ${cardOpen ? "rotate-180" : ""}`} aria-hidden>
          ▼
        </span>
      </button>

      {cardOpen ? (
        <div className="space-y-6 border-t border-zinc-100 px-4 py-4">
          {showManagerTools ? (
            <EmployeeProfileForm
              key={[
                employee.id,
                employee.status,
                employee.primaryDepartmentId ?? "",
                [...employee.teamMemberships]
                  .map((row) => `${row.teamId}:${row.isPrimary ? "1" : "0"}`)
                  .sort()
                  .join("|"),
                [...employee.jobRoleAssignments]
                  .map((row) => `${row.departmentId}:${row.jobRoleId}`)
                  .sort()
                  .join("|"),
              ].join("::")}
              employee={employee}
              departments={departments}
              teams={teams}
              jobRoles={jobRoles}
            />
          ) : (
            <p className="text-sm text-zinc-600">You can view employee cards; editing requires manager access.</p>
          )}

          {showPinManagement || showManagerTools ? (
            <section
              className="space-y-4 border-t border-zinc-200 pt-4"
              data-testid="employee-access-section"
            >
              <h3 className="text-sm font-medium text-zinc-900">Access</h3>
              <div className="rounded-md border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm text-zinc-700">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Email login</p>
                <p className="mt-1">
                  {employee.hasAppLogin
                    ? `Available${employee.email ? ` (${employee.email})` : ""}`
                    : "Not configured"}
                </p>
              </div>
              {showPinManagement ? (
                <EmployeePinSection
                  key={`${employee.id}-pin-${hasPinSet ? "set" : "unset"}`}
                  employeeId={employee.id}
                  hasPinSet={hasPinSet}
                  isActive={employee.status === EmployeeStatus.ACTIVE}
                />
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}
