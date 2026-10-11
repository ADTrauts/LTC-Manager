import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { AvailableContext } from "@/lib/available-contexts";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

import { listOrganizationPortfolio } from "./list";

function at(iso: string): Date {
  return new Date(iso);
}

const NOW = at("2026-10-11T16:00:00.000Z");

type FacilityRow = { id: string; displayName: string; organizationId: string };
type AccessPeriod = { startsAt: Date; endsAt: Date | null };
type PartnershipRow = {
  id: string;
  facilityId: string;
  organizationId: string;
  endedAt: Date | null;
  createdAt: Date;
  accessPeriods: AccessPeriod[];
};
type OperatorRow = {
  organizationId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  department: { name: string; facilityId: string; isActive: boolean };
};

function createDb(input: {
  facilities?: FacilityRow[];
  partnerships?: PartnershipRow[];
  operators?: OperatorRow[];
}) {
  const facilities = input.facilities ?? [];
  const partnerships = input.partnerships ?? [];
  const operators = input.operators ?? [];
  return {
    facility: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) =>
        facilities
          .filter((row) => row.organizationId === where.organizationId)
          .map((row) => ({ id: row.id, displayName: row.displayName })),
    },
    facilityPartnerOrganization: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; endedAt: null };
      }) =>
        partnerships
          .filter((row) => row.organizationId === where.organizationId)
          .filter((row) => row.endedAt === where.endedAt)
          .map((row) => ({
            id: row.id,
            facilityId: row.facilityId,
            endedAt: row.endedAt,
            facility: {
              displayName: facilities.find((facility) => facility.id === row.facilityId)?.displayName ?? row.facilityId,
            },
            accessPeriods: row.accessPeriods,
          })),
    },
    departmentOperatorRelationship: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          department: { isActive: boolean; facilityId: { in: string[] } };
        };
      }) =>
        operators.filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.department.isActive === where.department.isActive &&
            where.department.facilityId.in.includes(row.department.facilityId),
        ),
    },
  };
}

function internal(facilityId: string, role: "MANAGER" | "SUPERVISOR" = "MANAGER"): AvailableContext {
  return {
    kind: "facility_internal",
    contextKey: `facility_internal:${facilityId}`,
    facilityId,
    organizationId: "ecmc",
    accessId: `grant-${facilityId}`,
    role,
    isHome: false,
  };
}

function partner(fpoId: string, facilityId: string): AvailableContext {
  return {
    kind: "facility_partner",
    contextKey: `facility_partner:${fpoId}`,
    facilityId,
    partnerOrganizationId: "metz",
    facilityPartnerOrganizationId: fpoId,
    effectivePartnerRole: "PARTNER_MANAGER",
    allowedDepartmentIds: ["dept-1"],
  };
}

const ECMC_OWNED: FacilityRow[] = [
  { id: "terrace", displayName: "Terrace View", organizationId: "ecmc" },
  { id: "hospital", displayName: "ECMC Hospital", organizationId: "ecmc" },
  { id: "unrelated", displayName: "Other Site", organizationId: "other" },
];

const METZ_CLIENTS: PartnershipRow[] = [
  {
    id: "metz-terrace",
    facilityId: "terrace",
    organizationId: "metz",
    endedAt: null,
    createdAt: at("2024-01-01T00:00:00.000Z"),
    accessPeriods: [{ startsAt: at("2024-01-01T00:00:00.000Z"), endsAt: null }],
  },
  {
    id: "metz-highpointe",
    facilityId: "highpointe",
    organizationId: "metz",
    endedAt: null,
    createdAt: at("2024-02-01T00:00:00.000Z"),
    accessPeriods: [{ startsAt: at("2024-02-01T00:00:00.000Z"), endsAt: null }],
  },
];

test("owned Facilities belong only to the requested Organization", async () => {
  const portfolio = await listOrganizationPortfolio(
    createDb({ facilities: ECMC_OWNED }) as never,
    { organizationId: "ecmc", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => [] },
  );
  assert.deepEqual(
    portfolio.owned.map((row) => row.facilityId),
    ["hospital", "terrace"],
  );
  assert.equal(
    portfolio.owned.every((row) => row.relationshipKind === "owned" && row.personal.enterable === false),
    true,
  );
});

