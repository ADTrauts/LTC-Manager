import Link from "next/link";

import type { AttachmentListItem } from "@/lib/canonical-logs/attachment-presentation";

type Props = {
  targetTitle: string;
  targetSubtitle?: string | null;
  attachments: AttachmentListItem[];
  addHref: string;
  /** Optional compact context facts. */
  departmentName?: string | null;
};

/**
 * Shared BUILD Logs section for Asset / Room / Unit / Department target editors.
 */
export function TargetLogsSection({
  targetTitle,
  targetSubtitle,
  attachments,
  addHref,
  departmentName,
}: Props) {
  const needsSetupCount = attachments.filter((a) => a.needsSetup).length;

  return (
    <section className="space-y-3" data-testid="target-logs-section" aria-labelledby="target-logs-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id="target-logs-heading" className="text-base font-semibold text-zinc-900">
            Logs
          </h2>
          <p className="text-xs text-zinc-500">
            {targetSubtitle ? `${targetTitle} · ${targetSubtitle}` : targetTitle}
            {departmentName ? ` · ${departmentName}` : ""}
          </p>
          {needsSetupCount > 0 ? (
            <p className="mt-0.5 text-xs font-medium text-amber-800" data-testid="needs-setup-count">
              {needsSetupCount} need{needsSetupCount === 1 ? "s" : ""} setup
            </p>
          ) : null}
        </div>
        <Link
          href={addHref}
          className="inline-flex min-h-9 items-center rounded-md border border-zinc-900 bg-zinc-900 px-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          data-testid="add-log-button"
        >
          + Add log
        </Link>
      </div>

      {attachments.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-600"
          data-testid="target-logs-empty"
        >
          <p className="font-medium text-zinc-800">No Logs attached</p>
          <p className="mt-1 text-xs text-zinc-500">Add a Log from the LTC Corp Catalog.</p>
          <Link
            href={addHref}
            className="mt-2 inline-flex min-h-9 items-center text-xs font-medium text-zinc-900 underline underline-offset-2"
          >
            + Add log
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white" role="list">
          {attachments.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              data-testid="attachment-row"
              data-attachment-id={row.id}
              data-needs-setup={row.needsSetup ? "true" : "false"}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-zinc-900">{row.displayName}</p>
                {row.localDisplayLabel ? (
                  <p className="text-[11px] text-zinc-500">Catalog: {row.catalogName}</p>
                ) : null}
                <p className="text-xs text-zinc-600">{row.timingSummary}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-medium text-zinc-800">{row.primaryStateLabel}</span>
                  {row.scheduleSourceLabel ? (
                    <span className="text-zinc-500">{row.scheduleSourceLabel}</span>
                  ) : null}
                </div>
                {row.needsSetup && row.needsSetupReason ? (
                  <p className="text-xs text-amber-900" data-testid="needs-setup-reason">
                    {row.needsSetupReason}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={row.editHref}
                  className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  {row.needsSetup ? "Update schedule" : "Edit"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
