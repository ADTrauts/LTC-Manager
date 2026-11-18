import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { createHarborSessionToken, verifyHarborSessionToken } from "@/lib/harbor-console/session";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { HarborOrganizationNameMatchError, provisionFacilityForHarbor, type HarborProvisionInput } from "./harbor";
import { FacilityProvisioningError } from "./errors";

const target = process.env.VERIFY_DATABASE_URL;

test("Harbor provisioning blocks normalized matches and records the Owner's exact override atomically", {
  skip: !target && "set VERIFY_DATABASE_URL to a disposable migrated database",
}, async (t) => {
  assertDisposableDatabaseUrl(target);
  process.env.AUTH_SECRET ??= "disposable-harbor-organization-matching";
  const db = new PrismaClient({ datasourceUrl: target });
  const key = randomUUID();
  const base = (suffix: string): HarborProvisionInput => ({
    organizationMode: "create", organizationName: `Pine Health ${key}`,
    facilityDisplayName: `Synthetic ${suffix} ${key}`, timezone: "America/New_York",
    billingEmail: `billing-${key}@example.invalid`, administratorName: "Synthetic Administrator",
    administratorEmail: `${suffix}-${key}@example.invalid`,
  });
  async function staff(label: string, role: "OWNER" | "MEMBER") {
    const row = await db.platformStaff.create({ data: {
      email: `${label}-${key}@example.invalid`, displayName: label, role, passwordHash: "synthetic",
    } });
    return verifyHarborSessionToken(await createHarborSessionToken({
      uid: row.id, email: row.email, name: label, staffRole: role, sessionVersion: row.sessionVersion,
    }));
  }
  const footprint = () => Promise.all([
    db.organization.count({ where: { name: { contains: key } } }),
    db.facility.count({ where: { billingEmail: `billing-${key}@example.invalid` } }),
    db.user.count({ where: { email: { endsWith: `${key}@example.invalid` } } }),
    db.userFacilityAccess.count({ where: { facility: { billingEmail: `billing-${key}@example.invalid` } } }),
    db.harborAuditEvent.count({ where: { staff: { email: { endsWith: `${key}@example.invalid` } } } }),
  ]);
  try {
    await db.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, update: {}, create: {
      key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator",
    } });
    const [owner, otherOwner, member] = await Promise.all([staff("owner", "OWNER"), staff("second-owner", "OWNER"), staff("member", "MEMBER")]);
    const active = await db.organization.create({ data: { name: `Operating ${key}`, displayName: `PINE   HEALTH ${key}` } });
    const inactive = await db.organization.create({ data: { name: `Inactive ${key}`, legalName: `Pine Health ${key}`, isActive: false } });
    const initialIds = [active.id, inactive.id].sort();
    const isMatch = (ids: string[]) => (error: unknown) => {
      assert(error instanceof HarborOrganizationNameMatchError);
      assert.deepEqual(error.matches.map(({ id }) => id).sort(), ids.toSorted());
      return true;
    };
    const evidence = (reviewedMatchIds: string[]) => ({
      attested: true, verificationBasis: "Verified public business registry reference SYNTHETIC-47", reviewedMatchIds,
    });

    await t.test("ambiguous and inactive matches block writes and require current evidence", async () => {
      const before = await footprint();
      await assert.rejects(provisionFacilityForHarbor(db, owner, base("blocked")), (error) => {
        assert(isMatch(initialIds)(error));
        assert(error instanceof HarborOrganizationNameMatchError);
        assert.equal(error.matches.find(({ id }) => id === inactive.id)?.isActive, false);
        return true;
      });
      for (const distinctOrganization of [
        evidence([active.id]), { ...evidence(initialIds), attested: false }, { ...evidence(initialIds), verificationBasis: " " },
      ]) {
        await assert.rejects(provisionFacilityForHarbor(db, owner, { ...base("invalid"), distinctOrganization }), isMatch(initialIds));
      }
      await assert.rejects(provisionFacilityForHarbor(db, owner, { ...base("inactive"), organizationMode: "existing", organizationId: inactive.id }),
        (error) => error instanceof FacilityProvisioningError && error.code === "ORGANIZATION_INACTIVE");
      for (const session of [member, { ...owner, sessionVersion: owner.sessionVersion + 1 }]) {
        await assert.rejects(provisionFacilityForHarbor(db, session, { ...base("denied"), distinctOrganization: evidence(initialIds) }),
          (error) => error instanceof FacilityProvisioningError && error.code === "FORBIDDEN");
      }
      assert.deepEqual(await footprint(), before);
    });

    await t.test("concurrent overrides of the same reviewed set cannot create a second unchecked Organization", async () => {
      const results = await Promise.allSettled([
        provisionFacilityForHarbor(db, owner, { ...base("override-a"), distinctOrganization: evidence(initialIds) }),
        provisionFacilityForHarbor(db, otherOwner, { ...base("override-b"), organizationName: ` pine\t health  ${key.toUpperCase()} `, distinctOrganization: evidence(initialIds) }),
      ]);
      const accepted = results.flatMap((result, index) => result.status === "fulfilled" ? [{ result: result.value, actor: [owner, otherOwner][index] }] : []);
      assert.equal(accepted.length, 1);
      const [{ result, actor }] = accepted;
      const [rejected] = results.filter((result) => result.status === "rejected");
      assert(isMatch([...initialIds, result.organization.id])(rejected.reason));
      const audit = await db.harborAuditEvent.findFirstOrThrow({ where: { facilityId: result.facility.id, action: "PROVISION_FACILITY" }, include: { provisioningOverride: true } });
      assert.equal(audit.staffId, actor.uid);
      assert.equal(audit.provisioningOverride?.organizationId, result.organization.id);
      assert.deepEqual(audit.provisioningOverride?.matchedOrganizationIds.toSorted(), initialIds);
      assert.equal(audit.provisioningOverride?.verificationBasis, evidence(initialIds).verificationBasis);
    });

    await t.test("an override evidence write failure rolls back all dependent records", async () => {
      const name = `Blocked Receipt ${key}`;
      const match = await db.organization.create({ data: { name } });
      const before = await footprint();
      await db.$executeRaw`ALTER TABLE "HarborProvisioningOverrideAuditDetail"
        ADD CONSTRAINT "harbor_matching_test_receipt_failure"
        CHECK ("verificationBasis" <> 'Synthetic registry evidence to trigger test failure') NOT VALID`;
      try {
        await assert.rejects(provisionFacilityForHarbor(db, owner, {
          ...base("failed-audit"), organizationName: name,
          distinctOrganization: { ...evidence([match.id]), verificationBasis: "Synthetic registry evidence to trigger test failure" },
        }), /harbor_matching_test_receipt_failure/);
        assert.deepEqual(await footprint(), before);
      } finally {
        await db.$executeRaw`ALTER TABLE "HarborProvisioningOverrideAuditDetail" DROP CONSTRAINT "harbor_matching_test_receipt_failure"`;
      }
    });

    await t.test("concurrent ordinary creates only provision one Facility; an explicit active ID still works", async () => {
      const results = await Promise.allSettled([
        provisionFacilityForHarbor(db, owner, { ...base("new-a"), organizationName: `Oak Services ${key}` }),
        provisionFacilityForHarbor(db, otherOwner, { ...base("new-b"), organizationName: `OAK   SERVICES ${key}` }),
      ]);
      const accepted = results.filter((result) => result.status === "fulfilled");
      assert.equal(accepted.length, 1);
      const [rejected] = results.filter((result) => result.status === "rejected");
      assert(isMatch([accepted[0].value.organization.id])(rejected.reason));
      const linked = await provisionFacilityForHarbor(db, owner, { ...base("selected"), organizationMode: "existing", organizationId: active.id });
      assert.equal(linked.organization.id, active.id);
      assert.equal(linked.organization.created, false);
      assert.equal(await db.harborProvisioningOverrideAuditDetail.count({ where: { organizationId: active.id } }), 0);
    });
  } finally {
    await db.$disconnect();
  }
});
