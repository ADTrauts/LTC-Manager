import "next/dist/server/node-environment-baseline";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { SignJWT } from "jose";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { NextRequest } from "next/server";
import { POST as logout } from "@/app/api/console/auth/logout/route";

import {
  createHarborCatalogAction,
  publishHarborCatalogAction,
  saveAndPublishHarborCatalogAction,
  saveHarborCatalogDraftAction,
} from "@/app/console/(staff)/catalog/actions";
import { createSessionToken, getSession, SESSION_COOKIE } from "@/lib/auth";
import {
  createCatalogDefinition,
  createCatalogDraftSuccessor,
  HARBOR_CATALOG_WRITE,
  type CatalogDefinitionInput,
} from "@/lib/canonical-logs/catalog-service";
import { prisma } from "@/lib/prisma";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { resolveHarborSession } from "./auth";
import { readHarborLogin } from "./login-receipt";
import { createHarborSessionToken, HARBOR_SESSION_COOKIE, HARBOR_TOKEN_USE, type HarborStaffRole } from "./session";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
const prefix = `phase1a_${randomUUID().replaceAll("-", "")}`;
const mailDomain = "@catalog-publication.example.invalid";
const skip = !databaseUrl && "set VERIFY_DATABASE_URL to a disposable migrated database";

