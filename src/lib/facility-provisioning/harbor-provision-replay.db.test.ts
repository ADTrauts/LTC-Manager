import "next/dist/server/node-environment-baseline";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { NextRequest } from "next/server";

import { provisionFacilityAction, recoverHarborProvisionAction } from "@/app/console/(staff)/customers/provision-actions";
import { createHarborSessionToken, HARBOR_SESSION_COOKIE } from "@/lib/harbor-console/session";
import { prisma } from "@/lib/prisma";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

const databaseUrl = process.env.VERIFY_DATABASE_URL;

function runAction<T>(cookie: string, action: () => Promise<T>): Promise<T> {
  const pathname = "/console/customers/new";
  const request = new NextRequest(`http://localhost${pathname}`, { headers: { cookie } });
  const store = createRequestStoreForAPI(request, { pathname }, { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined);
  store.phase = "action";
  const work = { route: pathname, incrementalCache: {} } as WorkStore;
  return workAsyncStorage.run(work, () => workUnitAsyncStorage.run(store, action));
}

test("the Harbor server action replays a committed request once without another invitation", {
  skip: !databaseUrl && "set VERIFY_DATABASE_URL to a disposable migrated database",
}, async (t) => {
  assertDisposableDatabaseUrl(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET ??= "local-disposable-harbor-provision-replay";
  process.env.POSTMARK_SERVER_TOKEN = "";
  const marker = randomUUID();
  const requestKey = randomUUID();
  const organizationName = `Replay Organization ${marker}`;
  const facilityName = `Replay Facility ${marker}`;
  const administratorEmail = `administrator-${marker}@example.invalid`;
  const form = (overrides: Record<string, string> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      requestKey, organizationMode: "create", organizationName, organizationType: "OTHER", facilityDisplayName: facilityName,
      timezone: "America/New_York", billingEmail: `billing-${marker}@example.invalid`,
      administratorName: "Synthetic Administrator", administratorEmail, confirmOwnership: "1", ...overrides,
    })) data.set(key, value);
    return data;
  };
  async function staff(label: string) {
    const row = await prisma.platformStaff.create({ data: { email: `${label}-${marker}@example.invalid`, displayName: label, passwordHash: "synthetic", role: "OWNER" } });
    const token = await createHarborSessionToken({ uid: row.id, email: row.email, name: label, staffRole: row.role, sessionVersion: row.sessionVersion });
    return `${HARBOR_SESSION_COOKIE}=${token}`;
  }

  try {
    await prisma.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, update: {}, create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" } });
    const [ownerCookie, otherCookie] = await Promise.all([staff("first-owner"), staff("second-owner")]);
    const submit = (data: FormData, cookie = ownerCookie) => runAction(cookie, () => provisionFacilityAction(null, data));
    const recover = (cookie = ownerCookie) => runAction(cookie, () => recoverHarborProvisionAction(requestKey));

    await t.test("concurrent and lost-response replays return the original result after creating a new Administrator", async () => {
      const results = await Promise.all([submit(form()), submit(form())]);
      const [first] = results.filter((result) => result?.nextPath?.includes("invite=failed"));
      const [duplicate] = results.filter((result) => result?.nextPath?.includes("requestRecovered=1"));
      assert(first?.ok && duplicate?.ok);

      const receipt = await prisma.harborFacilityProvisionReceipt.findUniqueOrThrow({ where: { requestKey } });
      const canonical = `/console/customers/${receipt.facilityId}`;
      assert.equal(first.nextPath?.split("?")[0], canonical);
      assert.equal(duplicate.nextPath?.split("?")[0], canonical);
      assert.equal((await submit(form()))?.nextPath, duplicate.nextPath);
      assert.equal((await recover())?.nextPath, duplicate.nextPath);
      assert.equal(await prisma.organization.count({ where: { name: organizationName } }), 1);
      assert.equal(await prisma.facility.count({ where: { displayName: facilityName, organizationId: receipt.organizationId } }), 1);
      assert.equal(await prisma.user.count({ where: { id: receipt.administratorId, email: administratorEmail } }), 1);
      assert.equal(await prisma.userFacilityAccess.count({ where: { userId: receipt.administratorId, facilityId: receipt.facilityId } }), 1);
      assert.equal(await prisma.accountInviteToken.count({ where: { userId: receipt.administratorId } }), 1);
      assert.equal(await prisma.harborAuditEvent.count({ where: { facilityId: receipt.facilityId, action: "PROVISION_FACILITY" } }), 1);
    });

    await t.test("changed values and another Owner cannot reuse the request", async () => {
      for (const change of [
        { facilityDisplayName: "Changed Facility" }, { organizationName: "Changed Organization" },
        { administratorEmail: `changed-${marker}@example.invalid` }, { confirmOwnership: "0" },
      ]) {
        assert.equal((await submit(form(change)))?.code, "PROVISION_REQUEST_CONFLICT");
      }
      assert.equal((await submit(form(), otherCookie))?.code, "PROVISION_REQUEST_CONFLICT");
      assert.equal((await recover(otherCookie))?.ok, false);
    });

    await t.test("a first submission must confirm the current existing Administrator by ID", async () => {
      const newKey = randomUUID();
      const facility = `Second Facility ${marker}`;
      const setup = { requestKey: newKey, organizationName: `Second Org ${marker}`, facilityDisplayName: facility };
      const original = await prisma.user.findUniqueOrThrow({ where: { email: administratorEmail } });
      assert.equal((await submit(form(setup)))?.code, "ADMINISTRATOR_REVIEW_REQUIRED");
      assert.equal((await submit(form({ ...setup, confirmedAdministratorId: randomUUID() })))?.code, "ADMINISTRATOR_REVIEW_REQUIRED");
      assert.equal(await prisma.facility.count({ where: { displayName: facility } }), 0);
      assert.equal(await prisma.harborFacilityProvisionReceipt.count({ where: { requestKey: newKey } }), 0);
      const result = await submit(form({ ...setup, confirmedAdministratorId: original.id }));
      assert(result?.ok);
      const second = await prisma.harborFacilityProvisionReceipt.findUniqueOrThrow({ where: { requestKey: newKey } });
      assert.equal(second.administratorId, original.id);
      assert.equal(await prisma.accountInviteToken.count({ where: { userId: original.id } }), 1);
    });
  } finally {
    await prisma.$disconnect();
  }
});
