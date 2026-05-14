"use client";

import {
  ChrcStatus,
  EmploymentType,
  EmployeeStatus,
  JobClassification,
  RoleKey,
  WorkStation,
} from "@prisma/client";
import { useLayoutEffect, useState, type CSSProperties } from "react";

import {
  EmployeeDisciplineSection,
  type DisciplineEntryForCard,
} from "@/app/(protected)/employees/employee-discipline-section";
import {
  type EmployeeHrFormDefaults,
  EmployeeChrcFormSection,
  EmployeeHrUnionFormSection,
} from "@/app/(protected)/employees/employee-hr-form-fields";
import {
  clearEmployeePinAction,
  setDefaultAssignmentAction,
  setEmployeePinAction,
  updateEmployeeProfileAction,
} from "@/app/(protected)/employees/actions";
import { EmployeeUnitAccessFields } from "@/app/(protected)/employees/employee-unit-access-fields";
import { formatSeniorityFromHireDate } from "@/lib/employee-hr-labels";
import { requiresEmailPasswordAccount } from "@/lib/credential-policy";

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

type EmployeeManagementCardProps = {
  employee: EmployeeForManagementCard;
  units: UnitOption[];
  showManagerTools: boolean;
  /** When false, PIN blocks are not rendered at all (only GMs). */
  showPinManagement: boolean;
  /** Omit for non-GMs. */
  hasPinSet?: boolean;
};

type CardTabId = "personal" | "hr" | "chrc" | "assignments" | "discipline";

const TAB_LABEL: Record<CardTabId, string> = {
  personal: "Personal",
  hr: "HR & Union",
  chrc: "CHRC",
  assignments: "Assignments",
  discipline: "Discipline",
};

