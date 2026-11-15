import "next/dist/server/node-environment-baseline";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { SignJWT } from "jose";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { NextRequest } from "next/server";

import { createBuilderBuildingAction } from "@/app/(protected)/admin/facility/builder/actions";
import { POST as selectDepartment } from "@/app/api/auth/active-department/route";
import { GET as getSessionApi } from "@/app/api/auth/session/route";
import { POST as clearWork } from "@/app/api/console/work-session/end/route";
import { createPartnerFacilitySessionToken, createSessionToken, getPartnerFacilitySession, getSession } from "@/lib/auth";
import { getHarborSession, hasHarborCapability } from "@/lib/harbor-console/auth";
import { assignPartnerUser, setFacilityPartnerRoleCeiling } from "@/lib/partner-user-access";
import { prisma } from "@/lib/prisma";
import { readAuthenticatedUserIdentity } from "@/lib/user-session";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { createHarborSessionToken } from "./session";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
const origin = "http://localhost:3000";
const tag = `retirement-${randomUUID()}`;
const startsAt = new Date("2020-01-01T00:00:00Z");

function inRequest<T>(cookie: string, action: () => Promise<T>): Promise<T> {
  const pathname = "/admin/facility/builder";
  const request = new NextRequest(origin + pathname, { headers: { cookie } });
  const store = createRequestStoreForAPI(request, { pathname }, { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined);
  store.phase = "action";
  // Direct action invocation only enqueues cache revalidation.
  const work = { route: pathname, incrementalCache: {} } as WorkStore;
  return workAsyncStorage.run(work, () => workUnitAsyncStorage.run(store, action));
}

test("retired context fails closed across direct handlers with live staff and customer sessions", {
  skip: !databaseUrl && "set VERIFY_DATABASE_URL to a disposable migrated database",
}, async (t) => {
  assertDisposableDatabaseUrl(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET ??= "synthetic-work-session-retirement";
  t.after(async () => {
    try {
      await prisma.platformStaff.deleteMany({ where: { email: { startsWith: tag } } });
      await prisma.partnerUserFacilityAccess.deleteMany({ where: { user: { email: { startsWith: tag } } } });
      await prisma.userOrganizationMembership.deleteMany({ where: { user: { email: { startsWith: tag } } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
      await prisma.employee.deleteMany({ where: { facility: { displayName: tag } } });
      await prisma.unit.deleteMany({ where: { facility: { displayName: tag } } });
      await prisma.facilityPartnerOrganization.deleteMany({ where: { facility: { displayName: tag } } });
      await prisma.department.deleteMany({ where: { facility: { displayName: tag } } });
      await prisma.facility.deleteMany({ where: { displayName: tag } });
      await prisma.organization.deleteMany({ where: { name: { startsWith: tag } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  const org = await prisma.organization.create({ data: { name: tag } });
  const facility = await prisma.facility.create({ data: { displayName: tag, organizationId: org.id, timezone: "America/New_York" } });
  const administratorRole = await prisma.role.upsert({
    where: { key: "FACILITY_ADMINISTRATOR" },
    update: {},
    create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
  });
  const customer = await prisma.user.create({
    data: {
      email: `${tag}-customer@example.invalid`, displayName: "Facility Administrator",
      facilityId: facility.id, roleId: administratorRole.id, emailVerifiedAt: new Date(),
    },
  });
  await prisma.userFacilityAccess.create({ data: {
    facilityId: facility.id, userId: customer.id,
    rolePeriods: { create: { startsAt, roleKey: "FACILITY_ADMINISTRATOR" } },
  } });
  const customerToken = await createSessionToken({
    uid: customer.id, name: customer.displayName, email: customer.email, facilityId: facility.id,
    role: "FACILITY_ADMINISTRATOR", sessionVersion: customer.sessionVersion,
  });
  const customerCookie = `ltc_session=${customerToken}`;

  for (const role of ["OWNER", "MEMBER"] as const) {
    const staff = await prisma.platformStaff.create({
      data: { displayName: role, email: `${tag}-${role}@example.invalid`, passwordHash: "unused-in-direct-test", role },
    });
    const harbor = await createHarborSessionToken({
      uid: staff.id, name: staff.displayName, email: staff.email, staffRole: staff.role, sessionVersion: staff.sessionVersion,
    });
    const legacy = await new SignJWT({ tokenUse: "harbor_work", staffId: staff.id, facilityId: facility.id })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const staffCookie = `harbor_session=${harbor}`;
    for (const work of [legacy, "invalid", ""]) {
      const context = `${staffCookie}; harbor_work=${work}`;
      for (const cookie of [context, `${context}; ${customerCookie}`]) {
        const session = await inRequest(cookie, getHarborSession);
        assert.equal(session?.uid, staff.id);
        assert.equal(hasHarborCapability("catalog.publish", session), role === "OWNER");
        assert.deepEqual(await inRequest(cookie, getSessionApi).then((r) => r.json()), { session: null });
        const apiWrite = await inRequest(cookie, () =>
          selectDepartment(new Request(origin + "/api/auth/active-department", { method: "POST" })),
        );
        assert.equal(apiWrite.status, 401);
        assert.equal(apiWrite.headers.get("set-cookie"), null);
        assert.deepEqual(await inRequest(cookie, readAuthenticatedUserIdentity), { ok: false, reason: "UNAUTHENTICATED" });

        const form = new FormData();
        form.set("name", "Denied building");
        await assert.rejects(() => inRequest(cookie, () => createBuilderBuildingAction(form)), /Unauthorized/);
      }
    }
    const cleanup = await inRequest(`${staffCookie}; harbor_work=${legacy}; ${customerCookie}`, () =>
      clearWork(new Request(origin + "/api/console/work-session/end", { method: "POST", headers: { origin } }))
    );
    assert.equal(cleanup.status, 303);
    assert.equal(cleanup.headers.get("location"), origin + "/console/customers");
    assert.match(cleanup.headers.get("set-cookie") ?? "", /^harbor_work=;.*Max-Age=0/);
    assert.doesNotMatch(cleanup.headers.get("set-cookie") ?? "", /ltc_session|harbor_session/);
  }

  const cleanupWithoutStaff = await inRequest(`harbor_work=invalid; ${customerCookie}`, () =>
    clearWork(new Request(origin + "/api/console/work-session/end", { method: "POST", headers: { origin } }))
  );
  assert.equal(cleanupWithoutStaff.headers.get("location"), origin + "/login");
  assert.match(cleanupWithoutStaff.headers.get("set-cookie") ?? "", /^harbor_work=;.*Max-Age=0/);
  assert.equal(await prisma.unit.count({ where: { facilityId: facility.id } }), 0);
  assert.equal((await inRequest(customerCookie, getSession))?.uid, customer.id);
  const form = new FormData();
  form.set("name", "Customer building");
  await inRequest(customerCookie, () => createBuilderBuildingAction(form));
  assert.equal(await prisma.unit.count({ where: { name: "Customer building", facilityId: facility.id } }), 1);

  const department = await prisma.department.create({ data: { name: "Food & Nutrition", key: "DIETARY", facilityId: facility.id } });
  const employee = await prisma.employee.create({ data: {
    firstName: "Department", lastName: "Employee", facilityId: facility.id, primaryDepartmentId: department.id,
    roleType: "STAFF", employmentType: "FULL_TIME",
  } });
  const employeeCookie = `ltc_session=${await createSessionToken({
    uid: employee.id, name: "Department Employee", email: "", role: "STAFF", authKind: "employee",
    authMethod: "QUICK_PIN", facilityId: facility.id, primaryDepartmentId: department.id, sessionVersion: employee.sessionVersion,
  })}`;
  const employeeSession = await inRequest(employeeCookie, getSession);
  assert.equal(employeeSession?.uid, employee.id);
  assert.equal(employeeSession?.primaryDepartmentId, department.id);
  assert.equal(await inRequest(`harbor_work=invalid; ${employeeCookie}`, getSession), null);

  const vendor = await prisma.organization.create({ data: { name: `${tag} vendor` } });
  const partner = await prisma.user.create({
    data: { email: `${tag}-partner@example.invalid`, displayName: "Partner", emailVerifiedAt: new Date() },
  });
  await prisma.userOrganizationMembership.create({ data: {
    userId: partner.id, organizationId: vendor.id, rolePeriods: { create: { role: "ORG_MEMBER", startsAt } },
  } });
  const agreement = await prisma.facilityPartnerOrganization.create({ data: {
    facilityId: facility.id, organizationId: vendor.id,
    accessPeriods: { create: { startsAt } }, departmentScopes: { create: { departmentId: department.id, startsAt } },
  } });
  await setFacilityPartnerRoleCeiling(prisma, {
    actorUserId: customer.id, partnershipId: agreement.id, facilityId: facility.id, maxPartnerRole: "PARTNER_MANAGER",
  });
  await assignPartnerUser(prisma, {
    actorUserId: customer.id, partnershipId: agreement.id, facilityId: facility.id, userId: partner.id, partnerRole: "PARTNER_VIEWER",
  });
  const partnerCookie = `ltc_session=${await createPartnerFacilitySessionToken({
    uid: partner.id, name: partner.displayName, email: partner.email, facilityId: facility.id,
    partnerOrganizationId: vendor.id, facilityPartnerOrganizationId: agreement.id, sessionVersion: partner.sessionVersion,
  })}`;
  const partnerSession = await inRequest(partnerCookie, getPartnerFacilitySession);
  assert.equal(partnerSession?.uid, partner.id);
  assert.equal(partnerSession?.facilityPartnerOrganizationId, agreement.id);
  assert.equal(await inRequest(`harbor_work=invalid; ${partnerCookie}`, getPartnerFacilitySession), null);
});
