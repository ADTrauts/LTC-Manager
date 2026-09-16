import assert from "node:assert/strict";
import test from "node:test";

import { EmployeeStatus, RoleKey, type Prisma } from "@prisma/client";

import { syncLinkedUserAuthority } from "./linked-user-authority";

function fakeClient(roleId: string | null = "role-staff") {
  const updates: unknown[] = [];
  const client = {
    role: {
      findFirst: async () => (roleId ? { id: roleId } : null),
    },
    user: {
      update: async (args: unknown) => {
        updates.push(args);
        return { id: "user-1" };
      },
    },
  } as unknown as Pick<Prisma.TransactionClient, "role" | "user">;
  return { client, updates };
}

const baseInput = {
  userId: "user-1",
  currentUserRole: RoleKey.MANAGER,
  nextEmployeeRole: RoleKey.MANAGER,
  previousEmployeeStatus: EmployeeStatus.ACTIVE,
  nextEmployeeStatus: EmployeeStatus.ACTIVE,
  displayName: "Updated Manager",
  email: "manager@example.test",
};

test("employee demotion updates the linked User role and revokes password sessions", async () => {
  const { client, updates } = fakeClient("role-staff");
  const result = await syncLinkedUserAuthority(client, {
    ...baseInput,
    nextEmployeeRole: RoleKey.STAFF,
  });

  assert.deepEqual(result, { roleChanged: true, terminated: false, sessionsRevoked: true });
  assert.deepEqual(updates, [
    {
      where: { id: "user-1" },
      data: {
        displayName: "Updated Manager",
        email: "manager@example.test",
        roleId: "role-staff",
        sessionVersion: { increment: 1 },
      },
    },
  ]);
});

test("employee termination deactivates the linked User and revokes password sessions", async () => {
  const { client, updates } = fakeClient();
  const result = await syncLinkedUserAuthority(client, {
    ...baseInput,
    nextEmployeeStatus: EmployeeStatus.TERMINATED,
  });

  assert.deepEqual(result, { roleChanged: false, terminated: true, sessionsRevoked: true });
  assert.deepEqual(updates, [
    {
      where: { id: "user-1" },
      data: {
        displayName: "Updated Manager",
        email: "manager@example.test",
        isActive: false,
        sessionVersion: { increment: 1 },
      },
    },
  ]);
});

test("non-authority profile edits do not revoke password sessions", async () => {
  const { client, updates } = fakeClient();
  const result = await syncLinkedUserAuthority(client, baseInput);

  assert.deepEqual(result, { roleChanged: false, terminated: false, sessionsRevoked: false });
  assert.deepEqual(updates, [
    {
      where: { id: "user-1" },
      data: {
        displayName: "Updated Manager",
        email: "manager@example.test",
      },
    },
  ]);
});

test("role changes fail before mutation when the destination role is unavailable", async () => {
  const { client, updates } = fakeClient(null);

  await assert.rejects(
    syncLinkedUserAuthority(client, {
      ...baseInput,
      nextEmployeeRole: RoleKey.STAFF,
    }),
    /Role configuration is missing/,
  );
  assert.equal(updates.length, 0);
});