function EmployeeProfileForm({
  employee,
  units,
}: {
  employee: EmployeeForManagementCard;
  units: UnitOption[];
}) {
  const [statusDraft, setStatusDraft] = useState(employee.status);
  const [unionDraft, setUnionDraft] = useState(employee.unionMember);
  const [roleDraft, setRoleDraft] = useState<RoleKey>(employee.roleType);
  const [emailDraft, setEmailDraft] = useState(employee.email ?? "");
  const [activeTab, setActiveTab] = useState<CardTabId>("personal");

  const initialEmailNormalized = (employee.email ?? "").trim().toLowerCase();
  const emailDraftNormalized = emailDraft.trim().toLowerCase();
  const emailChanged = emailDraftNormalized !== initialEmailNormalized;
  const needsAppPasswordSetup =
    requiresEmailPasswordAccount(roleDraft) &&
    (!employee.hasAppLogin || emailChanged);
  const passwordFieldsRequired =
    needsAppPasswordSetup && !emailChanged && !employee.hasAppLogin;

  const hrFormDefaults: EmployeeHrFormDefaults = {
    unionMember: employee.unionMember,
    onLeave: employee.onLeave,
    hireDateIso: employee.hireDateIso ?? "",
    birthMonth: employee.birthMonth,
    birthDay: employee.birthDay,
    jobClassification: employee.jobClassification,
    chrcStatus: employee.chrcStatus,
    chrcClearedAtIso: employee.chrcClearedAtIso ?? "",
    chrcNotes: employee.chrcNotes ?? "",
    shirtSize: employee.shirtSize ?? "",
    hrNotes: employee.hrNotes ?? "",
    workStations: employee.workStations,
    terminationDateIso: employee.terminationDateIso ?? "",
    chrcOffboardingCompletedAtIso: employee.chrcOffboardingCompletedAtIso ?? "",
    chrcOffboardingNotes: employee.chrcOffboardingNotes ?? "",
  };

  const showDisciplineTab = employee.unionMember || unionDraft;
  const tabIds: CardTabId[] = showDisciplineTab
    ? ["personal", "hr", "chrc", "assignments", "discipline"]
    : ["personal", "hr", "chrc", "assignments"];

  function handleUnionMemberChange(checked: boolean) {
    setUnionDraft(checked);
    if (!checked && activeTab === "discipline" && !employee.unionMember) {
      setActiveTab("personal");
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Employee sections"
        className="flex flex-wrap gap-1 border-b border-zinc-200 pb-px"
      >
        {tabIds.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            id={`emp-tab-${employee.id}-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            className={`rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? "border-zinc-200 bg-white text-zinc-900"
                : "border-transparent bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>

      <form action={updateEmployeeProfileAction} className="space-y-4">
        <input type="hidden" name="employeeId" value={employee.id} />

        <div
          role="tabpanel"
          id={`emp-panel-${employee.id}-personal`}
          aria-labelledby={`emp-tab-${employee.id}-personal`}
          hidden={activeTab !== "personal"}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
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
            required={requiresEmailPasswordAccount(roleDraft)}
            placeholder={
              requiresEmailPasswordAccount(roleDraft) ? "Email (required)" : "Email (optional)"
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
              {needsAppPasswordSetup
                ? "Set an initial app password below when promoting to this role or using a new email, unless this email already has an account."
                : "This email already has an app login for this facility."}
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
              {!passwordFieldsRequired ? (
                <p className="text-xs text-zinc-600 md:col-span-2">
                  Required if no account exists yet for the email above (e.g. after changing email).
                </p>
              ) : null}
            </>
          ) : null}
          <select
            name="roleType"
            value={roleDraft}
            onChange={(e) => setRoleDraft(e.target.value as RoleKey)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {Object.values(RoleKey).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            name="employmentType"
            defaultValue={employee.employmentType}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {Object.values(EmploymentType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            name="status"
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value as EmployeeStatus)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {Object.values(EmployeeStatus).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <EmployeeUnitAccessFields
            units={units}
            defaultMode={employee.unitAccesses.length > 0 ? "restricted" : "all"}
            defaultAllowedIds={new Set(employee.unitAccesses.map((a) => a.unitId))}
            defaultPrimaryId={employee.primaryUnitId}
          />
        </div>

        <div
          role="tabpanel"
          id={`emp-panel-${employee.id}-hr`}
          aria-labelledby={`emp-tab-${employee.id}-hr`}
          hidden={activeTab !== "hr"}
          className="rounded-md border border-zinc-100 bg-zinc-50/50 p-3"
        >
          <EmployeeHrUnionFormSection
            defaults={hrFormDefaults}
            showTerminationDate={statusDraft === EmployeeStatus.TERMINATED}
            unionMemberChecked={unionDraft}
            onUnionMemberChange={handleUnionMemberChange}
          />
        </div>

        <div
          role="tabpanel"
          id={`emp-panel-${employee.id}-chrc`}
          aria-labelledby={`emp-tab-${employee.id}-chrc`}
          hidden={activeTab !== "chrc"}
          className="rounded-md border border-zinc-100 bg-zinc-50/50 p-3"
        >
          <EmployeeChrcFormSection
            defaults={hrFormDefaults}
            showOffboardingSection={statusDraft === EmployeeStatus.TERMINATED}
          />
        </div>

        <div className="border-t border-zinc-200 pt-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Save profile
          </button>
        </div>
      </form>

      <div
        role="tabpanel"
        id={`emp-panel-${employee.id}-assignments`}
        aria-labelledby={`emp-tab-${employee.id}-assignments`}
        hidden={activeTab !== "assignments"}
        className="space-y-3"
      >
        <h3 className="text-sm font-medium text-zinc-900">Default assignments</h3>
        <ul className="space-y-1 text-sm text-zinc-700">
          {employee.defaultAssignments.map((a) => (
            <li key={a.id}>
              {a.unit.name} ({a.roleType})
            </li>
          ))}
          {employee.defaultAssignments.length === 0 ? <li className="text-zinc-500">None yet for this employee.</li> : null}
        </ul>
        {employee.status === EmployeeStatus.ACTIVE ? (
          <form action={setDefaultAssignmentAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="employeeId" value={employee.id} />
            <select name="unitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Select unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
            <select name="roleType" defaultValue={RoleKey.STAFF} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {Object.values(RoleKey).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="isActive" defaultChecked />
              Active
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Add assignment
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-zinc-500">Activate this employee to add default assignments.</p>
        )}
      </div>

      {showDisciplineTab ? (
        <div
          role="tabpanel"
          id={`emp-panel-${employee.id}-discipline`}
          aria-labelledby={`emp-tab-${employee.id}-discipline`}
          hidden={activeTab !== "discipline"}
          className="rounded-md border border-zinc-100 bg-white p-1"
        >
          <EmployeeDisciplineSection
            employeeId={employee.id}
            entries={employee.disciplineEntries}
            totals={employee.disciplineTotals}
          />
        </div>
      ) : null}
    </div>
  );
}

export function EmployeeManagementCard({
  employee,
  units,
  showManagerTools,
  showPinManagement,
  hasPinSet = false,
}: EmployeeManagementCardProps) {
  const [cardOpen, setCardOpen] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinMaskViaCss, setPinMaskViaCss] = useState<boolean | null>(null);
  const pinInputId = `employee-pin-${employee.id}`;
  const pinUseCssDisc = pinMaskViaCss === true;

  useLayoutEffect(() => {
    const span = document.createElement("span");
    const style = span.style as CSSStyleDeclaration & { webkitTextSecurity?: string };
    style.webkitTextSecurity = "disc";
    queueMicrotask(() => setPinMaskViaCss(style.webkitTextSecurity === "disc"));
  }, []);

  const assignmentCount = employee.defaultAssignments.length;

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
            {employee.roleType} · {employee.employmentType} · {employee.status}
            {employee.unionMember ? " · Union" : ""}
            {seniorityLabel ? ` · Seniority ${seniorityLabel}` : ""}
            {employee.onLeave ? " · On leave" : ""}
            {employee.status === EmployeeStatus.TERMINATED ? (
              <>
                {employee.terminationDateIso ? ` · Terminated ${employee.terminationDateIso}` : " · Terminated"}
                {!employee.chrcOffboardingCompletedAtIso ? (
                  <span className="text-amber-800"> · CHRC offboarding pending</span>
                ) : null}
              </>
            ) : null}
            {assignmentCount > 0 ? ` · ${assignmentCount} default assignment${assignmentCount === 1 ? "" : "s"}` : ""}
            {showPinManagement ? (hasPinSet ? " · PIN set" : " · No PIN") : null}
          </p>
        </div>
        <span className={`shrink-0 text-zinc-400 transition-transform ${cardOpen ? "rotate-180" : ""}`} aria-hidden>
          ▼
        </span>
      </button>

      {cardOpen ? (
        <div className="border-t border-zinc-100">
          {showManagerTools ? (
            <div className="px-4 py-4">
              <EmployeeProfileForm
                key={`${employee.id}-${employee.status}-${employee.terminationDateIso ?? ""}-${employee.chrcOffboardingCompletedAtIso ?? ""}-${employee.chrcOffboardingNotes ?? ""}`}
                employee={employee}
                units={units}
              />
            </div>
          ) : (
            <div className="px-4 py-4">
              <p className="text-sm text-zinc-600">You can view employee cards; editing requires manager access.</p>
            </div>
          )}

          {showPinManagement ? (
            <footer className="border-t border-zinc-200 bg-zinc-50/80 px-4 py-4">
              <h3 className="text-sm font-medium text-zinc-900">Floor PIN sign-in</h3>
              <p className="mt-1 text-xs text-zinc-600">
                Unique 6-digit PIN for facility-bound sign-in without email. The current PIN cannot be shown—only reset. Use
                the eye to check digits while entering a new PIN.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <form action={setEmployeePinAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <div className="text-xs text-zinc-600">
                    <label htmlFor={pinInputId} className="block">
                      New PIN (6 digits)
                    </label>
                    <div className="mt-1 flex items-stretch gap-1">
                      <input
                        key={pinUseCssDisc ? "css-mask" : pinVisible ? "show" : "hide"}
                        id={pinInputId}
                        name="pin"
                        value={pinDraft}
                        onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        type={pinUseCssDisc ? "text" : pinVisible ? "text" : "password"}
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="••••••"
                        className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm tracking-widest"
                        style={
                          pinUseCssDisc && !pinVisible
                            ? ({
                                WebkitTextSecurity: "disc",
                              } as CSSProperties)
                            : undefined
                        }
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPinVisible((v) => !v);
                        }}
                        className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white px-2 text-zinc-600 hover:bg-zinc-50"
                        aria-label={pinVisible ? "Hide PIN while typing" : "Show PIN while typing"}
                        aria-controls={pinInputId}
                        title={pinVisible ? "Hide" : "Show"}
                      >
                        {pinVisible ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Save PIN
                  </button>
                </form>
                {hasPinSet ? (
                  <form action={clearEmployeePinAction}>
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                    >
                      Clear PIN
                    </button>
                  </form>
                ) : null}
              </div>
            </footer>
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
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
