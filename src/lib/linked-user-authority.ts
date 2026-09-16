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
};

/**
 * Keep the password identity aligned with the Employee identity in the same transaction as the
 * Employee profile update. Session invalidation is part of the User update so authority cannot
 * change while a password session issued under the old role remains current.
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

  const sessionsRevoked = roleChanged || terminated;
  await client.user.update({
    where: { id: input.userId },
    data: {
      displayName: input.displayName,
      ...(input.email ? { email: input.email } : {}),
      ...(roleRow ? { roleId: roleRow.id } : {}),
      ...(terminated ? { isActive: false } : {}),
      ...(sessionsRevoked ? { sessionVersion: { increment: 1 } } : {}),
    },
  });

  return { roleChanged, terminated, sessionsRevoked };
}
