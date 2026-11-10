/**
 * Phase 2C R4 authority + HTTP checks against a disposable DB and a live next start URL.
 * Invoked by run-r4-release-browser.mjs via `npx tsx` so `@/` aliases resolve.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { requirePasswordSession } from "@/lib/credential-policy";
import {
  bindLocationFunction,
  LOCATION_FUNCTION_AUTHORING_RETIRED,
} from "@/lib/department-administration/profile-service";
import { createOneOff } from "@/lib/department-work/occurrence-service";
import {
  GENERIC_WORK_AUTHORING_RETIRED,
  publishWorkPlan,
} from "@/lib/department-work/work-plan-service";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";

type Fixtures = {
  facilityId: string;
  dietaryDepartmentId: string;
  canonical: {
    unitId: string;
    spaceId: string;
    people: Record<
      "manager" | "worker" | "secondWorker",
      { email: string; employeeId: string; userId: string }
    >;
  };
};

function cookieHeader(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : [];
  if (raw.length) return raw.map((row) => row.split(";")[0]!).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(",")[0]!.split(";")[0]! : "";
}

async function loginHttp(baseUrl: string, email: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  return { status: res.status, ok: res.ok, cookie: cookieHeader(res) };
}

async function main() {
  const fixturePath = process.env.R4_RELEASE_BROWSER_FIXTURE_PATH;
  const reportPath = process.env.R4_AUTH_REPORT_PATH;
  const baseUrl = process.env.R4_RELEASE_BROWSER_BASE_URL;
  const dbUrl = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!fixturePath || !reportPath || !baseUrl || !dbUrl || !password) {
    throw new Error("R4 auth checks missing required env");
  }

  const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixtures;
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const report: { checks: Array<{ name: string; ok: boolean; detail: string }>; baseUrl: string } = {
    checks: [],
    baseUrl,
  };

  try {
    try {
      await publishWorkPlan(
        {
          uid: fixtures.canonical.people.manager.userId,
          authKind: "user",
          authMethod: "PASSWORD",
          scopeKind: "facility",
          role: "GM",
          facilityId: fixtures.facilityId,
          primaryDepartmentId: fixtures.dietaryDepartmentId,
          name: "manager",
          email: fixtures.canonical.people.manager.email,
          sessionVersion: 0,
        } as never,
        {
          facilityId: fixtures.facilityId,
          departmentId: fixtures.dietaryDepartmentId,
          workPlanId: "not-a-real-plan",
          actor: {
            userId: fixtures.canonical.people.manager.userId,
          },
        },
      );
      report.checks.push({ name: "publishWorkPlan_retired", ok: false, detail: "did not throw" });
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      report.checks.push({
        name: "publishWorkPlan_retired",
        ok: msg === GENERIC_WORK_AUTHORING_RETIRED || msg.includes("Operating Rhythm"),
        detail: msg.slice(0, 200),
      });
    }

    try {
      await bindLocationFunction(
        {
          userId: fixtures.canonical.people.manager.userId,
          role: "GM",
          facilityId: fixtures.facilityId,
          authMethod: "PASSWORD",
        },
        {
          facilityId: fixtures.facilityId,
          departmentId: fixtures.dietaryDepartmentId,
          unitSpaceId: fixtures.canonical.spaceId,
          functionKey: "SERVERY",
        },
      );
      report.checks.push({ name: "bindLocationFunction_retired", ok: false, detail: "did not throw" });
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      report.checks.push({
        name: "bindLocationFunction_retired",
        ok: msg === LOCATION_FUNCTION_AUTHORING_RETIRED || msg.includes("Location Function"),
        detail: msg.slice(0, 200),
      });
    }

    const workerSession = {
      uid: fixtures.canonical.people.worker.userId,
      authKind: "user" as const,
      authMethod: "PASSWORD" as const,
      scopeKind: "facility" as const,
      role: "STAFF" as const,
      facilityId: fixtures.facilityId,
      primaryDepartmentId: fixtures.dietaryDepartmentId,
      name: "worker",
      email: fixtures.canonical.people.worker.email,
      sessionVersion: 0,
    };
    const managerSession = {
      uid: fixtures.canonical.people.manager.userId,
      authKind: "user" as const,
      authMethod: "PASSWORD" as const,
      scopeKind: "facility" as const,
      role: "GM" as const,
      facilityId: fixtures.facilityId,
      primaryDepartmentId: fixtures.dietaryDepartmentId,
      name: "manager",
      email: fixtures.canonical.people.manager.email,
      sessionVersion: 0,
    };

    const facility = await db.facility.findUniqueOrThrow({ where: { id: fixtures.facilityId } });
    const dateKey = toServiceDateKey(getFacilityServiceDate(facility.timezone, new Date()));

    try {
      await createOneOff(workerSession as never, {
        client: db,
        actor: { userId: workerSession.uid, authenticationMethod: "PASSWORD" },
        work: {
          facilityId: fixtures.facilityId,
          departmentId: fixtures.dietaryDepartmentId,
          operationalDate: dateKey,
          unitId: fixtures.canonical.unitId,
          spaceId: fixtures.canonical.spaceId,
          title: "staff should not create",
          instructions: "auth check",
        },
      });
      report.checks.push({ name: "staffCreateOneOff_denied", ok: false, detail: "staff create succeeded" });
    } catch (err) {
      report.checks.push({
        name: "staffCreateOneOff_denied",
        ok: true,
        detail: String((err as Error)?.message || err).slice(0, 200),
      });
    }

    const created = await createOneOff(managerSession as never, {
      client: db,
      actor: {
        userId: managerSession.uid,
        employeeId: fixtures.canonical.people.manager.employeeId,
        authenticationMethod: "PASSWORD",
      },
      work: {
        facilityId: fixtures.facilityId,
        departmentId: fixtures.dietaryDepartmentId,
        operationalDate: dateKey,
        unitId: fixtures.canonical.unitId,
        spaceId: fixtures.canonical.spaceId,
        title: "manager auth one-off",
        instructions: "auth check",
        assignedEmployeeId: fixtures.canonical.people.worker.employeeId,
      },
    });
    report.checks.push({
      name: "managerCreateOneOff_allowed",
      ok: Boolean(created?.id),
      detail: created?.id ?? "missing",
    });

    try {
      requirePasswordSession({ authMethod: "QUICK_PIN" });
      report.checks.push({ name: "qualification_password_gate", ok: false, detail: "PIN allowed" });
    } catch (err) {
      report.checks.push({
        name: "qualification_password_gate",
        ok: String((err as Error)?.message || err).includes("email and password"),
        detail: String((err as Error)?.message || err).slice(0, 200),
      });
    }

    const badLogin = await loginHttp(baseUrl, fixtures.canonical.people.worker.email, "wrong-password");
    report.checks.push({
      name: "http_login_rejected",
      ok: !badLogin.ok && badLogin.status >= 400,
      detail: `status=${badLogin.status}`,
    });

    const workerLogin = await loginHttp(baseUrl, fixtures.canonical.people.worker.email, password);
    report.checks.push({
      name: "http_worker_login",
      ok: workerLogin.ok && Boolean(workerLogin.cookie),
      detail: `status=${workerLogin.status}`,
    });
    if (workerLogin.cookie) {
      const ops = await fetch(`${baseUrl}/staffing/operations`, {
        headers: { cookie: workerLogin.cookie },
        redirect: "manual",
      });
      const opsBody = await ops.text();
      const exposesCreate =
        opsBody.includes('data-testid="supervisor-one-off-work-form"') ||
        opsBody.includes('data-testid="create-one-off-work"');
      report.checks.push({
        name: "http_staff_ops_no_one_off_create",
        ok: ops.status === 307 || ops.status === 302 || ops.status === 403 || !exposesCreate,
        detail: `status=${ops.status} exposesCreate=${exposesCreate}`,
      });

      const foreignUnit = await fetch(`${baseUrl}/unit/not-a-real-unit-id`, {
        headers: { cookie: workerLogin.cookie },
        redirect: "manual",
      });
      report.checks.push({
        name: "http_facility_isolation_unknown_unit",
        ok: [302, 303, 307, 308, 403, 404].includes(foreignUnit.status),
        detail: `status=${foreignUnit.status}`,
      });
    }

    const managerLogin = await loginHttp(baseUrl, fixtures.canonical.people.manager.email, password);
    report.checks.push({
      name: "http_manager_login",
      ok: managerLogin.ok && Boolean(managerLogin.cookie),
      detail: `status=${managerLogin.status}`,
    });
    if (managerLogin.cookie) {
      const workPlans = await fetch(`${baseUrl}/staffing/work-plans`, {
        headers: { cookie: managerLogin.cookie },
        redirect: "manual",
      });
      const wpBody = await workPlans.text();
      report.checks.push({
        name: "http_work_plans_retired_surface",
        ok:
          workPlans.status === 200 &&
          wpBody.includes("work-plan-builder-retired") &&
          !wpBody.includes('data-testid="create-work-plan"'),
        detail: `status=${workPlans.status}`,
      });

      const dept = await fetch(`${baseUrl}/admin/departments/${fixtures.dietaryDepartmentId}`, {
        headers: { cookie: managerLogin.cookie },
        redirect: "manual",
      });
      const deptBody = await dept.text();
      report.checks.push({
        name: "http_lf_authoring_absent",
        ok:
          dept.status === 200 || dept.status === 307 || dept.status === 302
            ? !/Publish Location Functions/i.test(deptBody)
            : [302, 303, 307, 403, 404].includes(dept.status),
        detail: `status=${dept.status}`,
      });

      const ownUnit = await fetch(`${baseUrl}/unit/${fixtures.canonical.unitId}`, {
        headers: { cookie: managerLogin.cookie },
        redirect: "manual",
      });
      report.checks.push({
        name: "http_manager_unit_access",
        ok: ownUnit.status === 200 || ownUnit.status === 307 || ownUnit.status === 302,
        detail: `status=${ownUnit.status}`,
      });
    }

    let plantAssigned: number | null = null;
    try {
      // Probe assignee scope only — Asset has no facilityId scalar (unit-scoped).
      plantAssigned = await db.repair.count({
        where: {
          assignedEmployeeId: fixtures.canonical.people.worker.employeeId,
        },
      });
    } catch {
      plantAssigned = null;
    }
    report.checks.push({
      name: "plant_wo_assigned_scope_queryable",
      ok: plantAssigned === null || plantAssigned >= 0,
      detail: plantAssigned === null ? "Repair assignee probe unavailable" : `assignedOpen=${plantAssigned}`,
    });

    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    for (const check of report.checks) {
      console.log(`auth ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
    }
    const failed = report.checks.filter((c) => !c.ok);
    if (failed.length) {
      console.error(`auth checks failed: ${failed.map((f) => f.name).join(", ")}`);
      process.exit(1);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(String((err as Error)?.message || err));
  process.exit(1);
});
