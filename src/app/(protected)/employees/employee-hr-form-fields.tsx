"use client";

import { ChrcStatus, JobClassification, WorkStation } from "@prisma/client";

import {
  CHRC_STATUS_LABEL,
  JOB_CLASSIFICATION_LABEL,
  SHIRT_SIZE_OPTIONS,
  SHIRT_SIZE_VALUES,
  WORK_STATION_LABEL,
} from "@/lib/employee-hr-labels";

export type EmployeeHrFormDefaults = {
  unionMember: boolean;
  onLeave: boolean;
  hireDateIso: string;
  birthMonth: number | null;
  birthDay: number | null;
  jobClassification: JobClassification | null;
  chrcStatus: ChrcStatus | null;
  chrcClearedAtIso: string;
  chrcNotes: string;
  shirtSize: string;
  hrNotes: string;
  workStations: WorkStation[];
  terminationDateIso: string;
  chrcOffboardingCompletedAtIso: string;
  chrcOffboardingNotes: string;
};

function monthOptions() {
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

function dayOptions() {
  return Array.from({ length: 31 }, (_, i) => i + 1);
}

/** HR & union: flags, hire, classification, shirt, birthday, stations, HR notes; optional termination date when terminated. */
export function EmployeeHrUnionFormSection({
  defaults,
  showTerminationDate,
  className = "",
  unionMemberChecked,
  onUnionMemberChange,
}: {
  defaults: EmployeeHrFormDefaults;
  showTerminationDate: boolean;
  /** e.g. omit top border when first in a tab panel */
  className?: string;
  /** When set with onUnionMemberChange, union checkbox is controlled (e.g. employee card tabs). */
  unionMemberChecked?: boolean;
  onUnionMemberChange?: (checked: boolean) => void;
}) {
  const stationSet = new Set(defaults.workStations);
  const unionControlled = unionMemberChecked !== undefined && onUnionMemberChange !== undefined;

  return (
    <div className={`space-y-4 ${className}`}>
      <p className="text-sm font-medium text-zinc-800">HR &amp; union</p>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-700">
        <label className="flex max-w-md items-start gap-2">
          {unionControlled ? (
            <input
              type="checkbox"
              name="unionMember"
              checked={unionMemberChecked}
              onChange={(e) => onUnionMemberChange(e.target.checked)}
              className="mt-0.5"
            />
          ) : (
            <input type="checkbox" name="unionMember" defaultChecked={defaults.unionMember} className="mt-0.5" />
          )}
          <span>
            Union member <span className="text-zinc-500">(seniority, discipline points)</span>
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="onLeave" defaultChecked={defaults.onLeave} />
          On leave
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs text-zinc-600">
          Hire date
          <input
            name="hireDate"
            type="date"
            defaultValue={defaults.hireDateIso}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="min-w-0">
          <span className="block text-xs text-zinc-600">Job classification</span>
          <select
            name="jobClassification"
            defaultValue={defaults.jobClassification ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {(Object.keys(JOB_CLASSIFICATION_LABEL) as JobClassification[]).map((k) => (
              <option key={k} value={k}>
                {JOB_CLASSIFICATION_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <span className="block text-xs text-zinc-600">Shirt size</span>
          <select
            name="shirtSize"
            defaultValue={
              defaults.shirtSize && SHIRT_SIZE_VALUES.has(defaults.shirtSize)
                ? defaults.shirtSize
                : ""
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {SHIRT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0 text-xs text-zinc-600">
            Birth month
            <select
              name="birthMonth"
              defaultValue={defaults.birthMonth ?? ""}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
            >
              <option value="">—</option>
              {monthOptions().map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs text-zinc-600">
            Birth day
            <select
              name="birthDay"
              defaultValue={defaults.birthDay ?? ""}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
            >
              <option value="">—</option>
              {dayOptions().map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-zinc-700">Stations trained</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {(Object.keys(WORK_STATION_LABEL) as WorkStation[]).map((station) => (
            <label key={station} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="workStations"
                value={station}
                defaultChecked={stationSet.has(station)}
              />
              {WORK_STATION_LABEL[station]}
            </label>
          ))}
        </div>
      </div>

      {showTerminationDate ? (
        <div className="grid grid-cols-1 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm font-medium text-zinc-800">Termination</p>
          <p className="sm:col-span-2 text-xs text-zinc-600">
            Last day when employment status is Terminated. Clears if status is changed away from Terminated.
          </p>
          <label className="text-xs text-zinc-600">
            Termination date
            <input
              name="terminationDate"
              type="date"
              defaultValue={defaults.terminationDateIso}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      ) : null}

      <label className="block text-xs text-zinc-600">
        HR notes
        <textarea
          name="hrNotes"
          rows={3}
          defaultValue={defaults.hrNotes}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
    </div>
  );
}

/** CHRC screening + optional offboarding (when terminated). */
export function EmployeeChrcFormSection({
  defaults,
  showOffboardingSection,
  className = "",
}: {
  defaults: EmployeeHrFormDefaults;
  showOffboardingSection: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm font-medium text-zinc-800">CHRC (NYS background check)</p>
        <div className="min-w-0">
          <span className="block text-xs text-zinc-600">Status</span>
          <select
            name="chrcStatus"
            defaultValue={defaults.chrcStatus ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {(Object.keys(CHRC_STATUS_LABEL) as ChrcStatus[]).map((k) => (
              <option key={k} value={k}>
                {CHRC_STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <label className="min-w-0 text-xs text-zinc-600">
          Cleared date
          <input
            name="chrcClearedAt"
            type="date"
            defaultValue={defaults.chrcClearedAtIso}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="min-w-0 text-xs text-zinc-600 sm:col-span-2">
          CHRC notes
          <input
            name="chrcNotes"
            defaultValue={defaults.chrcNotes}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {showOffboardingSection ? (
        <div className="grid grid-cols-1 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm font-medium text-zinc-800">CHRC offboarding</p>
          <p className="sm:col-span-2 text-xs text-zinc-600">
            When someone is terminated, track removal from the CHRC process (NYS LTC). Clears if employment status is changed
            away from Terminated.
          </p>
          <label className="min-w-0 text-xs text-zinc-600">
            CHRC offboarding completed
            <input
              name="chrcOffboardingCompletedAt"
              type="date"
              defaultValue={defaults.chrcOffboardingCompletedAtIso}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="min-w-0 text-xs text-zinc-600 sm:col-span-2">
            CHRC offboarding notes
            <input
              name="chrcOffboardingNotes"
              defaultValue={defaults.chrcOffboardingNotes}
              placeholder="Reference #, who was notified, etc."
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Full stacked HR block for create-employee and other single-page flows. */
export function EmployeeHrFormFields({
  defaults,
  showTerminationSection,
}: {
  defaults: EmployeeHrFormDefaults;
  showTerminationSection: boolean;
}) {
  return (
    <div className="min-w-0 sm:col-span-2 space-y-4 border-t border-zinc-200 pt-4">
      <EmployeeHrUnionFormSection defaults={defaults} showTerminationDate={showTerminationSection} />
      <div className="border-t border-zinc-100 pt-4">
        <EmployeeChrcFormSection defaults={defaults} showOffboardingSection={showTerminationSection} />
      </div>
    </div>
  );
}
