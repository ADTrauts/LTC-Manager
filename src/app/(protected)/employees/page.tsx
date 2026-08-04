import { DisciplinePointCategory } from "@prisma/client";
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
import { getSession } from "@/lib/auth";
import { ensureGmEmployeeRosterRow } from "@/lib/ensure-gm-employee-roster";
import { ensureDefaultDepartments } from "@/lib/ensure-default-departments";
import { resolveEmployeesDeptScope } from "@/lib/employees-department-tabs";
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
    jobTitleId: employee.jobTitleId,
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
    dept: one("dept"),
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

  const sp = await searchParams;
  const { deptId, deptName } = await resolveEmployeesDeptScope(prisma, facilityId, "/employees", sp);

  const directoryQuery = parseDirectoryQuery(sp);
  const where = buildEmployeeWhere(facilityId, directoryQuery);
  const orderBy = buildEmployeeOrderBy(directoryQuery.sort);

  const [employees, units, jobTitles] = await Promise.all([
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
  ]);

  const primaryDeptIdsOnPage = [
    ...new Set(
      employees.map((e) => e.primaryDepartmentId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const departments = await prisma.department.findMany({
    where: {
      facilityId,
      isActive: true,
      OR: [
        { showInEmployeeApp: true },
        ...(primaryDeptIdsOnPage.length > 0 ? [{ id: { in: primaryDeptIdsOnPage } }] : []),
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, showInEmployeeApp: true },
  });

  const departmentsForCreate = departments.filter((d) => d.showInEmployeeApp);

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
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Employees</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            {deptName ? (
              <>
                Showing <span className="font-medium text-zinc-800">{deptName}</span> only (primary or additional
                department).{" "}
              </>
            ) : null}
            {showPinManagement
              ? "Create and update people, unit access for PIN sign-in, default assignments, HR fields, and floor PINs."
              : "Create and update people, unit access for PIN sign-in, default assignments, and HR fields."}
          </p>
        </div>
        {showManagerTools ? (
          <CreateEmployeeDrawer units={units} departments={departmentsForCreate} jobTitles={jobTitles} />
        ) : null}
      </header>

      <EmployeesFiltersCollapsible
        defaultExpanded={hasNonDefaultEmployeeFilters(directoryQuery)}
        filterCount={countNonDefaultEmployeeFilters(directoryQuery)}
      >
        <EmployeesFiltersForm current={directoryQuery} embedded />
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
