import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { importTransaction } from "./transaction";
const conflict = () => new Prisma.PrismaClientKnownRequestError("serialization rollback", { code: "P2034", clientVersion: "test" });
const options = { timeout: 1000, maxWait: 1000 };

test("known rollback retries rerun current checks and commit once", async () => {
  let attempts = 0, checks = 0, commits = 0;
  const db = { $transaction: async (work: (tx: unknown) => Promise<string>) => {
    attempts++;
    const result = await work({ $executeRaw: async () => 0 });
    if (attempts < 3) throw conflict();
    commits++; return result;
  } } as unknown as PrismaClient;
  assert.equal(await importTransaction(db, async () => { checks++; return "committed receipt"; }, options), "committed receipt");
  assert.equal(attempts, 3); assert.equal(checks, 3); assert.equal(commits, 1);
});
test("authority revoked after a rolled-back attempt prevents replayed writes", async () => {
  let authorized = true, attempts = 0;
  const db = { $transaction: async (work: (tx: unknown) => Promise<void>) => {
    attempts++; await work({ $executeRaw: async () => 0 }); authorized = false; throw conflict();
  } } as unknown as PrismaClient;
  await assert.rejects(() => importTransaction(db, async () => { if (!authorized) throw Error("authority revoked"); }, options), /authority revoked/);
  assert.equal(attempts, 2);
});
test("unknown COMMIT and non-serialization errors never retry automatically", async () => {
  for (const error of [Error("lost COMMIT response"), new Prisma.PrismaClientKnownRequestError("network", { code: "P1001", clientVersion: "test" })]) {
    let attempts = 0;
    const db = { $transaction: async () => { attempts++; throw error; } } as unknown as PrismaClient;
    await assert.rejects(() => importTransaction(db, async () => "never", options), e => e === error);
    assert.equal(attempts, 1);
  }
});
test("persistent contention stays bounded and remains a reported failure", async () => {
  let attempts = 0;
  const db = { $transaction: async () => { attempts++; throw conflict(); } } as unknown as PrismaClient;
  await assert.rejects(() => importTransaction(db, async () => "never", options), e => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034");
  assert.equal(attempts, 5);
});


test("raw lock serialization/deadlock rollbacks use the same bounded current-check retry", async () => {
  for (const sqlState of ["40001", "40P01"]) {
    let attempts = 0, checks = 0;
    const db = { $transaction: async (work: (tx: unknown) => Promise<string>) => {
      attempts++; const value = await work({ $executeRaw: async () => 0 });
      if (attempts === 1) throw new Prisma.PrismaClientKnownRequestError("raw rollback", { code: "P2010", clientVersion: "test", meta: { code: sqlState } });
      return value;
    } } as unknown as PrismaClient;
    assert.equal(await importTransaction(db, async () => { checks++; return "one receipt"; }, options), "one receipt");
    assert.equal(attempts, 2); assert.equal(checks, 2);
  }
});
test("other raw-query failures and untrusted SQLSTATE messages cannot trigger replay", async () => {
  for (const meta of [{ code: "57014" }, { code: "08006" }, { message: "40001" }, undefined]) {
    let attempts = 0;
    const error = new Prisma.PrismaClientKnownRequestError("raw query failed", { code: "P2010", clientVersion: "test", meta });
    const db = { $transaction: async () => { attempts++; throw error; } } as unknown as PrismaClient;
    await assert.rejects(() => importTransaction(db, async () => "never", options), e => e === error);
    assert.equal(attempts, 1);
  }
});


test("persistent raw-lock rollback still stops at five attempts", async () => {
  let attempts = 0;
  const error = new Prisma.PrismaClientKnownRequestError("raw serialization", { code: "P2010", clientVersion: "test", meta: { code: "40001" } });
  const db = { $transaction: async () => { attempts++; throw error; } } as unknown as PrismaClient;
  await assert.rejects(() => importTransaction(db, async () => "never", options), e => e === error);
  assert.equal(attempts, 5);
});
