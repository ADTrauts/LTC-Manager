import "next/dist/server/node-environment-baseline";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { NextRequest } from "next/server";

import { resendHarborProvisionInviteAction } from "@/app/console/(staff)/customers/provision-actions";
import { acceptFacilityAdministratorInvitation, inviteFacilityAdministratorSuccessor, loadFacilityAdministratorSeat } from "@/lib/facility-administrator";
import { prisma } from "@/lib/prisma";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { loadHarborAdministratorActivation } from "./administrator-activation";
import { createHarborSessionToken, HARBOR_SESSION_COOKIE } from "./session";

const databaseUrl = process.env.VERIFY_DATABASE_URL;

function submit(cookie: string, form: FormData) {
  const pathname = "/console/customers/fixture";
  const request = new NextRequest(`http://localhost${pathname}`, { headers: { cookie } });
  const store = createRequestStoreForAPI(request, { pathname }, { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined);
  store.phase = "action";
  const work = { route: pathname, incrementalCache: {} } as WorkStore;
  return workAsyncStorage.run(work, () => workUnitAsyncStorage.run(store, () => resendHarborProvisionInviteAction(null, form)));
}

test("Harbor replacement invitation is explicit and bound to the current Facility Administrator seat", {
  skip: !databaseUrl && "set VERIFY_DATABASE_URL to a disposable migrated database",
}, async (t) => {
  assertDisposableDatabaseUrl(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET ??= "disposable-invite-recovery";
  process.env.POSTMARK_SERVER_TOKEN = "";
  const key = randomUUID();
  async function staff(role: "OWNER" | "MEMBER") {
    const row = await prisma.platformStaff.create({ data: { displayName: role, role, email: `${role}-${key}@example.invalid`, passwordHash: "synthetic" } });
    const token = await createHarborSessionToken({ uid: row.id, email: row.email, name: row.displayName, staffRole: row.role, sessionVersion: row.sessionVersion });
    return `${HARBOR_SESSION_COOKIE}=${token}`;
  }
  try {
    const org = await prisma.organization.create({ data: { name: `Synthetic ${key}` } });
    const [facility, otherFacility] = await Promise.all([
      prisma.facility.create({ data: { organizationId: org.id, displayName: "Synthetic Facility" } }),
      prisma.facility.create({ data: { organizationId: org.id, displayName: "Synthetic Other Facility" } }),
    ]);
    const [owner, member] = await Promise.all([staff("OWNER"), staff("MEMBER")]);
    async function addAccount(label: string, roleKey: "FACILITY_ADMINISTRATOR" | "GM", activated: boolean) {
      const user = await prisma.user.create({ data: {
        email: `${label}-${key}@example.invalid`, displayName: label, facilityId: facility.id,
        ...(activated ? { passwordHash: "synthetic", emailVerifiedAt: new Date() } : {}),
      } });
      await prisma.userFacilityAccess.create({ data: {
        userId: user.id, facilityId: facility.id, rolePeriods: { create: { roleKey, startsAt: new Date(Date.now() - 1000) } },
      } });
      return user;
    }
    const admin = await addAccount("administrator", "FACILITY_ADMINISTRATOR", false);
    const successor = await addAccount("successor", "GM", true);
    const prior = await prisma.accountInviteToken.create({ data: { userId: admin.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    const activation = await loadHarborAdministratorActivation(prisma, facility.id);
    assert(activation.recovery);
    const target = { facilityId: facility.id, ...activation.recovery };
    const form = (overrides: Record<string, string> = {}) => {
      const payload = new FormData();
      for (const [name, value] of Object.entries({ ...target, confirmReplacement: "1", ...overrides })) payload.set(name, value);
      return payload;
    };
    const invites = () => prisma.accountInviteToken.findMany({
      where: { userId: { in: [admin.id, successor.id] } }, orderBy: { id: "asc" }, select: { id: true, usedAt: true, userId: true, expiresAt: true },
    });

    await t.test("a valid invite is shown on revisit; unconfirmed, unrelated, and Member requests cannot rotate it", async () => {
      const before = await invites();
      assert.equal(activation.label, "Account invite valid");
      assert.equal(target.userId, admin.id);
      for (const changed of [
        { confirmReplacement: "" }, { facilityId: otherFacility.id }, { userId: successor.id }, { email: successor.email },
      ]) assert.equal((await submit(owner, form(changed)))?.ok, false);
      await assert.rejects(submit(member, form()), isRedirectError);
      assert.deepEqual(await invites(), before);
    });

    await t.test("only explicit confirmation rotates the account invite, with email disabled", async () => {
      const result = await submit(owner, form());
      assert.deepEqual(result, { ok: true, message: "Replacement invitation issued. Email delivery could not be confirmed." });
      const after = await invites();
      assert.equal(after.length, 2);
      assert(after.find((row) => row.id === prior.id)?.usedAt);
      assert.equal(after.filter((row) => !row.usedAt && row.userId === admin.id).length, 1);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true } })).passwordHash, null);
    });

    await t.test("a replacement waiting on a successor transfer rechecks the seat before minting", async () => {
      const transfer = await inviteFacilityAdministratorSuccessor(prisma, {
        actorUserId: admin.id, facilityId: facility.id, invitedUserId: successor.id, outgoingRoleKey: "GM",
      });
      let transferChanged!: () => void;
      let releaseTransfer!: () => void;
      const changed = new Promise<void>((resolve) => { transferChanged = resolve; });
      const release = new Promise<void>((resolve) => { releaseTransfer = resolve; });
      const pausedDb = {
        $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction(async (tx) => {
          const result = await run(tx);
          transferChanged();
          await release;
          return result;
        }, { timeout: 10000 }),
      } as unknown as PrismaClient;
      const before = await invites();
      const transferResult = acceptFacilityAdministratorInvitation(pausedDb, { actorUserId: successor.id, invitationId: transfer.id });
      await Promise.race([changed, transferResult]);
      const attempt = submit(owner, form());
      try {
        let blocked = false;
        for (let i = 0; i < 100 && !blocked; i++) {
          const [row] = await prisma.$queryRaw<{ found: boolean }[]>`SELECT EXISTS (
            SELECT FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE 'SELECT "id" FROM "Facility" WHERE % FOR UPDATE'
          ) AS found`;
          blocked = row.found;
          if (!blocked) await delay(20);
        }
        assert(blocked, "recovery must wait on the canonical Facility seat lock");
      } finally {
        releaseTransfer();
      }
      await transferResult;
      assert.equal((await attempt)?.ok, false);
      assert.deepEqual(await invites(), before);
      const current = await loadFacilityAdministratorSeat(prisma, facility.id);
      assert(current.kind === "HELD" && current.holder.userId === successor.id);
      const successorStatus = await loadHarborAdministratorActivation(prisma, facility.id);
      assert.equal(successorStatus.label, "Account password set");
      assert.equal(successorStatus.recovery, null);
    });
  } finally {
    await prisma.$disconnect();
  }
});