function runAction<T>(cookie: string, action: () => Promise<T>): Promise<T> {
  const pathname = "/console/catalog";
  const request = new NextRequest(`http://localhost${pathname}`, { headers: { cookie } });
  const store = createRequestStoreForAPI(
    request, { pathname }, { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined,
  );
  store.phase = "action";
  // The actions enqueue path revalidation; this direct invocation does not serve cached responses.
  const work = { route: pathname, incrementalCache: {} } as WorkStore;
  return workAsyncStorage.run(work, () => workUnitAsyncStorage.run(store, action));
}

async function createStaff(label: string, role: HarborStaffRole) {
  const staff = await prisma.platformStaff.create({
    data: {
      email: `${prefix}-${label}${mailDomain}`,
      displayName: label,
      passwordHash: "unused-in-action-test",
      role,
    },
  });
  const token = await createHarborSessionToken({
    uid: staff.id, email: staff.email, name: staff.displayName, staffRole: role, sessionVersion: staff.sessionVersion,
  });
  return { id: staff.id, token, cookie: `${HARBOR_SESSION_COOKIE}=${token}` };
}

function input(suffix: string): CatalogDefinitionInput {
  return {
    name: `${prefix}_${suffix}`,
    purposeType: "LOG",
    category: "OTHER",
    fields: [{ fieldKey: "result", label: "Result", fieldType: "YES_NO" }],
  };
}

function form(draft: { id: string; stableKey: string }, withFields = true) {
  const data = new FormData();
  data.set("definitionId", draft.id);
  data.set("stableKey", draft.stableKey);
  data.set("name", "Edited record");
  data.set("description", "Edited description");
  data.set("instructions", "Edited instructions");
  data.set("fieldsJson", withFields ? JSON.stringify([{ fieldKey: "edited", label: "Edited field", fieldType: "YES_NO" }]) : "[]");
  return data;
}

const publishActions = [publishHarborCatalogAction, saveAndPublishHarborCatalogAction];

function snapshot(id: string) {
  return prisma.catalogLogDefinition.findUniqueOrThrow({
    where: { id },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
}

test("Harbor publication actions enforce live authority and preserve Catalog data", { skip }, async (t) => {
  assertDisposableDatabaseUrl(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET ??= "harbor-catalog-publication-direct-action-test";

  // These fixtures are scoped to this suite, including on shared disposable CI PostgreSQL.
  t.after(async () => {
    try {
      await prisma.facilityCatalogInstall.deleteMany({ where: { catalogStableKey: { startsWith: prefix } } });
      await prisma.catalogLogDefinition.deleteMany({ where: { stableKey: { startsWith: prefix } } });
      await prisma.user.deleteMany({ where: { email: `${prefix}-customer${mailDomain}` } });
      await prisma.facility.deleteMany({ where: { displayName: prefix } });
      await prisma.organization.deleteMany({ where: { name: prefix } });
      await prisma.platformStaff.deleteMany({ where: { email: { startsWith: prefix, endsWith: mailDomain } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  const owner = await createStaff("Owner", "OWNER");
  const member = await createStaff("Member", "MEMBER");
  const org = await prisma.organization.create({ data: { name: prefix } });
  const facility = await prisma.facility.create({
    data: { organizationId: org.id, displayName: prefix, timezone: "America/New_York" },
  });

  await t.test("MEMBER creates and saves drafts, and neither publication action changes draft data", async () => {
    const name = input("member").name;
    const create = form({ id: "", stableKey: "" });
    create.set("name", name);
    await assert.rejects(() => runAction(member.cookie, () => createHarborCatalogAction(create)), (error) =>
      isRedirectError(error) && getURLFromRedirectError(error) === `/console/catalog/${name}`,
    );
    const draft = await prisma.catalogLogDefinition.findUniqueOrThrow({ where: { stableKey_version: { stableKey: name, version: 1 } } });
    assert.deepEqual(await runAction(member.cookie, () => saveHarborCatalogDraftAction(form(draft))), { ok: true });
    const saved = await snapshot(draft.id);
    assert.equal(saved.name, "Edited record");
    assert.equal(saved.fields[0]?.fieldKey, "edited");

    for (const action of publishActions) {
      const changes = form(draft, false);
      changes.set("name", "Forbidden edit");
      assert.deepEqual(await runAction(member.cookie, () => action(changes)), {
        ok: false, error: "Only a Harbor OWNER can publish Catalog Records.",
      });
      assert.deepEqual(await snapshot(draft.id), saved);
    }
    assert.equal(await prisma.harborAuditEvent.count({ where: { staffId: member.id, action: "CATALOG_PUBLISH" } }), 0);
  });

  await t.test("missing, customer, invalid, inactive, revoked and changed-role sessions cannot publish", async () => {
    const draft = await createCatalogDefinition(prisma, input("identity"), HARBOR_CATALOG_WRITE);
    const before = await snapshot(draft.id);
    const inactive = await createStaff("Inactive", "OWNER");
    const revoked = await createStaff("Revoked", "OWNER");
    const demoted = await createStaff("Demoted", "OWNER");
    const deleted = await createStaff("Deleted", "OWNER");
    await prisma.platformStaff.update({ where: { id: inactive.id }, data: { isActive: false } });
    await prisma.platformStaff.update({ where: { id: revoked.id }, data: { sessionVersion: { increment: 1 } } });
    await prisma.platformStaff.update({ where: { id: demoted.id }, data: { role: "MEMBER" } });
    await prisma.platformStaff.delete({ where: { id: deleted.id } });
    const customer = await prisma.user.create({
      data: {
        email: `${prefix}-customer${mailDomain}`, displayName: "Facility Administrator",
        facilityId: facility.id, emailVerifiedAt: new Date(),
      },
    });
    await prisma.userFacilityAccess.create({
      data: {
        userId: customer.id, facilityId: facility.id,
        rolePeriods: { create: { roleKey: "FACILITY_ADMINISTRATOR", startsAt: new Date() } },
      },
    });
    const customerToken = await createSessionToken({
      uid: customer.id, name: customer.displayName, email: customer.email,
      role: "FACILITY_ADMINISTRATOR", facilityId: facility.id, sessionVersion: customer.sessionVersion,
    });
    const customerCookie = `${SESSION_COOKIE}=${customerToken}`;
    assert.equal((await runAction(customerCookie, getSession))?.uid, customer.id);
    for (const cookie of [
      "", customerCookie, `${HARBOR_SESSION_COOKIE}=invalid`,
      inactive.cookie, revoked.cookie, demoted.cookie, deleted.cookie,
    ]) {
      for (const action of publishActions) {
        await assert.rejects(() => runAction(cookie, () => action(form(draft))), (error) =>
          isRedirectError(error) && getURLFromRedirectError(error) === "/console/login",
        );
        assert.deepEqual(await snapshot(draft.id), before);
      }
    }
  });

  await t.test("OWNER publishes and combines save and publish while preserving history and installs", async () => {
    const draft = await createCatalogDefinition(prisma, input("versions"), HARBOR_CATALOG_WRITE);
    const direct = form(draft);
    direct.set("stableKey", "untrusted-form-key");
    // A concurrent request for the same immutable version is an idempotent repeat.
    assert.deepEqual(await Promise.all([
      runAction(owner.cookie, () => publishHarborCatalogAction(direct)),
      runAction(owner.cookie, () => publishHarborCatalogAction(form(draft))),
    ]), [{ ok: true }, { ok: true }]);
    const published = await snapshot(draft.id);
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.fields[0]?.fieldKey, "result");
    const install = await prisma.facilityCatalogInstall.create({
      data: { facilityId: facility.id, catalogDefinitionId: draft.id, catalogStableKey: draft.stableKey, catalogVersion: draft.version },
    });
    const successor = await createCatalogDraftSuccessor(prisma, published.id, HARBOR_CATALOG_WRITE);
    assert.deepEqual(await runAction(owner.cookie, () => saveAndPublishHarborCatalogAction(form(successor))), { ok: true });
    const versionTwo = await snapshot(successor.id);
    assert.equal(versionTwo.version, 2);
    assert.equal(versionTwo.status, "PUBLISHED");
    assert.equal(versionTwo.fields[0]?.fieldKey, "edited");
    assert.deepEqual(await snapshot(published.id), published);
    assert.deepEqual(await prisma.facilityCatalogInstall.findUniqueOrThrow({ where: { id: install.id } }), install);
    const events = await prisma.harborAuditEvent.findMany({
      where: { staffId: owner.id, action: "CATALOG_PUBLISH" },
      select: { staffId: true, catalogPublication: { select: { definitionId: true, stableKey: true, version: true } } },
    });
    assert.deepEqual(events.sort((a, b) => (a.catalogPublication?.version ?? 0) - (b.catalogPublication?.version ?? 0)),
      [published, versionTwo].map(({ id, stableKey, version }) => ({
        staffId: owner.id, catalogPublication: { definitionId: id, stableKey, version },
      })));
  });

  await t.test("a legacy publication event retains unknown attribution", async () => {
    const legacyStaff = await createStaff("Legacy", "OWNER");
    const legacy = await prisma.harborAuditEvent.create({ data: { staffId: legacyStaff.id, action: "CATALOG_PUBLISH" } });
    const record = await prisma.harborAuditEvent.findUniqueOrThrow({
      where: { id: legacy.id }, include: { catalogPublication: true },
    });
    assert.equal(record.catalogPublication, null);
  });

  await t.test("logout invalidates one signed login and the receipt outlives staff and audit rows", async () => {
    const first = await createStaff("logout", "OWNER");
    const claim = await resolveHarborSession(first.token);
    assert.ok(claim);
    const second = await createHarborSessionToken({
      uid: claim.uid, email: claim.email, name: claim.name, staffRole: claim.staffRole, sessionVersion: claim.sessionVersion,
    });
    const old = await new SignJWT({
      uid: claim.uid, email: claim.email, name: claim.name, staffRole: claim.staffRole,
      sessionVersion: claim.sessionVersion, tokenUse: HARBOR_TOKEN_USE,
    }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    assert.equal(await resolveHarborSession(old), null);

    const signOut = () => logout(new NextRequest("https://console.example.invalid/api/console/auth/logout", {
      method: "POST", headers: { cookie: first.cookie, origin: "https://console.example.invalid" },
    }));
    const login = await readHarborLogin(first.token);
    assert.ok(login && !login.assistance);
    const draft = await createCatalogDefinition(prisma, input("logout"), HARBOR_CATALOG_WRITE);
    // Hold the same staff lock as logout while publication passes its initial session check.
    const lock = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PlatformStaff" WHERE "id" = ${first.id} FOR NO KEY UPDATE`;
      const publication = runAction(first.cookie, () => publishHarborCatalogAction(form(draft)));
      for (let attempt = 0; attempt < 80; attempt++) {
        const [state] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query LIKE '%FROM "PlatformStaff"%FOR SHARE%') AS waiting
        `;
        if (state.waiting) {
          // This is the ordinary logout transaction's only persistent change.
          await tx.harborAssistanceLoginReceipt.create({ data: { loginKey: login.key, retainUntil: login.retainUntil } });
          return { publication };
        }
        await delay(20);
      }
      throw new Error("Publication did not wait for the staff lock.");
    });
    assert.deepEqual(await lock.publication, { ok: false, error: "Only a Harbor OWNER can publish Catalog Records." });
    assert.equal((await snapshot(draft.id)).status, "DRAFT");
    assert.equal(await prisma.harborAuditEvent.count({ where: { staffId: first.id, action: "CATALOG_PUBLISH" } }), 0);
    assert.deepEqual((await Promise.all([signOut(), signOut()])).map((response) => response.status), [303, 303]);
    assert.equal(await resolveHarborSession(first.token), null);
    assert.equal((await resolveHarborSession(second))?.uid, first.id);
    await prisma.platformStaff.delete({ where: { id: first.id } });
    const receipt = await prisma.harborAssistanceLoginReceipt.findUniqueOrThrow({ where: { loginKey: login.key } });
    assert.equal(receipt.retainUntil.getTime(), login.retainUntil.getTime());
    await assert.rejects(() => prisma.harborAssistanceLoginReceipt.delete({ where: { loginKey: login.key } }), /still required/);
  });

  await t.test("failed combined publication rolls back field replacement and metadata", async () => {
    const draft = await createCatalogDefinition(prisma, input("rollback"), HARBOR_CATALOG_WRITE);
    const before = await snapshot(draft.id);
    const result = await runAction(owner.cookie, () => saveAndPublishHarborCatalogAction(form(draft, false)));
    assert.deepEqual(result, { ok: false, error: "Cannot publish a Catalog definition with no fields." });
    assert.deepEqual(await snapshot(draft.id), before);
    assert.equal(await prisma.harborAuditEvent.count({ where: { staffId: owner.id, action: "CATALOG_PUBLISH" } }), 2);
  });

  await t.test("both publication paths roll back when the audit detail cannot be stored", async () => {
    const draft = await createCatalogDefinition(prisma, input("audit_write"), HARBOR_CATALOG_WRITE);
    const before = await snapshot(draft.id);
    const checkName = `catalog_test_audit_${randomUUID().replaceAll("-", "")}`;
    // This disposable constraint rejects only this fixture's detail. Other suites can keep writing.
    assert.match(draft.id, /^[a-z0-9]+$/);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "HarborCatalogPublicationAuditDetail" ADD CONSTRAINT "${checkName}"
      CHECK ("definitionId" <> '${draft.id}') NOT VALID
    `);
    try {
      for (const action of publishActions) {
        assert.deepEqual(await runAction(owner.cookie, () => action(form(draft))), {
          ok: false, error: "Publication could not be recorded. No changes were saved.",
        });
        assert.deepEqual(await snapshot(draft.id), before);
        assert.equal(await prisma.harborAuditEvent.count({ where: { staffId: owner.id, action: "CATALOG_PUBLISH" } }), 2);
      }
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "HarborCatalogPublicationAuditDetail" DROP CONSTRAINT "${checkName}"`);
    }
  });

  await t.test("platform OWNER cannot publish private Facility or vendor drafts through either action", async () => {
    const owners = [
      { ownerKind: "FACILITY", ownerFacilityId: facility.id, operatorPeriodId: null },
      { ownerKind: "ORGANIZATION", ownerOrganizationId: org.id, operatorPeriodId: null },
    ] as const;
    for (const privateOwner of owners) {
      const draft = await createCatalogDefinition(prisma, input(privateOwner.ownerKind), {
        ...HARBOR_CATALOG_WRITE, owner: privateOwner,
      });
      const before = await snapshot(draft.id);
      for (const action of publishActions) {
        assert.deepEqual(await runAction(owner.cookie, () => action(form(draft))), {
          ok: false, error: "Catalog definition not found.",
        });
        assert.deepEqual(await snapshot(draft.id), before);
      }
    }
  });
});
