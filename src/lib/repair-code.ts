import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export async function nextRepairCode(client: Db): Promise<string> {
  const count = await client.repair.count();
  for (let offset = 1; offset <= 9; offset += 1) {
    const code = `R-${String(count + offset).padStart(5, "0")}`;
    if (!(await client.repair.findFirst({ where: { repairCode: code }, select: { id: true } }))) {
      return code;
    }
  }
  return `R-${randomBytes(12).toString("hex").toUpperCase()}`;
}

function isRepairCodeCollision(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.includes("repairCode") : target === "Repair_repairCode_key";
}

/** Allocate and insert together. Repair codes are globally unique across facilities. */
export async function withRepairCode<T>(
  client: Db,
  create: (tx: Prisma.TransactionClient, code: string) => Promise<T>,
): Promise<T> {
  // The app's lazy Prisma proxy exposes methods through get(), not has().
  const rootClient = client as PrismaClient;
  if (typeof rootClient.$transaction === "function") {
    return rootClient.$transaction((tx) => withRepairCode(tx, create), { maxWait: 10_000, timeout: 20_000 });
  }
  // The lock lives until the caller's transaction commits, including PM transactions.
  await client.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(67208383)`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await client.$executeRawUnsafe("SAVEPOINT ltc_repair_code");
    try {
      // A pre-release instance may still insert without the advisory lock during rollout.
      const code = attempt === 0 ? await nextRepairCode(client) : `R-${randomBytes(12).toString("hex").toUpperCase()}`;
      const result = await create(client, code);
      await client.$executeRawUnsafe("RELEASE SAVEPOINT ltc_repair_code");
      return result;
    } catch (error) {
      await client.$executeRawUnsafe("ROLLBACK TO SAVEPOINT ltc_repair_code");
      await client.$executeRawUnsafe("RELEASE SAVEPOINT ltc_repair_code");
      if (!isRepairCodeCollision(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Could not allocate a Repair code. Try again.");
}
