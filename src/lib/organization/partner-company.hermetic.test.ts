import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  matchOrganizationByNormalizedName,
  validatePartnerCompanyName,
  type OrganizationNameFields,
} from "./partner-company";

const metz: OrganizationNameFields = {
  id: "org_metz",
  name: "Metz Culinary",
  displayName: "Metz",
  legalName: "Metz Culinary Management, Inc.",
};

test("a partner company name matches an existing name, display name, or legal name", () => {
  assert.equal(matchOrganizationByNormalizedName([metz], ["  metz   culinary "])?.id, "org_metz");
  assert.equal(matchOrganizationByNormalizedName([metz], ["METZ"])?.id, "org_metz");
  assert.equal(
    matchOrganizationByNormalizedName([metz], ["Metz Culinary Management, Inc."])?.id,
    "org_metz",
  );
  assert.equal(matchOrganizationByNormalizedName([metz], ["Sodexo"]), null);
});

test("a partner company name is 2–200 characters", () => {
  assert.equal(validatePartnerCompanyName("  A ").ok, false);
  assert.equal(validatePartnerCompanyName("Metz Culinary").ok, true);
  assert.equal(validatePartnerCompanyName(` ${"M".repeat(201)} `).ok, false);
});

test("creating a partner company does not provision a facility or invite anyone", () => {
  const service = readFileSync(join(process.cwd(), "src/lib/organization/partner-company.ts"), "utf8");
  const action = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/partners/actions.ts"),
    "utf8",
  );
  assert.equal(service.includes("provisionFacility"), false);
  assert.equal(service.includes("Invitation"), false);
  assert.match(service, /organizationType: "MANAGEMENT_COMPANY"/);
  const partnerAction = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/organization/partners/actions.ts"),
    "utf8",
  );
  const operatorAction = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/operator-actions.ts",
    ),
    "utf8",
  );
  for (const source of [partnerAction, operatorAction]) {
    assert.equal(source.includes("createOrganizationForDepartmentOperator"), false);
    assert.match(source, /Vssyl Console must create this company/);
  }
  const claimsPage = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/organization-claims/page.tsx"),
    "utf8",
  );
  assert.match(claimsPage, /listHarborClaimQueue/);
  assert.match(action, /deliverOrganizationClaimInvitation/);
  assert.match(action, /deliverOrganizationMemberInvitation/);
  assert.equal(action.includes("facility.create"), false);
  assert.equal(action.includes("createOrganizationForNewFacility"), false);
});
