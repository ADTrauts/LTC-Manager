import { DisciplinePointCategory } from "@prisma/client";
import { cookies } from "next/headers";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { CreateEmployeeDrawer } from "@/components/create-employee-drawer";
import { EmployeesFiltersCollapsible } from "@/components/employees-filters-collapsible";
import { EmployeesFiltersForm } from "@/components/employees-filters";
import { EmployeeManagementCard, type EmployeeForManagementCard } from "@/components/employee-management-card";
import {
  buildEmployeeOrderBy,
  buildEmployeeWhere,
  countNonDefaultEmployeeFilters,
  hasNonDefaultEmployeeFilters,
  type EmployeeDirectoryQuery,
} from "@/lib/employee-directory-filters";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { buildPageIntro } from "@/lib/build-hub";
import { ensureGmEmployeeRosterRow } from "@/lib/ensure-gm-employee-roster";
import { ensureDefaultDepartments } from "@/lib/ensure-default-departments";
import { loadActiveJobRolesForFacilityDepartments } from "@/lib/department-job-roles";
import { prisma } from "@/lib/prisma";

function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function computeDisciplineTotals(entries: { category: DisciplinePointCategory; points: number }[]) {
  let attendance = 0;
  let performance = 0;
  for (const e of entries) {
    if (e.category === DisciplinePointCategory.ATTENDANCE) attendance += e.points;
    else performance += e.points;
  }
  return { attendance, performance, total: attendance + performance };
}

function toEmployeeCardProps(
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    roleType: EmployeeForManagementCard["roleType"];
    employmentType: EmployeeForManagementCard["employmentType"];
    status: EmployeeForManagementCard["status"];
    primaryUnitId: string | null;
    primaryDepartmentId: string | null;
    jobTitleId: string | null;
    employeeDepartments?: { departmentId: string }[];
    teamMemberships?: { teamId: string; isPrimary: boolean }[];
    departmentJobRoles?: { departmentId: string; jobRoleId: string }[];
    unionMember: boolean;
    onLeave: boolean;
    hireDate: Date | null;
    birthMonth: number | null;
    birthDay: number | null;
    jobClassification: EmployeeForManagementCard["jobClassification"];
    chrcStatus: EmployeeForManagementCard["chrcStatus"];
    chrcClearedAt: Date | null;
    chrcNotes: string | null;
    shirtSize: string | null;
    hrNotes: string | null;
    terminationDate: Date | null;
    chrcOffboardingCompletedAt: Date | null;
    chrcOffboardingNotes: string | null;
    unitAccesses: { unitId: string }[];
    workStations: { station: EmployeeForManagementCard["workStations"][number] }[];
    defaultAssignments: EmployeeForManagementCard["defaultAssignments"];
    disciplinePointEntries: {
      id: string;
      category: DisciplinePointCategory;
      points: number;
      occurredAt: Date;
      note: string | null;
    }[];
  },
  hasAppLogin: boolean,
): EmployeeForManagementCard {
  const disciplineEntries = employee.disciplinePointEntries.map((e) => ({
    id: e.id,
    category: e.category,
    points: e.points,
    occurredAtIso: e.occurredAt.toISOString().slice(0, 10),
    note: e.note,
  }));
  const disciplineTotals = computeDisciplineTotals(employee.disciplinePointEntries);

  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    hasAppLogin,
    phone: employee.phone,
    roleType: employee.roleType,
    employmentType: employee.employmentType,
    status: employee.status,
    primaryUnitId: employee.primaryUnitId,
    primaryDepartmentId: employee.primaryDepartmentId,
    additionalDepartmentIds: (employee.employeeDepartments ?? [])
      .map((row) => row.departmentId)
      .filter((id) => id !== employee.primaryDepartmentId),
    jobTitleId: employee.jobTitleId,
    teamMemberships: employee.teamMemberships ?? [],
    jobRoleAssignments: (employee.departmentJobRoles ?? []).map((row) => ({
      departmentId: row.departmentId,
      jobRoleId: row.jobRoleId,
    })),
    unitAccesses: employee.unitAccesses,
    defaultAssignments: employee.defaultAssignments,
    unionMember: employee.unionMember,
    onLeave: employee.onLeave,
    hireDateIso: toIsoDate(employee.hireDate),
    birthMonth: employee.birthMonth,
    birthDay: employee.birthDay,
    jobClassification: employee.jobClassification,
    chrcStatus: employee.chrcStatus,
    chrcClearedAtIso: toIsoDate(employee.chrcClearedAt),
    chrcNotes: employee.chrcNotes,
    shirtSize: employee.shirtSize,
    hrNotes: employee.hrNotes,
    workStations: employee.workStations.map((w) => w.station),
    disciplineEntries,
    disciplineTotals,
    terminationDateIso: toIsoDate(employee.terminationDate),
    chrcOffboardingCompletedAtIso: toIsoDate(employee.chrcOffboardingCompletedAt),
    chrcOffboardingNotes: employee.chrcOffboardingNotes,
  };
}