test("ACTIVE current FPO appears; PENDING, SUSPENDED, ENDED, and endedAt rows do not", async () => {
  const facilities: FacilityRow[] = [
    { id: "active", displayName: "Active Client", organizationId: "owner" },
    { id: "pending", displayName: "Pending Client", organizationId: "owner" },
    { id: "suspended", displayName: "Suspended Client", organizationId: "owner" },
    { id: "ended", displayName: "Ended Client", organizationId: "owner" },
    { id: "closed", displayName: "Closed Client", organizationId: "owner" },
  ];
  const partnerships: PartnershipRow[] = [
    {
      id: "fpo-active",
      facilityId: "active",
      organizationId: "metz",
      endedAt: null,
      createdAt: NOW,
      accessPeriods: [{ startsAt: at("2024-01-01T00:00:00.000Z"), endsAt: null }],
    },
    {
      id: "fpo-pending",
      facilityId: "pending",
      organizationId: "metz",
      endedAt: null,
      createdAt: NOW,
      accessPeriods: [{ startsAt: at("2027-01-01T00:00:00.000Z"), endsAt: null }],
    },
    {
      id: "fpo-suspended",
      facilityId: "suspended",
      organizationId: "metz",
      endedAt: null,
      createdAt: NOW,
      accessPeriods: [
        { startsAt: at("2024-01-01T00:00:00.000Z"), endsAt: at("2026-01-01T00:00:00.000Z") },
      ],
    },
    {
      id: "fpo-ended",
      facilityId: "ended",
      organizationId: "metz",
      endedAt: at("2026-05-01T00:00:00.000Z"),
      createdAt: NOW,
      accessPeriods: [{ startsAt: at("2024-01-01T00:00:00.000Z"), endsAt: null }],
    },
    {
      id: "fpo-closed",
      facilityId: "closed",
      organizationId: "metz",
      endedAt: at("2026-09-01T00:00:00.000Z"),
      createdAt: NOW,
      accessPeriods: [],
    },
  ];
  const portfolio = await listOrganizationPortfolio(
    createDb({ facilities, partnerships }) as never,
    { organizationId: "metz", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => [] },
  );
  assert.deepEqual(
    portfolio.clients.map((row) => row.facilityPartnerOrganizationId),
    ["fpo-active"],
  );
});

test("current DOR names enrich client rows; scope-only and DOR-only Facilities do not become clients", async () => {
  const facilities: FacilityRow[] = [
    { id: "terrace", displayName: "Terrace View", organizationId: "ecmc" },
    { id: "dor-only", displayName: "Operator Only", organizationId: "ecmc" },
  ];
  const portfolio = await listOrganizationPortfolio(
    createDb({
      facilities,
      partnerships: [METZ_CLIENTS[0]!],
      operators: [
        {
          organizationId: "metz",
          effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
          effectiveTo: null,
          department: { name: "Food & Nutrition", facilityId: "terrace", isActive: true },
        },
        {
          organizationId: "metz",
          effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
          effectiveTo: null,
          department: { name: "EVS", facilityId: "terrace", isActive: true },
        },
        {
          organizationId: "metz",
          effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
          effectiveTo: null,
          department: { name: "Plant Operations", facilityId: "dor-only", isActive: true },
        },
      ],
    }) as never,
    { organizationId: "metz", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => [] },
  );
  assert.equal(portfolio.clients.length, 1);
  assert.deepEqual(portfolio.clients[0]!.operatingDepartmentNames, ["EVS", "Food & Nutrition"]);
  assert.equal(
    portfolio.clients.some((row) => row.facilityId === "dor-only"),
    false,
  );
});

test("owned personal Open uses only a matching internal Available Context", async () => {
  const withGrant = await listOrganizationPortfolio(
    createDb({ facilities: ECMC_OWNED }) as never,
    { organizationId: "ecmc", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => [internal("terrace")] },
  );
  assert.deepEqual(withGrant.owned.find((row) => row.facilityId === "terrace")?.personal, {
    enterable: true,
    contextKey: "facility_internal:terrace",
    roleLabel: "Manager",
  });
  assert.deepEqual(withGrant.owned.find((row) => row.facilityId === "hospital")?.personal, {
    enterable: false,
  });

  const withoutGrant = await listOrganizationPortfolio(
    createDb({ facilities: ECMC_OWNED }) as never,
    { organizationId: "ecmc", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => [] },
  );
  assert.equal(withoutGrant.owned.length, 2);
  assert.equal(
    withoutGrant.owned.every((row) => row.personal.enterable === false),
    true,
  );
});

