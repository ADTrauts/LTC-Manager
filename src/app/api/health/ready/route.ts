import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type CheckMap = {
  authSecret: boolean;
  database: boolean;
  migrations: boolean;
};

/**
 * Readiness: application can safely serve requests.
 *
 * Returns only boolean dependency signals — never URLs, secrets, migration names,
 * or Facility data. Safe for infrastructure probes; not a diagnostic dump.
 */
export async function GET() {
  const checks: CheckMap = {
    authSecret: Boolean(process.env.AUTH_SECRET?.trim()),
    database: false,
    migrations: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;

    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
    `;
    checks.migrations = Number(rows[0]?.count ?? 0) > 0;
  } catch {
    checks.database = false;
    checks.migrations = false;
  }

  const ready = checks.authSecret && checks.database && checks.migrations;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      check: "ready",
      checks,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
