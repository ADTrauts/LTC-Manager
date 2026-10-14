import Link from "next/link";

export function DepartmentMenusPanel({ departmentId }: { departmentId: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="department-menus-panel">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Menus</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Menus are a product capability owned by this Department. They are not Cycles, Records, or Work.
        </p>
      </div>
      <Link
        href={`/menus?department=${encodeURIComponent(departmentId)}`}
        className="inline-flex min-h-10 items-center text-sm font-medium text-zinc-900 underline underline-offset-2"
      >
        Open menus
      </Link>
    </section>
  );
}
