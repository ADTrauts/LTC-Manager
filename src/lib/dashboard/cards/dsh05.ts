import type { ChrcStatus } from "@prisma/client";

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership/department";
import { loadFacilityDepartmentCatalog } from "@/lib/department-products/load-facility-catalog";
import { OPEN_OPERATIONAL_REQUEST_STATUSES } from "@/lib/operational-requests/types";
import { presentRequesterStatus, requesterProjectedStatusLabel } from "@/lib/operational-requests/request-semantics";
import { prisma } from "@/lib/prisma";
import { attentionFromRuntimeLocations } from "@/lib/dashboard/attention-mappers/runtime-locations";

import type { CardLoadInput, CardResult, DashboardReadyModel } from "./types";
import { quiet, ready } from "./present";

const LINE_LIMIT = 8;

export type PeopleAlert = { id: string; title: string; detail: string };
export type TeamGlanceRow = { id: string; name: string; attention: number; departmentId: string };
export type FiledRequestRow = { id: string; code: string; summary: string; statusLabel: string };
export type LicensingRow = { id: string; name: string; licensed: boolean; active: boolean };

export function presentPeopleAlerts(alerts: readonly PeopleAlert[]): CardResult<DashboardReadyModel> {
  if (alerts.length === 0) return quiet("No people issues need a leader.");
  return ready(
    [{ label: "People", value: alerts.length, tone: "attention" }],
    alerts.slice(0, LINE_LIMIT).map((alert) => ({
      id: alert.id,
      title: alert.title,
      detail: alert.detail,
      tone: "attention" as const,
      href: "/employees",
    })),
  );
}

export function presentTeamsAtAGlance(rows: readonly TeamGlanceRow[]): CardResult<DashboardReadyModel> {
  if (rows.length === 0) return quiet("No teams yet.");
  const needing = rows.filter((row) => row.attention > 0);
  if (needing.length === 0) return quiet("Every team is on track.");
  return ready(
    [{ label: "Teams needing help", value: needing.length, tone: "late" }],
    needing.slice(0, LINE_LIMIT).map((row) => ({
      id: row.id,
      title: row.name,
      detail: row.attention === 1 ? "1 room needs attention" : `${row.attention} rooms need attention`,
      tone: "late" as const,
      href: `/dashboard?scope=team:${row.departmentId}`,
    })),
  );
}

export function presentFiledRequests(rows: readonly FiledRequestRow[]): CardResult<DashboardReadyModel> {
  if (rows.length === 0) return quiet("No open requests to Maintenance.");
  return ready(
    [{ label: "Open", value: rows.length, tone: "attention" }],
    rows.slice(0, LINE_LIMIT).map((row) => ({
      id: row.id,
      title: row.summary || row.code,
      detail: row.statusLabel,
      tone: "attention" as const,
      href: "/repairs",
    })),
  );
}

export function presentLicensing(rows: readonly LicensingRow[]): CardResult<DashboardReadyModel> {
  if (rows.length === 0) return quiet("No Departments are installed.");
  const inactive = rows.filter((row) => !row.licensed || !row.active).length;
  return ready(
    [{ label: "Installed", value: rows.length, tone: inactive > 0 ? "attention" : "ok" }],
    rows.slice(0, LINE_LIMIT).map((row) => ({
      id: row.id,
      title: row.name,
      detail: [row.licensed ? "Licensed" : "Not licensed", row.active ? "Active" : "Inactive"].join(" · "),
      tone: row.licensed && row.active ? ("ok" as const) : ("attention" as const),
      href: "/admin/departments",
    })),
  );
}

function departmentPeopleWhere(departmentIds: readonly string[]) {
  return { OR: departmentIds.map((departmentId) => employeeBelongsToDepartmentWhere(departmentId)) };
}

export async function loadPeopleAlerts(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentIds = input.facts.departmentIds;
  if (departmentIds.length === 0) return presentPeopleAlerts([]);
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const facilityId = input.facts.viewer.facilityId;
  const peopleWhere = { facilityId, status: "ACTIVE" as const, AND: [departmentPeopleWhere(departmentIds)] };
  const [people, invitations, points, separations] = await Promise.all([
    prisma.employee.findMany({
      where: peopleWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        chrcStatus: true,
        pinDigest: true,
        primaryDepartmentId: true,
        teamMemberships: { select: { team: { select: { departmentId: true } } } },
      },
    }),
    prisma.employeeUserLinkInvitation.findMany({
      where: { facilityId, status: "PENDING", employee: peopleWhere },
      select: { id: true, employee: { select: { firstName: true, lastName: true } } },
    }),
    prisma.disciplinePointEntry.groupBy({
      by: ["employeeId"],
      where: { employee: peopleWhere },
      _sum: { points: true },
    }),
    prisma.employee.findMany({
      where: {
        facilityId,
        status: "TERMINATED",
        terminationDate: { gte: since },
        AND: [departmentPeopleWhere(departmentIds)],
      },
      select: { id: true, firstName: true, lastName: true },
      take: LINE_LIMIT,
    }),
  ]);
  const names = new Map(people.map((person) => [person.id, `${person.firstName} ${person.lastName}`]));
  const alerts: PeopleAlert[] = [];
  for (const person of people) {
    const name = `${person.firstName} ${person.lastName}`;
    if (person.chrcStatus === "NOT_STARTED" || person.chrcStatus === "PENDING") {
      alerts.push({ id: `chrc:${person.id}`, title: name, detail: chrcLabel(person.chrcStatus) });
    }
    if (!person.pinDigest) {
      alerts.push({ id: `pin:${person.id}`, title: name, detail: "PIN not set" });
    }
    const home = person.primaryDepartmentId;
    if (home && departmentIds.includes(home) && !person.teamMemberships.some((membership) => membership.team.departmentId === home)) {
      alerts.push({ id: `team:${person.id}`, title: name, detail: "No team" });
    }
  }
  for (const invitation of invitations) {
    alerts.push({
      id: `invite:${invitation.id}`,
      title: `${invitation.employee.firstName} ${invitation.employee.lastName}`,
      detail: "Account link pending",
    });
  }
  for (const row of points) {
    const total = row._sum.points ?? 0;
    if (total <= 0) continue;
    alerts.push({
      id: `points:${row.employeeId}`,
      title: names.get(row.employeeId) ?? "Employee",
      detail: `${total} discipline points`,
    });
  }
  for (const person of separations) {
    alerts.push({
      id: `separation:${person.id}`,
      title: `${person.firstName} ${person.lastName}`,
      detail: "Recent separation",
    });
  }
  return presentPeopleAlerts(alerts);
}

