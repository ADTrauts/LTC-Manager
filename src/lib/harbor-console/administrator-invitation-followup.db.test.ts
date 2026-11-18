import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { loadHarborAdministratorActivation } from "./administrator-activation";
import { loadHarborAdministratorInvitationFollowUp } from "./administrator-invitation-followup";
import { createHarborSessionToken, verifyHarborSessionToken } from "./session";

const target = process.env.VERIFY_DATABASE_URL;

test("Administrator invitation follow-up is Owner-only and paginates the canonical matching set", {
  skip: !target && "set VERIFY_DATABASE_URL to a disposable migrated database",
}, async () => {
  assertDisposableDatabaseUrl(target);
  process.env.AUTH_SECRET ??= "disposable-invitation-queue";
  const db = new PrismaClient({ datasourceUrl: target });
  const key = randomUUID();
  const now = new Date();
  const past = (ms = 10000) => new Date(+now - ms);
  const future = new Date(+now + 60000);

  try {
    const organization = await db.organization.create({ data: { name: `Queue canonical ${key}`, displayName: ` Queue label ${key} ` } });
    async function staff(role: "OWNER" | "MEMBER") {
      const row = await db.platformStaff.create({ data: { role, displayName: role, email: `${role}-${key}@example.invalid`, passwordHash: "synthetic" } });
      return verifyHarborSessionToken(await createHarborSessionToken({ uid: row.id, name: row.displayName, email: row.email, staffRole: role, sessionVersion: row.sessionVersion }));
    }
    const [owner, member] = await Promise.all([staff("OWNER"), staff("MEMBER")]);
    async function fixture(label: string, state?: "inactive" | "revoked" | "terminated" | "former" | "future" | "password" | "inactive-access") {
      const facility = await db.facility.create({ data: { organizationId: organization.id, displayName: `000000 Queue ${key} ${label}` } });
      const user = await db.user.create({ data: {
        facilityId: facility.id, email: `${label}-${key}@example.invalid`, displayName: "Synthetic holder",
        isActive: state !== "inactive", passwordHash: state === "password" ? "synthetic" : null,
      } });
      await db.userFacilityAccess.create({ data: {
        userId: user.id, facilityId: facility.id,
        isActive: state !== "inactive-access", revokedAt: state === "revoked" ? past() : null,
        rolePeriods: { create: { roleKey: "FACILITY_ADMINISTRATOR", startsAt: state === "future" ? future : past(), endsAt: state === "former" ? past(100) : null } },
      } });
      if (state === "terminated") {
        await db.employee.create({ data: { facilityId: facility.id, userId: user.id, firstName: "Former", lastName: "Staff", roleType: "FACILITY_ADMINISTRATOR", status: "TERMINATED", employmentType: "FULL_TIME" } });
      }
      return { facility, user };
    }
    const [missing, used, expired, valid] = await Promise.all([fixture("missing"), fixture("used"), fixture("expired"), fixture("valid")]);
    const openSeat = await fixture("open-seat", "future");
    const excluded = await Promise.all((["inactive", "revoked", "terminated", "former", "password", "inactive-access"] as const).map((state) => fixture(state, state)));
    await db.employee.create({ data: { facilityId: valid.facility.id, userId: missing.user.id, firstName: "Former", lastName: "Staff", roleType: "GM", status: "TERMINATED", employmentType: "FULL_TIME" } });
    const token = (userId: string, expiresAt: Date, usedAt: Date | null = null) => ({ userId, tokenHash: randomUUID(), expiresAt, usedAt });
    await db.accountInviteToken.createMany({ data: [
      token(used.user.id, future, now), token(expired.user.id, past()), token(expired.user.id, now),
      token(valid.user.id, past()), token(valid.user.id, future),
    ] });

    const bulk = Array.from({ length: 205 }, (_, i) => ({ id: randomUUID(), organizationId: organization.id, displayName: `ZZ queue ${key} ${String(i).padStart(3, "0")}` }));
    const access = bulk.map(({ id }) => ({ id: randomUUID(), userId: missing.user.id, facilityId: id }));
    await db.facility.createMany({ data: bulk });
    await db.userFacilityAccess.createMany({ data: access });
    await db.userFacilityRolePeriod.createMany({ data: access.map(({ id }) => ({ userFacilityAccessId: id, startsAt: past(), roleKey: "FACILITY_ADMINISTRATOR" })) });

    assert.equal(await loadHarborAdministratorInvitationFollowUp(db, null), null);
    assert.equal(await loadHarborAdministratorInvitationFollowUp(db, member), null);
    const first = await loadHarborAdministratorInvitationFollowUp(db, owner, ["2", "9"], now);
    assert(first);
    assert.equal(first.page, 1);
    assert.equal(first.rows.length, 25);
    assert.ok(first.total >= 209, "The full matching count must include the bulk and the four positive cases");
    for (const [fixture, state, label] of [
      [missing, "missing", "No unused account invite"], [used, "missing", "No unused account invite"],
      [expired, "expired", "Account invite expired"],
      // The canonical seat reader treats an eligible open period as held. The recovery action may still disallow sending.
      [openSeat, "missing", "No unused account invite"],
    ] as const) {
      assert.deepEqual(first.rows.find((row) => row.facilityId === fixture.facility.id), {
        facilityId: fixture.facility.id, facilityName: fixture.facility.displayName, organizationLabel: `Queue label ${key}`, invitationState: state,
      });
      assert.equal((await loadHarborAdministratorActivation(db, fixture.facility.id, now)).label, label);
    }
    const forbidden = new Set([valid, ...excluded].map((fixture) => fixture.facility.id));
    assert.equal(first.rows.some((row) => forbidden.has(row.facilityId)), false);
    const beyond200 = await loadHarborAdministratorInvitationFollowUp(db, owner, "9", now);
    assert(beyond200 && beyond200.offset === 200 && beyond200.rows.length > 0);
    const last = await loadHarborAdministratorInvitationFollowUp(db, owner, "999999", now);
    assert(last && last.page === last.pageCount && last.rows.length > 0 && last.rows.length <= 25);

    await db.platformStaff.update({ where: { id: owner.uid }, data: { sessionVersion: { increment: 1 } } });
    assert.equal(await loadHarborAdministratorInvitationFollowUp(db, owner), null);
  } finally {
    await db.$disconnect();
  }
});
