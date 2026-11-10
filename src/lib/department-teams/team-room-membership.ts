import type { PrismaClient } from "@prisma/client";

/** Explicit normal Team room membership. It never grants access or creates obligations. */
export function configuredTeamSpaceIds(input: { explicitSpaceIds: readonly string[] }): string[] {
  return [...new Set(input.explicitSpaceIds.map(id => id.trim()).filter(Boolean))];
}
/** View configuration only. Callers must first establish Department authorization. */
export async function loadEmployeeTeamRoomView(
  db: Pick<PrismaClient, "employeeTeamMembership">,
  input: { facilityId: string; departmentId: string; employeeId: string | null },
) {
  if (!input.employeeId) return { activeTeams: [], roomIds: [] };
  const memberships = await db.employeeTeamMembership.findMany({
    where: { employeeId: input.employeeId, team: { facilityId: input.facilityId,
      departmentId: input.departmentId, status: "ACTIVE" } },
    select: { team: { select: { id: true, displayName: true, roomMemberships: {
      where: { space: { facilityId: input.facilityId, isActive: true,
        responsibilities: { some: { departmentId: input.departmentId } } } },
      select: { spaceId: true },
    } } } },
  });
  return {
    activeTeams: memberships.map(({ team }) => ({ id: team.id, name: team.displayName })),
    roomIds: configuredTeamSpaceIds({ explicitSpaceIds: memberships.flatMap(({ team }) => team.roomMemberships.map(row => row.spaceId)) }),
  };
}
