import { EmployeeStatus, type Prisma, type RoleKey } from "@prisma/client";

type LinkedUserAuthorityClient = Pick<Prisma.TransactionClient, "role" | "user">;

export type LinkedUserAuthorityInput = {
  userId: string;
  currentUserRole: RoleKey;
  nextEmployeeRole: RoleKey;
  previousEmployeeStatus: EmployeeStatus;
  nextEmployeeStatus: EmployeeStatus;
  displayName: string;
  email?: string;
  /**
   * When true, User.roleId is rewritten for home-default compatibility.
   * Facility-specific authority is the grant role period, not this field.
   */
  updateHomeRole?: boolean;
  /**
   * Employee primary department is the operational home for password login scoping
   * (Work Plans, Cycles, nav). Always written onto the linked User when provided.
   */
  primaryDepartmentId?: string | null;
};

/**
 * Keep display/home-default fields aligned with a linked Employee.
 * Does not disable the User on termination and does not bump User.sessionVersion
 * for a Facility workforce role change — Path A uses the Facility role period.
 */
export async function syncLinkedUserAuthority(
  client: LinkedUserAuthorityClient,
  input: LinkedUserAuthorityInput,
): Promise<{ roleChanged: boolean; terminated: boolean; sessionsRevoked: boolean }> {
  const roleChanged = input.currentUserRole !== input.nextEmployeeRole;
  const terminated =
    input.previousEmployeeStatus !== EmployeeStatus.TERMINATED &&
    input.nextEmployeeStatus === EmployeeStatus.TERMINATED;

  const roleRow = roleChanged
    ? await client.role.findFirst({
        where: { key: input.nextEmployeeRole, isActive: true },
        select: { id: true },
      })
    : null;
  if (roleChanged && !roleRow) {
    throw new Error("Role configuration is missing for this facility.");
  }

  await client.user.update({
    where: { id: input.userId },
    data: {
      displayName: input.displayName,
      ...(input.email ? { email: input.email } : {}),
      ...(roleRow && input.updateHomeRole !== false ? { roleId: roleRow.id } : {}),
      ...(input.primaryDepartmentId !== undefined
        ? { primaryDepartmentId: input.primaryDepartmentId }
        : {}),
    },
  });

  return { roleChanged, terminated, sessionsRevoked: false };
}
