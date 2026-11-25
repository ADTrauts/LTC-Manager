import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { consumeEmailVerificationToken, hashEmailVerificationToken, issueEmailVerificationToken } from "./tokens";

const databaseUrl = process.env.VERIFY_DATABASE_URL;

test("verification claims one live link exactly once and preserves an inactive or expired account", {
  skip: databaseUrl ? false : "requires a disposable PostgreSQL database",
}, async () => {
  assertDisposableDatabaseUrl(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const userId = randomUUID();
  try {
    await db.user.create({
      data: { id: userId, displayName: "Verification test", email: `${userId}@example.invalid`, isActive: false },
    });
    const link = await issueEmailVerificationToken(db, userId);
    assert.equal(await consumeEmailVerificationToken(db, link.rawToken), null);
    const token = { tokenHash: hashEmailVerificationToken(link.rawToken) };
    assert.equal((await db.emailVerificationToken.findUniqueOrThrow({ where: token })).usedAt, null);

    await db.user.update({ where: { id: userId }, data: { isActive: true } });
    await db.emailVerificationToken.update({ where: token, data: { expiresAt: new Date(0) } });
    assert.equal(await consumeEmailVerificationToken(db, link.rawToken), null);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt, null);

    const fresh = await issueEmailVerificationToken(db, userId);
    const results = await Promise.all([
      consumeEmailVerificationToken(db, fresh.rawToken),
      consumeEmailVerificationToken(db, fresh.rawToken),
    ]);
    assert.equal(results.filter((id) => id === userId).length, 1);
    assert.equal(results.filter((id) => id === null).length, 1);
    const verified = await db.user.findUniqueOrThrow({ where: { id: userId } });
    assert.ok(verified.emailVerifiedAt);
    const consumed = await db.emailVerificationToken.findUniqueOrThrow({
      where: { tokenHash: hashEmailVerificationToken(fresh.rawToken) },
    });
    assert.deepEqual(consumed.usedAt, verified.emailVerifiedAt);
  } finally {
    try {
      await db.user.deleteMany({ where: { id: userId } });
    } finally {
      await db.$disconnect();
    }
  }
});
