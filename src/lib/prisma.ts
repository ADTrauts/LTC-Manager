import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaClientEpoch?: string;
};

let prismaSingleton: PrismaClient | undefined;

/** Bump when schema relations must force a fresh client after `prisma generate`. */
const PRISMA_CLIENT_EPOCH = "canonical-logs-catalog-v1";

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function missingRequiredDelegates(client: PrismaClient): string[] {
  const c = client as unknown as Record<string, { findMany?: unknown } | undefined>;
  const required = [
    "departmentOperationalCycle",
    "operationalCycleDayExpectation",
    "departmentOperationalCycleMilestoneTime",
    "departmentTeam",
    "departmentTeamRoomMembership",
    "employeeTeamMembership",
    "departmentJobRole",
    "employeeDepartmentJobRole",
    "facilityOrganization",
    "catalogLogDefinition",
    "catalogLogField",
    "logAttachment",
  ] as const;
  return required.filter((key) => typeof c[key]?.findMany !== "function");
}

function employeeModelMissingJobRoles(client: PrismaClient): boolean {
  const runtime = client as unknown as {
    _runtimeDataModel?: { models?: Record<string, { fields?: Array<{ name: string }> }> };
  };
  const employeeFields = runtime._runtimeDataModel?.models?.Employee?.fields;
  if (!Array.isArray(employeeFields)) return false;
  const names = new Set(employeeFields.map((f) => f.name));
  return !names.has("departmentJobRoles") || !names.has("teamMemberships");
}

/** True when this client instance cannot serve the current schema. */
function isStructurallyStale(client: PrismaClient): boolean {
  return missingRequiredDelegates(client).length > 0 || employeeModelMissingJobRoles(client);
}

function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma ?? prismaSingleton;
  const epochMismatch = globalForPrisma.prismaClientEpoch !== PRISMA_CLIENT_EPOCH;

  if (existing && !epochMismatch && !isStructurallyStale(existing)) {
    return existing;
  }

  const client = createPrismaClient();
  if (isStructurallyStale(client)) {
    // Stale PrismaClient constructor still loaded in this Node process
    // (dev server started before `prisma generate`).
    const missing = missingRequiredDelegates(client);
    throw new Error(
      `Prisma Client is stale in this Next.js process (missing: ${missing.join(", ") || "Employee.departmentJobRoles"}). ` +
        `Stop the dev server, run \`pnpm exec prisma generate\`, then start \`pnpm dev\` again.`,
    );
  }

  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }
  prismaSingleton = client;
  // Next production builds can evaluate this wrapper from multiple server
  // chunks. Keep the client on globalThis in every environment so those
  // module instances share one connection pool instead of exhausting
  // Postgres with a pool per chunk.
  globalForPrisma.prisma = client;
  globalForPrisma.prismaClientEpoch = PRISMA_CLIENT_EPOCH;
  return client;
}

/**
 * Reuse one PrismaClient per Node process. Required in Next.js dev: without this,
 * Turbopack/HMR reloads leak connections until Postgres refuses new clients.
 * After `prisma generate` or schema changes, restart the Next.js dev server if
 * delegates are still missing (see AGENTS.md). Prefer this proxy refresh first.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
