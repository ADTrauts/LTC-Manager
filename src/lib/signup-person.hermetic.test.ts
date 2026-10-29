import assert from "node:assert/strict";
import test from "node:test";

import { resolveSignupPerson, type ExistingSignupPerson } from "./signup-person";

const ABSENT = "absent-hash";
const NOW = new Date("2026-10-26T12:00:00.000Z");
const VERIFIED = new Date("2026-10-01T12:00:00.000Z");

function harness(existing: ExistingSignupPerson | null, matches: boolean) {
  const calls: string[] = [];
  return {
    calls,
    run: (mailConfigured: boolean) =>
      resolveSignupPerson({
        password: "correct-horse",
        mailConfigured,
        now: NOW,
        existing,
        absentAccountHash: ABSENT,
        comparePassword: async (_password, hash) => {
          calls.push(`compare:${hash}`);
          return hash !== ABSENT && matches;
        },
        hashPassword: async () => {
          calls.push("hash");
          return "new-hash";
        },
      }),
  };
}

test("a new email creates a User and does not skip the absent-account compare", async () => {
  const { calls, run } = harness(null, false);
  const result = await run(true);
  assert.deepEqual(result, {
    outcome: "create",
    passwordHash: "new-hash",
    emailVerifiedAt: null,
  });
  assert.deepEqual(calls, [`compare:${ABSENT}`, "hash"]);
});

test("local signup without mail marks the new User verified", async () => {
  const result = await harness(null, false).run(false);
  assert.equal(result.outcome, "create");
  if (result.outcome === "create") {
    assert.equal(result.emailVerifiedAt, NOW);
  }
});

test("the right password reuses the person and keeps their verification", async () => {
  const { calls, run } = harness(
    {
      id: "user_1",
      passwordHash: "stored-hash",
      isActive: true,
      emailVerifiedAt: VERIFIED,
    },
    true,
  );
  const result = await run(true);
  assert.deepEqual(result, {
    outcome: "reuse",
    userId: "user_1",
    emailVerifiedAt: VERIFIED,
  });
  assert.deepEqual(calls, ["compare:stored-hash"]);
});

test("the wrong password rejects an existing person", async () => {
  const { calls, run } = harness(
    {
      id: "user_1",
      passwordHash: "stored-hash",
      isActive: true,
      emailVerifiedAt: VERIFIED,
    },
    false,
  );
  const result = await run(true);
  assert.deepEqual(result, { outcome: "reject" });
  assert.deepEqual(calls, ["compare:stored-hash"]);
});

test("an inactive person is rejected even when the password matches", async () => {
  const { calls, run } = harness(
    {
      id: "user_1",
      passwordHash: "stored-hash",
      isActive: false,
      emailVerifiedAt: VERIFIED,
    },
    true,
  );
  const result = await run(true);
  assert.deepEqual(result, { outcome: "reject" });
  assert.deepEqual(calls, ["compare:stored-hash"]);
});

test("a person with no password is rejected without a second User", async () => {
  const { calls, run } = harness(
    {
      id: "user_1",
      passwordHash: null,
      isActive: true,
      emailVerifiedAt: null,
    },
    true,
  );
  const result = await run(true);
  assert.deepEqual(result, { outcome: "reject" });
  assert.deepEqual(calls, [`compare:${ABSENT}`]);
});
