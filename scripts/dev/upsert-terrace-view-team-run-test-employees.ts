#!/usr/bin/env npx tsx
/**
 * Local/dev-only: upsert three Terrace View employees used to manually verify
 * Team-aware Today's Work scope.
 *
 * Does NOT run from seed, bootstrap, or production. Does NOT create facilities,
 * Teams, assignments, or Job Titles. Does NOT replace an existing real
 * Department Manager.
 *
 * From ltc-manager/:
 *   npx tsx scripts/dev/upsert-terrace-view-team-run-test-employees.ts
 *
 * Password follows the Terrace View seed convention (`ChangeMeNow123!`,
 * overridable with SEED_DEMO_PASSWORD).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import bcrypt from "bcryptjs";
import { EmployeeStatus, EmploymentType, PrismaClient, RoleKey } from "@prisma/client";

import { ensureUserFacilityAccessGrant } from "@/lib/facility-access";
import { syncEmployeeOrganization } from "@/lib/employee-membership";

const FACILITY_DISPLAY_NAME = "Terrace View Long Term Care";
const DIETARY_KEY = "DIETARY";
const RESIDENT_SERVICES_NAME = "Resident Services";

const EMPLOYEES = [
  {
    key: "rs-supervisor",
    firstName: "Test — Resident Services",
    lastName: "Supervisor",
    email: "rs-supervisor-test@terraceview.local",
    roleType: RoleKey.SUPERVISOR,
    primaryTeam: true,
    setDepartmentHead: false,
  },
  {
    key: "dietary-manager",
    firstName: "Test — Dietary Department",
    lastName: "Manager",
    email: "dietary-manager-test@terraceview.local",
    roleType: RoleKey.MANAGER,
    primaryTeam: true,
    setDepartmentHead: true,
  },
  {
    key: "no-team",
    firstName: "Test — Dietary Supervisor",
    lastName: "No Team",
    email: "dietary-supervisor-noteam-test@terraceview.local",
    roleType: RoleKey.SUPERVISOR,
    primaryTeam: false,
    setDepartmentHead: false,
  },
] as const;

function loadEnvFile() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore missing .env
  }
}

function demoPassword(): string {
  const password =
    process.env.SEED_DEMO_PASSWORD ||
    (process.env.ALLOW_DEMO_SEED_PASSWORD === "1" || process.env.NODE_ENV !== "production"
      ? "ChangeMeNow123!"
      : null);
  if (!password) {
    throw new Error(
      "Refusing to invent a password. Set SEED_DEMO_PASSWORD (local/dev Terrace View convention is ChangeMeNow123!).",
    );
  }
  return password;
}

async function main() {
  loadEnvFile();

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TERRACE_VIEW_DEV_TEST_EMPLOYEES !== "1") {
    throw new Error(
      "This script is local/dev test data only. It will not run when NODE_ENV=production.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const prisma = new PrismaClient();
  try {
    const facilities = await prisma.facility.findMany({
      where: { displayName: FACILITY_DISPLAY_NAME },
      select: { id: true, displayName: true },
    });
    if (facilities.length !== 1) {
      throw new Error(
        `Expected exactly one facility named "${FACILITY_DISPLAY_NAME}"; found ${facilities.length}. Refusing to create a facility.`,
      );
    }
    const facility = facilities[0]!;

    const dietary = await prisma.department.findFirst({
      where: { facilityId: facility.id, key: DIETARY_KEY, isActive: true },
      select: {
        id: true,
        name: true,
        headEmployeeId: true,
        headEmployee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!dietary) {
      throw new Error("Active Dietary Department was not found on Terrace View.");
    }

    const residentServices = await prisma.departmentTeam.findFirst({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: RESIDENT_SERVICES_NAME,
        status: "ACTIVE",
      },
      select: {
        id: true,
        displayName: true,
        _count: { select: { roomMemberships: true } },
      },
    });
    if (!residentServices) {
      throw new Error(
        "Resident Services Team was not found on Terrace View Dietary. Stopping without inventing a Team.",
      );
    }

    const membershipBefore = await prisma.employeeTeamMembership.count({
      where: { teamId: residentServices.id, employee: { status: "ACTIVE" } },
    });

    const passwordHash = await bcrypt.hash(demoPassword(), 12);

    type UpsertResult = {
      key: string;
      employeeId: string;
      userId: string;
      createdEmployee: boolean;
      createdUser: boolean;
      departmentHead: "YES" | "NOT SET";
      departmentHeadNote: string | null;
    };
    const results: UpsertResult[] = [];

    for (const spec of EMPLOYEES) {
      const result = await prisma.$transaction(async (tx) => {
        const role = await tx.role.findFirst({
          where: { key: spec.roleType, isActive: true },
          select: { id: true },
        });
        if (!role) {
          throw new Error(`Role ${spec.roleType} is not available.`);
        }

        const existingByEmail = await tx.employee.findFirst({
          where: { facilityId: facility.id, email: spec.email },
          select: { id: true },
        });
        const existingByName = existingByEmail
          ? null
          : await tx.employee.findFirst({
              where: {
                facilityId: facility.id,
                firstName: spec.firstName,
                lastName: spec.lastName,
              },
              select: { id: true },
            });
        const existingId = existingByEmail?.id ?? existingByName?.id ?? null;

        let createdEmployee = false;
        let employeeId = existingId;
        if (!employeeId) {
          const created = await tx.employee.create({
            data: {
              facilityId: facility.id,
              firstName: spec.firstName,
              lastName: spec.lastName,
              email: spec.email,
              roleType: spec.roleType,
              employmentType: EmploymentType.FULL_TIME,
              status: EmployeeStatus.ACTIVE,
            },
          });
          employeeId = created.id;
          createdEmployee = true;
        } else {
          await tx.employee.update({
            where: { id: employeeId },
            data: {
              firstName: spec.firstName,
              lastName: spec.lastName,
              email: spec.email,
              roleType: spec.roleType,
              status: EmployeeStatus.ACTIVE,
            },
          });
        }

        await syncEmployeeOrganization(tx, {
          employeeId,
          facilityId: facility.id,
          primaryDepartmentId: dietary.id,
          additionalDepartmentIds: [],
          jobTitleId: null,
          teamMemberships: spec.primaryTeam
            ? [{ teamId: residentServices.id, isPrimary: true }]
            : [],
        });

        const existingUser = await tx.user.findUnique({
          where: { email: spec.email },
          select: { id: true, facilityId: true },
        });
        if (existingUser && existingUser.facilityId !== facility.id) {
          throw new Error(`User ${spec.email} already exists on another facility.`);
        }
        let createdUser = false;
        let userId = existingUser?.id;
        if (!userId) {
          const created = await tx.user.create({
            data: {
              email: spec.email,
              displayName: `${spec.firstName} ${spec.lastName}`,
              passwordHash,
              facilityId: facility.id,
              roleId: role.id,
              isActive: true,
              primaryDepartmentId: dietary.id,
            },
          });
          userId = created.id;
          createdUser = true;
        } else {
          await tx.user.update({
            where: { id: userId },
            data: {
              displayName: `${spec.firstName} ${spec.lastName}`,
              passwordHash,
              roleId: role.id,
              isActive: true,
              primaryDepartmentId: dietary.id,
              facilityId: facility.id,
            },
          });
        }

        await ensureUserFacilityAccessGrant(tx, {
          userId,
          facilityId: facility.id,
          reactivate: true,
        });

        let departmentHead: "YES" | "NOT SET" = "NOT SET";
        let departmentHeadNote: string | null = null;
        if (spec.setDepartmentHead) {
          const currentHeadId = dietary.headEmployeeId;
          if (!currentHeadId || currentHeadId === employeeId) {
            await tx.department.update({
              where: { id: dietary.id },
              data: { headEmployeeId: employeeId },
            });
            departmentHead = "YES";
            departmentHeadNote = currentHeadId === employeeId ? "already head" : "set (was empty)";
          } else {
            departmentHead = "NOT SET";
            const head = dietary.headEmployee;
            departmentHeadNote = `Refused to replace existing Department Manager ${head?.firstName ?? ""} ${head?.lastName ?? ""} (${head?.email ?? currentHeadId}).`;
          }
        }

        return {
          key: spec.key,
          employeeId,
          userId,
          createdEmployee,
          createdUser,
          departmentHead,
          departmentHeadNote,
        };
      });
      results.push(result);
    }

    const membershipAfter = await prisma.employeeTeamMembership.count({
      where: { teamId: residentServices.id, employee: { status: "ACTIVE" } },
    });

    const verified = await prisma.employee.findMany({
      where: { id: { in: results.map((row) => row.employeeId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        roleType: true,
        status: true,
        primaryDepartmentId: true,
        jobTitle: { select: { name: true } },
        teamMemberships: {
          select: {
            isPrimary: true,
            team: { select: { id: true, displayName: true, status: true } },
          },
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          facility,
          dietary: { id: dietary.id, name: dietary.name, headEmployeeId: dietary.headEmployeeId },
          currentDepartmentManager: dietary.headEmployee,
          residentServices: {
            id: residentServices.id,
            roomCount: residentServices._count.roomMemberships,
            activeMembershipsBefore: membershipBefore,
            activeMembershipsAfter: membershipAfter,
          },
          passwordConvention: "SEED_DEMO_PASSWORD or local demo ChangeMeNow123!",
          results,
          verified,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