function parseDirectoryQuery(sp: { [key: string]: string | string[] | undefined }): EmployeeDirectoryQuery {
  const one = (k: string) => (typeof sp[k] === "string" ? sp[k] : undefined);
  return {
    q: one("q"),
    status: one("status"),
    union: one("union"),
    classification: one("classification"),
    station: one("station"),
    chrc: one("chrc"),
    leave: one("leave"),
    hasPoints: one("hasPoints"),
    birthMonth: one("birthMonth"),
    sort: one("sort"),
    team: one("team"),
    jobTitle: one("jobTitle"),
  };
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  await ensureGmEmployeeRosterRow(session);
  const facilityId = session.facilityId;
  const showPinManagement = hasAtLeastRole(session.role, "GM");
  const showManagerTools = hasAtLeastRole(session.role, "MANAGER");

  if ((await prisma.department.count({ where: { facilityId } })) === 0) {
    await ensureDefaultDepartments(prisma, facilityId);
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const activeDepartmentId = deptNav.activeDepartmentId;
  const activeDepartment = activeDepartmentId
    ? await prisma.department.findFirst({
        where: { id: activeDepartmentId, facilityId, isActive: true },
        select: { id: true, name: true },
      })
    : null;
  const deptName = activeDepartment?.name ?? null;

  const sp = await searchParams;
  const directoryQuery = parseDirectoryQuery(sp);
  // Shell active Department is canonical scope; deep-link `dept` is no longer the primary filter.
  if (activeDepartmentId) {
    directoryQuery.dept = activeDepartmentId;
  }
  const where = buildEmployeeWhere(facilityId, directoryQuery);
  const orderBy = buildEmployeeOrderBy(directoryQuery.sort);

  const [employees, units, jobTitles, activeTeams] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        roleType: true,
        status: true,
        employmentType: true,
        primaryUnitId: true,
        primaryDepartmentId: true,
        jobTitleId: true,
        employeeDepartments: { select: { departmentId: true } },
        teamMemberships: {
          where: { team: { status: "ACTIVE" } },
          select: { teamId: true, isPrimary: true },
        },
        departmentJobRoles: {
          select: { departmentId: true, jobRoleId: true },
        },
        unionMember: true,
        onLeave: true,
        hireDate: true,
        birthMonth: true,
        birthDay: true,
        jobClassification: true,
        chrcStatus: true,
        chrcClearedAt: true,
        chrcNotes: true,
        shirtSize: true,
        hrNotes: true,
        terminationDate: true,
        chrcOffboardingCompletedAt: true,
        chrcOffboardingNotes: true,
        ...(showPinManagement ? { pinDigest: true as const } : {}),
        unitAccesses: { select: { unitId: true } },
        workStations: { select: { station: true } },
        defaultAssignments: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            roleType: true,
            unit: { select: { name: true } },
          },
        },
        disciplinePointEntries: {
          orderBy: { occurredAt: "desc" },
          select: { id: true, category: true, points: true, occurredAt: true, note: true },
        },
      },
    }),
    prisma.unit.findMany({
      where: { facilityId, isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.jobTitle.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.departmentTeam.findMany({
      where: { facilityId, status: "ACTIVE" },
      orderBy: [{ displayName: "asc" }],
      select: {
        id: true,
        displayName: true,
        departmentId: true,
        department: { select: { name: true } },
      },
    }),
  ]);

  const assignedDeptIdsOnPage = [
    ...new Set(
      employees.flatMap((e) => [
        ...(e.primaryDepartmentId ? [e.primaryDepartmentId] : []),
        ...e.employeeDepartments.map((row) => row.departmentId),
      ]),
    ),
  ];

  const departments = await prisma.department.findMany({
    where: {
      facilityId,
      isActive: true,
      OR: [
        { showInEmployeeApp: true },
        ...(assignedDeptIdsOnPage.length > 0 ? [{ id: { in: assignedDeptIdsOnPage } }] : []),
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, showInEmployeeApp: true },
  });

  const departmentsForCreate = departments.filter((d) => d.showInEmployeeApp);
  const jobRoleDepartmentIds = [
    ...new Set([...departments.map((d) => d.id), ...assignedDeptIdsOnPage]),
  ];
  const jobRoles = await loadActiveJobRolesForFacilityDepartments(prisma, {
    facilityId,
    departmentIds: jobRoleDepartmentIds,
  });

  const distinctEmails = [
    ...new Set(
      employees
        .map((e) => e.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ];
  const appLoginEmailSet = new Set<string>();
  if (distinctEmails.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        facilityId,
        isActive: true,
        email: { in: distinctEmails },
      },
      select: { email: true },
    });
    for (const u of users) {
      appLoginEmailSet.add(u.email.toLowerCase());
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Employees</h1>
          <p className="max-w-3xl text-sm text-zinc-600">
            {deptName ? (
              <>
                Showing <span className="font-medium text-zinc-800">{deptName}</span> only.{" "}
              </>
            ) : (
              <>Showing all departments. </>
            )}
            {buildPageIntro("/employees")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showManagerTools ? (
            <Link
              href="/employees/import"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Import
            </Link>
          ) : null}
          {showManagerTools ? (
            <CreateEmployeeDrawer
              units={units}
              departments={departmentsForCreate}
              jobTitles={jobTitles}
              teams={activeTeams}
              jobRoles={jobRoles}
            />
          ) : null}
        </div>
      </header>

      <EmployeesFiltersCollapsible
        defaultExpanded={hasNonDefaultEmployeeFilters(directoryQuery)}
        filterCount={countNonDefaultEmployeeFilters({
          ...directoryQuery,
          // Shell dept scope is not a "filter chip" — omit from count.
          dept: undefined,
        })}
      >
        <EmployeesFiltersForm
          current={{ ...directoryQuery, dept: undefined }}
          embedded
          teams={activeTeams.map((team) => ({
            id: team.id,
            displayName: team.displayName,
            departmentId: team.departmentId,
            departmentName: team.department.name,
          }))}
        />
      </EmployeesFiltersCollapsible>

      <div className="space-y-3">
        {employees.map((employee) => (
          <EmployeeManagementCard
            key={employee.id}
            employee={toEmployeeCardProps(
              employee,
              Boolean(
                employee.email?.trim() &&
                  appLoginEmailSet.has(employee.email.trim().toLowerCase()),
              ),
            )}
            units={units}
            departments={departments}
            jobTitles={jobTitles}
            teams={activeTeams}
            jobRoles={jobRoles}
            showManagerTools={showManagerTools}
            showPinManagement={showPinManagement}
            {...(showPinManagement ? { hasPinSet: Boolean(employee.pinDigest) } : {})}
          />
        ))}
        {employees.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">
            No employees match these filters.
          </p>
        ) : null}
      </div>
    </section>
  );
}
