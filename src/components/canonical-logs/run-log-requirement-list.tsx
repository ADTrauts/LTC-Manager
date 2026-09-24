"use client";

import Link from "next/link";

import type {
  RunAdHocAttachmentView,
  RunLogRequirementView,
  UpcomingRunLogView,
} from "@/lib/canonical-logs/run-presentation";
import { groupRunLogRequirements } from "@/lib/canonical-logs/run-presentation";

type Props = {
  requirements: RunLogRequirementView[];
  adHocAttachments: RunAdHocAttachmentView[];
  includeNeedsSetup: boolean;
  isManager: boolean;
  upcoming?: UpcomingRunLogView[];
  otherDepartmentNames?: string[];
  departmentName?: string | null;
};

function stateClass(emphasis: RunLogRequirementView["emphasis"]): string {
  switch (emphasis) {
    case "strong":
      return "font-semibold text-zinc-900";
    case "exception":
      return "font-semibold text-amber-900";
    case "setup":
      return "font-semibold text-amber-900";
    default:
      return "font-medium text-zinc-600";
  }
}

export function RunLogRequirementList({
  requirements,
  adHocAttachments,
  includeNeedsSetup,
  isManager,
  upcoming = [],
  otherDepartmentNames = [],
  departmentName = null,
}: Props) {
  const groups = groupRunLogRequirements(requirements, adHocAttachments, {
    includeNeedsSetup,
  });

  if (groups.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed border-zinc-300 px-3 py-5 text-sm text-zinc-600"
        data-testid="run-logs-empty"
        role="status"
      >
        <p className="font-medium text-zinc-800">
          {departmentName ? `No Logs for ${departmentName} today` : "No Logs for today"}
        </p>
        {upcoming.length > 0 ? (
          <UpcomingLogsList upcoming={upcoming} />
        ) : otherDepartmentNames.length > 0 ? (
          <p className="mt-1 text-xs" data-testid="run-logs-other-department">
            {otherDepartmentNames.join(", ")}{" "}
            {otherDepartmentNames.length === 1 ? "has" : "have"} Logs. Switch department in the
            header to see them.
          </p>
        ) : (
          <p className="mt-1 text-xs">
            Assigned Logs start the next service day. Open a room to see what is due here, or check
            back tomorrow.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="run-logs-list">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`run-logs-${group.id}`}>
          <h2
            id={`run-logs-${group.id}`}
            className="mb-2 text-sm font-semibold text-zinc-900"
          >
            {group.label}
          </h2>
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
            {group.items.map((item) => (
              <li
                key={item.requirementKey}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid="run-log-card"
                data-state={item.productState}
                data-requirement-key={item.requirementKey}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-zinc-900">{item.displayName}</p>
                  {item.displayName !== item.catalogDefinitionName ? (
                    <p className="text-[11px] text-zinc-500">{item.catalogDefinitionName}</p>
                  ) : null}
                  <p className="text-xs text-zinc-600">{item.targetLabel}</p>
                  {item.timingContextLabel ? (
                    <p className="text-xs text-zinc-600">{item.timingContextLabel}</p>
                  ) : null}
                  <p className={`text-xs ${stateClass(item.emphasis)}`}>{item.stateLabel}</p>
                  {item.showLocalInstructionsOnCard && item.localInstructions ? (
                    <p className="text-xs text-zinc-500">{item.localInstructions}</p>
                  ) : null}
                  {item.productState === "NEEDS_SETUP" ? (
                    <p className="text-xs text-amber-900">
                      This Log cannot run until its schedule is updated.
                      {!isManager ? " Ask a manager to update Build settings." : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.openHref && item.primaryActionLabel ? (
                    <Link
                      href={item.openHref}
                      className="inline-flex min-h-11 min-w-[7rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white"
                    >
                      {item.primaryActionLabel}
                    </Link>
                  ) : null}
                  {item.viewRecordHref ? (
                    <Link
                      href={item.viewRecordHref}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800"
                    >
                      View record
                    </Link>
                  ) : null}
                  {item.buildSettingsHref ? (
                    <Link
                      href={item.buildSettingsHref}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800"
                    >
                      Open Build settings
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
            {group.adHoc.map((item) => (
              <li
                key={item.attachmentId}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid="run-log-adhoc-card"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-zinc-900">{item.displayName}</p>
                  {item.displayName !== item.catalogDefinitionName ? (
                    <p className="text-[11px] text-zinc-500">{item.catalogDefinitionName}</p>
                  ) : null}
                  <p className="text-xs text-zinc-600">{item.targetLabel}</p>
                  <p className="text-xs font-medium text-zinc-600">As needed</p>
                </div>
                <Link
                  href={item.startHref}
                  className="inline-flex min-h-11 min-w-[7rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white"
                >
                  Start log
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {upcoming.length > 0 ? <UpcomingLogsList upcoming={upcoming} /> : null}
    </div>
  );
}

function UpcomingLogsList({ upcoming }: { upcoming: UpcomingRunLogView[] }) {
  return (
    <div className="mt-3 space-y-1" data-testid="run-logs-upcoming">
      <p className="text-xs font-medium text-zinc-700">Assigned, not due yet</p>
      <ul className="space-y-1 text-xs text-zinc-600">
        {upcoming.map((row) => (
          <li key={`${row.displayName}-${row.startsOnLabel}-${row.targetLabel ?? ""}`}>
            <span className="font-medium text-zinc-800">{row.displayName}</span>
            {row.targetLabel ? ` · ${row.targetLabel}` : ""} — {row.startsOnLabel}
          </li>
        ))}
      </ul>
    </div>
  );
}
