import type { PrismaClient } from "@prisma/client";

type OperationEnginePrisma = Pick<PrismaClient, "operationDefinition" | "operationInstance">;

/** True when the running Prisma client includes Wave 5 operation engine delegates. */
export function hasOperationEnginePrisma(
  prisma: PrismaClient,
): prisma is PrismaClient & OperationEnginePrisma {
  const candidate = prisma as PrismaClient & {
    operationDefinition?: unknown;
    operationInstance?: unknown;
  };

  return candidate.operationDefinition != null && candidate.operationInstance != null;
}
