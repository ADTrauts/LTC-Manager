import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * In production we reuse one client on the global object (connection pooling).
 * In development we must NOT cache on `global`: after `prisma generate`, a cached
 * instance would still validate queries against the old schema until process restart.
 */
export const prisma =
  process.env.NODE_ENV === "production"
    ? (global.prisma ?? createPrismaClient())
    : createPrismaClient();

if (process.env.NODE_ENV === "production") {
  global.prisma = prisma;
}