function chrcLabel(status: ChrcStatus): string {
  return status === "PENDING" ? "Background check pending" : "Background check not started";
}

export async function loadTeamsAtAGlance(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentId = input.facts.departmentIds[0];
  if (!departmentId || input.facts.viewer.scope?.kind === "FACILITY") return presentTeamsAtAGlance([]);
  const [teams, states] = await Promise.all([
    prisma.departmentTeam.findMany({
      where: { facilityId: input.facts.viewer.facilityId, departmentId, status: "ACTIVE" },
      select: { id: true, displayName: true, roomMemberships: { select: { spaceId: true } } },
    }),
    input.facts.runtimeLocations(),
  ]);
  const attention = new Set(
    attentionFromRuntimeLocations(states)
      .map((item) => item.locationId)
      .filter((id): id is string => Boolean(id)),
  );
  return presentTeamsAtAGlance(
    teams.map((team) => ({
      id: team.id,
      name: team.displayName,
      departmentId,
      attention: team.roomMemberships.filter((room) => attention.has(room.spaceId)).length,
    })),
  );
}

export async function loadFiledRequests(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentIds = input.facts.departmentIds;
  if (departmentIds.length === 0) return presentFiledRequests([]);
  const requests = await prisma.operationalRequest.findMany({
    where: {
      facilityId: input.facts.viewer.facilityId,
      requestingDepartmentId: { in: [...departmentIds] },
      status: { in: OPEN_OPERATIONAL_REQUEST_STATUSES },
    },
    orderBy: { reportedAt: "desc" },
    take: LINE_LIMIT,
    select: {
      id: true,
      requestCode: true,
      summary: true,
      status: true,
      workOrderId: true,
      workOrder: { select: { status: true } },
    },
  });
  return presentFiledRequests(
    requests.map((request) => ({
      id: request.id,
      code: request.requestCode,
      summary: request.summary,
      statusLabel: requesterProjectedStatusLabel(
        presentRequesterStatus({
          status: request.status,
          workOrderId: request.workOrderId,
          workOrderStatus: request.workOrder?.status ?? null,
        }),
      ),
    })),
  );
}

export function presentReviewYesterday(
  days: readonly { serviceDate: string; items: readonly { id: string; label: string }[] }[],
): CardResult<DashboardReadyModel> {
  const lines = days.flatMap((day) =>
    day.items.map((item) => ({
      id: `${day.serviceDate}:${item.id}`,
      title: item.label,
      detail: null,
      tone: "attention" as const,
      href: `/reports?date=${day.serviceDate}`,
    })),
  );
  if (lines.length === 0) return quiet("Yesterday was clear.");
  return ready([{ label: "To look at", value: lines.length, tone: "attention" }], lines.slice(0, LINE_LIMIT));
}

export async function loadReviewYesterday(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const capabilities = await input.facts.capabilities();
  const departmentIds = input.facts.departmentIds.filter((id) => capabilities.get(id)?.has.has("records.canonical"));
  if (departmentIds.length === 0) return presentReviewYesterday([]);
  const days = await Promise.all(
    departmentIds.map(async (departmentId) => {
      const review = await input.facts.reviewDay(departmentId);
      return {
        serviceDate: review.serviceDate,
        items: review.quiet ? [] : review.summaryItems.map((item) => ({ id: item.id, label: item.label })),
      };
    }),
  );
  return presentReviewYesterday(days);
}

export async function loadLicensing(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const catalog = await loadFacilityDepartmentCatalog(prisma, input.facts.viewer.facilityId);
  return presentLicensing(
    catalog
      .filter((item) => item.installed)
      .map((item) => ({
        id: item.departmentId ?? item.installationKey,
        name: item.name,
        licensed: item.licensed,
        active: item.departmentActive,
      })),
  );
}
