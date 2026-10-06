import Link from "next/link";

type Props = {
  departmentName: string;
  departmentKey?: string;
  publishedCount: number;
  draftCount: number;
  unmatchedLocationFunctions: boolean;
  locationsHref: string;
};

export function DepartmentWorkPanel({
  departmentName,
  departmentKey,
  publishedCount,
  draftCount,
  unmatchedLocationFunctions,
  locationsHref,
}: Props) {
  const parts: string[] = [];
  if (publishedCount > 0) {
    parts.push(publishedCount === 1 ? "1 published plan" : `${publishedCount} published plans`);
  }
  if (draftCount > 0) {
    parts.push(draftCount === 1 ? "1 draft" : `${draftCount} drafts`);
  }
  const isPlant = departmentKey === "PLANT";

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="department-work-panel">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Work</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {isPlant
            ? "Recurring operational rounds and walkthroughs are configured here. Preventive Maintenance is scheduled service against a specific Asset — not every recurring activity is PM."
            : `Work plans say what ${departmentName} must do, where, and on which Cycle or Phase. Assigning people does not define the work.`}
        </p>
      </div>
      {isPlant && publishedCount === 0 && draftCount === 0 ? (
        <p className="text-sm text-zinc-700" data-testid="department-work-empty">
          Recurring operational rounds and checks. Examples: mechanical room round, building
          walkthrough. Starter configuration can add these later.
        </p>
      ) : (
        <p className="text-sm text-zinc-800">{parts.length > 0 ? parts.join(" · ") : "No work plan yet."}</p>
      )}
      {unmatchedLocationFunctions ? (
        <p className="text-sm text-zinc-700">
          A published plan targets a Location Function that has no bound room.{" "}
          <Link href={locationsHref} className="font-medium underline underline-offset-2">
            Bind Location Functions
          </Link>{" "}
          before expecting that work to land.
        </p>
      ) : null}
      <Link
        href="/staffing/work-plans"
        className="inline-flex min-h-10 items-center text-sm font-medium text-zinc-900 underline underline-offset-2"
        data-testid="department-work-open"
      >
        Open Work plans
      </Link>
    </section>
  );
}
