import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Reuse one PrismaClient per Node process. Required in Next.js dev: without this,
 * Turbopack/HMR reloads leak connections until Postgres refuses new clients.
 * After `prisma generate` or schema changes, restart the dev server (see AGENTS.md).
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
