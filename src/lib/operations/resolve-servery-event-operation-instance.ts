import type { MealType, PrismaClient } from "@prisma/client";

import { isOperationEngineEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import { hasOperationEnginePrisma } from "./operation-prisma";
import { resolveOperationsCenterDepartmentId } from "./resolve-operations-center-active-operation";
import { ACTIVE_OPERATION_INSTANCE_STATUSES } from "./types";

export type ResolveServeryEventOperationInstanceInput = {
  facilityId: string;
  serviceDate: Date;
  mealType: MealType;
};

export type ResolveServeryEventOperationInstanceDeps = {
  isEngineEnabled?: typeof isOperationEngineEnabled;
  /** Boolean gate only — the result is never used to narrow `client`. */
  hasPrisma?: (client: PrismaClient) => boolean;
  resolveDepartmentId?: typeof resolveOperationsCenterDepartmentId;
  findInstance?: (
    client: PrismaClient,
    input: ResolveServeryEventOperationInstanceInput & { departmentId: string },
  ) => Promise<{ id: string } | null>;
};

async function defaultFindInstance(
  client: PrismaClient,
  input: ResolveServeryEventOperationInstanceInput & { departmentId: string },
): Promise<{ id: string } | null> {
  return client.operationInstance.findFirst({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
      mealType: input.mealType,
      status: { in: ACTIVE_OPERATION_INSTANCE_STATUSES },
    },
    select: { id: true },
    orderBy: [{ status: "desc" }, { label: "asc" }],
  });
}

export async function resolveServeryEventOperationInstanceId(
  input: ResolveServeryEventOperationInstanceInput,
  client: PrismaClient = prisma,
  deps: ResolveServeryEventOperationInstanceDeps = {},
): Promise<string | null> {
  const isEngineEnabled = deps.isEngineEnabled ?? isOperationEngineEnabled;
  if (!isEngineEnabled()) {
    return null;
  }

  const hasPrisma = deps.hasPrisma ?? hasOperationEnginePrisma;
  if (!hasPrisma(client)) {
    return null;
  }

  const resolveDepartmentId = deps.resolveDepartmentId ?? resolveOperationsCenterDepartmentId;
  const findInstance = deps.findInstance ?? defaultFindInstance;
  const departmentId = await resolveDepartmentId(client, input.facilityId);
  const instance = await findInstance(client, { ...input, departmentId });

  return instance?.id ?? null;
}
