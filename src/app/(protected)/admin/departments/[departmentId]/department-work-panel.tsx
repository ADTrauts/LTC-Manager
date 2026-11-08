import Link from "next/link";

import { GENERIC_WORK_AUTHORING_RETIRED } from "@/lib/department-work";

type Props = {
  departmentName: string;
  overviewHref: string;
};

/**
 * Compatibility surface for old Work deep-links.
 * Generic Work Plan authoring is retired (Phase 2B). Prefer Overview.
 */
export function DepartmentWorkPanel({ departmentName, overviewHref }: Props) {
  return (
    <section
      className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4"
      data-testid="department-work-panel-retired"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Work (retired)</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Generic Work Plans are no longer configured for {departmentName}.{" "}
          {GENERIC_WORK_AUTHORING_RETIRED}
        </p>
      </div>
      <Link
        href={overviewHref}
        className="inline-flex min-h-10 items-center text-sm font-medium text-zinc-900 underline underline-offset-2"
        data-testid="department-work-retired-overview"
      >
        Back to Overview
      </Link>
    </section>
  );
}