test("client personal Open uses only the matching FPO Available Context", async () => {
  const facilities: FacilityRow[] = [
    { id: "terrace", displayName: "Terrace View", organizationId: "ecmc" },
    { id: "highpointe", displayName: "HighPointe", organizationId: "owner" },
  ];
  const portfolio = await listOrganizationPortfolio(
    createDb({ facilities, partnerships: METZ_CLIENTS }) as never,
    { organizationId: "metz", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => [partner("metz-terrace", "terrace")] },
  );
  assert.deepEqual(portfolio.clients.find((row) => row.facilityId === "terrace")?.personal, {
    enterable: true,
    contextKey: "facility_partner:metz-terrace",
    roleLabel: "Partner Manager",
  });
  assert.deepEqual(portfolio.clients.find((row) => row.facilityId === "highpointe")?.personal, {
    enterable: false,
  });
});

test("same Facility dual hat attaches only the selected Organization relationship", async () => {
  const facilities: FacilityRow[] = [
    { id: "terrace", displayName: "Terrace View", organizationId: "ecmc" },
  ];
  const contexts: AvailableContext[] = [
    internal("terrace"),
    partner("metz-terrace", "terrace"),
  ];

  const metz = await listOrganizationPortfolio(
    createDb({ facilities, partnerships: [METZ_CLIENTS[0]!] }) as never,
    { organizationId: "metz", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => contexts },
  );
  assert.equal(metz.owned.length, 0);
  assert.deepEqual(metz.clients[0]!.personal, {
    enterable: true,
    contextKey: "facility_partner:metz-terrace",
    roleLabel: "Partner Manager",
  });

  const ecmc = await listOrganizationPortfolio(
    createDb({ facilities: ECMC_OWNED }) as never,
    { organizationId: "ecmc", userId: "andrew", now: NOW },
    { listAvailableContexts: async () => contexts },
  );
  assert.equal(ecmc.clients.length, 0);
  assert.deepEqual(ecmc.owned.find((row) => row.facilityId === "terrace")?.personal, {
    enterable: true,
    contextKey: "facility_internal:terrace",
    roleLabel: "Manager",
  });
});

test("listOrganizationPortfolio calls listAvailableContexts once and does not write access", async () => {
  let calls = 0;
  await listOrganizationPortfolio(
    createDb({ facilities: ECMC_OWNED, partnerships: METZ_CLIENTS }) as never,
    { organizationId: "metz", userId: "andrew", now: NOW },
    {
      listAvailableContexts: async () => {
        calls += 1;
        return [];
      },
    },
  );
  assert.equal(calls, 1);

  const source = readFileSync(join(process.cwd(), "src/lib/organization-portfolio/list.ts"), "utf8");
  assert.match(source, /listAvailableContexts/);
  assert.equal(source.includes("assignPartnerUser"), false);
  assert.equal(source.includes("grantUserFacilityAccess"), false);
  assert.equal(source.includes("UserFacilityAccess"), false);
  assert.equal(source.includes("createPartnerFacilitySessionToken"), false);
  assert.equal(source.includes("FacilityPartnerDepartmentScope"), false);
});

test("Portfolio page posts only contextKey to enterContextAction", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(organization-account)/organization/[organizationId]/page.tsx"),
    "utf8",
  );
  const view = readFileSync(
    join(process.cwd(), "src/components/organization-portfolio.tsx"),
    "utf8",
  );
  const nav = readFileSync(join(process.cwd(), "src/components/organization-workspace-nav.tsx"), "utf8");
  const combined = `${page}\n${view}`;
  assert.match(page, /requireOrganizationSession/);
  assert.match(page, /listOrganizationPortfolio/);
  assert.match(page, /session.organizationId !== organizationId/);
  assert.match(view, /enterContextAction/);
  assert.match(view, /name="contextKey"/);
  assert.match(view, /Open Facility/);
  assert.match(view, /No personal workspace access/);
  assert.equal(combined.includes("enterPartnerFacilityAction"), false);
  assert.equal(combined.includes("createPartnerFacilitySessionToken"), false);
  assert.equal(combined.includes("switchFacility"), false);
  assert.equal(combined.includes("createSessionToken"), false);
  assert.equal(combined.includes("listAuthorizedPartnerFacilities"), false);
  assert.equal(combined.includes("listOrganizationClientStaffing"), false);
  assert.equal(combined.includes("Request access"), false);
  assert.match(nav, /label: "Portfolio"/);
  assert.equal(nav.includes("label: \"Home\""), false);
});
