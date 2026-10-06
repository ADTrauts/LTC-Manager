import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { MaintenanceSubNav } from "@/components/maintenance-sub-nav";
import { PmRunBoard } from "@/components/plant-operations/pm-run-board";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadPlantRunDepartment, loadPmRunBoard } from "@/lib/preventive-maintenance/run-load";

type PageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function PreventiveMaintenanceRunPage({ searchParams }: PageProps) {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) redirect("/repairs");

  const department = await loadPlantRunDepartment(session);
  if (!department) notFound();

  const query = await searchParams;
  const view =
    query.view === "completed" || query.view === "skipped" || query.view === "projected"
      ? query.view
      : "attention";

  const board = await loadPmRunBoard(session, {
    facilityId: session.facilityId,
    departmentId: department.id,
  });

  return (
    <section className="space-y-6" data-testid="pm-run-page">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Maintenance</h1>
        <MaintenanceSubNav role={session.role} activeId="preventive" />
      </header>
      <PmRunBoard
        departmentId={department.id}
        publishedPlanCount={board.publishedPlanCount}
        canConfigure={board.authority.canPublish}
        canDraft={board.authority.canDraft}
        grouped={board.grouped}
        counts={board.counts}
        view={view}
      />
    </section>
  );
}
