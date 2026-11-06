import Link from "next/link";
import { WorkbookWorkspace } from "@/components/onboarding-workbook-workspace";
import {
  employeeVisibleWhere,
  loadDepartmentVisibility,
  visibleDepartmentIdList,
} from "@/lib/department-authority/visibility";
import { requireFacilitySession } from "@/lib/facility-context";
import { liveActor } from "@/lib/setup-imports/authority";
import { prisma } from "@/lib/prisma";
import { loadCustomerOperableDepartments } from "@/lib/department-products/load-facility-catalog";
import { DATASETS, type Dataset } from "@/lib/setup-imports/public-contract";
import { SetupImportWorkspace } from "@/components/setup-import-workspace";

export default async function BulkSetupPage({ searchParams }: { searchParams: Promise<{ dataset?: string; mode?: string }> }) {
  const session = await requireFacilitySession();
  await liveActor(prisma,session,session.facilityId,"assets");
  const visibility = await loadDepartmentVisibility(prisma, session, session.facilityId);
  const visibleIds = visibleDepartmentIdList(visibility);
  const employeeWhere = visibility
    ? { AND: [{ facilityId: session.facilityId }, employeeVisibleWhere(visibility)] }
    : { facilityId: session.facilityId };
  const [facility, loadedDepartments, employees, units, rooms, teams, jobRoles, jobTitles] = await Promise.all([
    prisma.facility.findUniqueOrThrow({ where: { id: session.facilityId }, select: { displayName: true } }),
    loadCustomerOperableDepartments(prisma,session.facilityId),
    prisma.employee.findMany({ where: employeeWhere, select: { id: true, firstName: true, lastName: true, email: true }, take: 5000 }),
    prisma.unit.findMany({
      where: visibleIds
        ? {
            facilityId: session.facilityId,
            isActive: true,
            OR: [
              { departmentResponsibilities: { some: { departmentId: { in: [...visibleIds] } } } },
              { childSpaces: { some: { responsibilities: { some: { departmentId: { in: [...visibleIds] } } } } } },
            ],
          }
        : { facilityId: session.facilityId, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.unitSpace.findMany({
      where: visibleIds
        ? { facilityId: session.facilityId, isActive: true, responsibilities: { some: { departmentId: { in: [...visibleIds] } } } }
        : { facilityId: session.facilityId, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.departmentTeam.findMany({
      where: visibleIds
        ? { facilityId: session.facilityId, status: "ACTIVE", departmentId: { in: [...visibleIds] } }
        : { facilityId: session.facilityId, status: "ACTIVE" },
      select: { id: true, displayName: true, departmentId: true },
    }),
    prisma.departmentJobRole.findMany({
      where: visibleIds
        ? { facilityId: session.facilityId, status: "ACTIVE", departmentId: { in: [...visibleIds] } }
        : { facilityId: session.facilityId, status: "ACTIVE" },
      select: { id: true, displayName: true, departmentId: true },
    }),
    prisma.jobTitle.findMany({ where: { facilityId: session.facilityId, isActive: true }, select: { id: true, name: true } }),
  ]);
  const departments = loadedDepartments.filter((department) => !visibility || visibility.pageDepartmentIds.has(department.id));
  const datasets: Dataset[] = session.role === "FACILITY_ADMINISTRATOR" ? [...DATASETS] : ["assets"];
  const query = await searchParams;
  if (query.mode === "workbook" && session.role !== "FACILITY_ADMINISTRATOR") return <section className="app-card"><p role="alert">Combined workbook setup requires an internal Facility Administrator or Console Facility work session.</p><Link className="underline" href="/employees/bulk-setup">Import one list instead</Link></section>;
  if (query.mode === "workbook") await liveActor(prisma,session,session.facilityId,"workforce");
  const initialDataset = datasets.includes(query.dataset as Dataset) ? query.dataset as Dataset : datasets[0]!;
  return <section className="mx-auto max-w-6xl space-y-5" data-testid="bulk-setup-page">
    <header><h1 className="text-2xl font-semibold">Bulk workforce and relationship setup</h1><p>{facility.displayName}</p><p className="text-sm">Import structure in Facility Builder, share Department locations, create/reuse linked workforce, add memberships, then register Assets. Configuration and publication stay in their own Builders.</p></header>
    <nav className="flex flex-wrap gap-4">{session.role === "FACILITY_ADMINISTRATOR" ? <Link className="underline" href="/employees/bulk-setup?mode=workbook">Combined XLSX workbook</Link> : null}<Link className="underline" href="/employees/bulk-setup">Import one list instead</Link><Link className="underline" href="/employees/import">Update existing employees</Link><Link className="underline" href="/employees">People / credential enrollment</Link><Link className="underline" href="/admin/facility/builder">Facility Builder / structure CSV</Link><Link className="underline" href="/assets/builder">Asset Builder</Link></nav>
    {query.mode === "workbook" ? <WorkbookWorkspace key={`${session.authKind}:${session.uid}:${session.facilityId}`} facilityId={session.facilityId} actorKey={`${session.authKind}:${session.uid}`} /> : <SetupImportWorkspace key={`${session.authKind}:${session.uid}:${session.facilityId}`} facilityId={session.facilityId} actorKey={`${session.authKind}:${session.uid}`} datasets={datasets} initialDataset={initialDataset} departments={departments.map(d => ({ id: d.id, key: d.key, name: d.name }))} />}
    <details className="app-card"><summary>Canonical Facility references for CSV</summary><p className="text-sm">Use exact IDs below. Department keys or unambiguous names also work. Employee lists show at most 5,000 entries; People remains authoritative. Nothing here is a password or PIN.</p>
      <div className="overflow-x-auto text-sm"><table><thead><tr><th>Type</th><th>ID</th><th>Name / scope</th></tr></thead><tbody>
        {departments.map(d => <tr key={d.id}><td>DEPARTMENT</td><td>{d.id}</td><td>{d.key}: {d.name}</td></tr>)}
        {employees.map(e => <tr key={e.id}><td>EMPLOYEE</td><td>{e.id}</td><td>{e.firstName} {e.lastName} ({e.email})</td></tr>)}
        {units.map(u => <tr key={u.id}><td>UNIT</td><td>{u.id}</td><td>{u.name}</td></tr>)}
        {rooms.map(u => <tr key={u.id}><td>ROOM</td><td>{u.id}</td><td>{u.name}</td></tr>)}
        {teams.map(t => <tr key={t.id}><td>TEAM</td><td>{t.id}</td><td>{t.displayName} / {t.departmentId}</td></tr>)}
        {jobRoles.map(t => <tr key={t.id}><td>JOB_ROLE</td><td>{t.id}</td><td>{t.displayName} / {t.departmentId}</td></tr>)}
        {jobTitles.map(t => <tr key={t.id}><td>JOB_TITLE</td><td>{t.id}</td><td>{t.name}</td></tr>)}
      </tbody></table></div>
    </details>
  </section>;
}
