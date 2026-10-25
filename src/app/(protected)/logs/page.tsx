import { redirect } from "next/navigation";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";

type LogsPageProps = {
  searchParams: Promise<{ assignmentId?: string; tab?: string }>;
};

const LOG_TABS = ["templates", "assignments", "submit", "logs"] as const;

/**
 * Earlier Logs is retired. Bookmarks land on the forward Records surfaces.
 * Historical submissions stay in the database until the table drop.
 */
export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = await searchParams;
  const assignmentId = typeof params.assignmentId === "string" ? params.assignmentId.trim() : "";
  const tabRaw = typeof params.tab === "string" ? params.tab.trim() : undefined;
  const activeTab =
    assignmentId && (!tabRaw || !LOG_TABS.includes(tabRaw as (typeof LOG_TABS)[number]))
      ? "submit"
      : tabRaw && LOG_TABS.includes(tabRaw as (typeof LOG_TABS)[number])
        ? tabRaw
        : "templates";

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");

  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    return (
      <section className="mx-auto max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-zinc-600">Open your unit to record work.</p>
      </section>
    );
  }

  if (activeTab === "assignments") {
    redirect("/build/logs");
  }
  if (activeTab === "templates" || activeTab === "submit") {
    redirect("/staffing/logs");
  }
  redirect("/staffing/logs");
}
