import { Prisma, type PrismaClient } from "@prisma/client";
import { trackEvent } from "@/lib/telemetry";

/** Prisma maps raw locking statements to P2010; only PostgreSQL's explicit
 * serialization/deadlock SQLSTATEs prove rollback. Never infer from messages. */
export function confirmedRollback(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== "PrismaClientKnownRequestError" || !("code" in error)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010" || !("meta" in error) || !error.meta || typeof error.meta !== "object") return false;
  return "code" in error.meta && ["40001", "40P01"].includes(String(error.meta.code));
}

/** Retry only PostgreSQL's positively rolled-back serialization/deadlock result.
 * Each attempt reruns authority, reviewed-intent and receipt checks. Network or
 * unknown COMMIT outcomes must follow receipt reconciliation, never this path.
 * Callbacks must contain database work only; delivery/provider calls stay outside. */
export async function importTransaction<T>(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeout: number; maxWait: number },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        // Small/new Facilities otherwise make PostgreSQL prefer whole-relation
        // scans even for indexed identity/authority keys. Under SSI those scans
        // create false conflicts with independent Facilities. Prefer the indexes
        // for this bounded transaction; LOCAL resets on commit/rollback. This is
        // a plan preference, never an isolation/concurrency/authorization change.
        await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
        return work(tx);
      }, { ...options, isolationLevel: "Serializable" });
    } catch (error) {
      // Prisma extensions/bundles can carry a different constructor instance.
      // The known-request code identifies a rollback; arbitrary errors do not.
      if (!confirmedRollback(error) || attempt >= 4) throw error;
      await trackEvent("onboarding.import.transaction_retry", { attempt: attempt + 1, code: (error as { code: string }).code });
      await new Promise(resolve => setTimeout(resolve, 50 * 3 ** attempt + Math.floor(Math.random() * 100)));
    }
  }
}
