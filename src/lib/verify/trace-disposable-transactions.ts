import { appendFileSync } from "node:fs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "./database-target";

/** Opt-in SQL investigation only. Never enabled by the application. No query
 * parameters/credentials are logged; the disposable guard precedes tracing. */
export function traceDisposableTransactions(db: PrismaClient, label: string): PrismaClient {
  const output = process.env.VERIFY_TRANSACTION_TRACE;
  if (!output) return db;
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  let sequence = 0;
  return new Proxy(db, { get(target, key) {
    if (key === "$transaction") return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { timeout?: number; maxWait?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => {
      const id = `${label}:${process.pid}:${++sequence}`;
      let backend: { pid: number; xid: string } | undefined;
      const write = (event: string, detail = {}) => appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), id, event, ...backend, ...detail }) + "\n");
      try {
        const result = await target.$transaction(async tx => {
          [backend] = await tx.$queryRaw<Array<{pid: number; xid: string}>>`SELECT pg_backend_pid() AS pid, txid_current()::text AS xid`;
          write("begin", { isolation: options?.isolationLevel });
          return work(tx);
        }, options);
        write("committed");
        return result;
      } catch (error) {
        const e = error as { name?: string; code?: string; meta?: unknown; message?: string };
        write("error", { name: e.name, code: e.code, meta: e.meta, message: e.message });
        throw error;
      }
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
