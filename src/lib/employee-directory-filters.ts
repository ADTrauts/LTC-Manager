import { ChrcStatus, EmployeeStatus, JobClassification, Prisma, WorkStation } from "@prisma/client";

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-department-scope";

export type EmployeeDirectoryQuery = {
  q?: string;
  status?: string;
  union?: string;
  classification?: string;
  station?: string;
  chrc?: string;
  leave?: string;
  /** `yes` = any discipline entry with points &gt; 0; `no` = none such */
  hasPoints?: string;
  /** 1–12 or `all` */
  birthMonth?: string;
  sort?: string;
  /** Department id (must be an app-visible department); roster shows primary + floater membership. */
  dept?: string;
};

export function buildEmployeeWhere(
  facilityId: string,
  query: EmployeeDirectoryQuery,
): Prisma.EmployeeWhereInput {
  const parts: Prisma.EmployeeWhereInput[] = [{ facilityId }];

  const q = query.q?.trim();
  if (q) {
    parts.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (query.status && query.status !== "all") {
    const st = query.status as EmployeeStatus;
    if ((Object.values(EmployeeStatus) as EmployeeStatus[]).includes(st)) {
      parts.push({ status: st });
    }
  }

  if (query.union === "yes") parts.push({ unionMember: true });
  if (query.union === "no") parts.push({ unionMember: false });

  if (query.classification && query.classification !== "all") {
    const jc = query.classification as JobClassification;
    if ((Object.values(JobClassification) as JobClassification[]).includes(jc)) {
      parts.push({ jobClassification: jc });
    }
  }

  if (query.station && query.station !== "all") {
    const st = query.station as WorkStation;
    if ((Object.values(WorkStation) as WorkStation[]).includes(st)) {
      parts.push({ workStations: { some: { station: st } } });
    }
  }

  if (query.chrc && query.chrc !== "all") {
    const cs = query.chrc as ChrcStatus;
    if ((Object.values(ChrcStatus) as ChrcStatus[]).includes(cs)) {
      parts.push({ chrcStatus: cs });
    }
  }

  if (query.leave === "yes") parts.push({ onLeave: true });
  if (query.leave === "no") parts.push({ onLeave: false });

  if (query.hasPoints === "yes") {
    parts.push({ disciplinePointEntries: { some: { points: { gt: 0 } } } });
  }
  if (query.hasPoints === "no") {
    parts.push({ NOT: { disciplinePointEntries: { some: { points: { gt: 0 } } } } });
  }

  if (query.birthMonth && query.birthMonth !== "all") {
    const m = Number(query.birthMonth);
    if (Number.isInteger(m) && m >= 1 && m <= 12) {
      parts.push({ birthMonth: m });
    }
  }

  const deptId = query.dept?.trim();
  if (deptId) {
    parts.push(employeeBelongsToDepartmentWhere(deptId));
  }

  return parts.length === 1 ? parts[0]! : { AND: parts };
}

export function buildEmployeeOrderBy(
  sort: string | undefined,
): Prisma.EmployeeOrderByWithRelationInput[] {
  const s = sort ?? "name";
  switch (s) {
    case "nameDesc":
      return [{ lastName: "desc" }, { firstName: "desc" }];
    case "hireDate":
      return [
        { hireDate: { sort: "asc", nulls: "last" } },
        { lastName: "asc" },
        { firstName: "asc" },
      ];
    case "hireDateDesc":
      return [
        { hireDate: { sort: "desc", nulls: "last" } },
        { lastName: "asc" },
        { firstName: "asc" },
      ];
    case "status":
      return [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }];
    default:
      return [{ lastName: "asc" }, { firstName: "asc" }];
  }
}

/** True when any directory filter differs from defaults (name sort, all dropdowns, empty search). */
export function hasNonDefaultEmployeeFilters(query: EmployeeDirectoryQuery): boolean {
  return countNonDefaultEmployeeFilters(query) > 0;
}

export function countNonDefaultEmployeeFilters(query: EmployeeDirectoryQuery): number {
  let n = 0;
  if (query.q?.trim()) n += 1;
  if (query.status && query.status !== "all") n += 1;
  if (query.union && query.union !== "all") n += 1;
  if (query.classification && query.classification !== "all") n += 1;
  if (query.station && query.station !== "all") n += 1;
  if (query.chrc && query.chrc !== "all") n += 1;
  if (query.leave && query.leave !== "all") n += 1;
  if (query.hasPoints && query.hasPoints !== "all") n += 1;
  if (query.birthMonth && query.birthMonth !== "all") n += 1;
  if (query.sort && query.sort !== "name") n += 1;
  if (query.dept?.trim()) n += 1;
  return n;
}
