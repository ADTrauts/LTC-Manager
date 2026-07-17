/**
 * Developer-facing Projection Shadow diagnostics endpoint.
 *
 * Behind PROJECTION_SHADOW_ENABLED. Facility Administrator only.
 * Returns JSON parity diagnostics — no polished UI, no surface cutover.
 */

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { isProjectionShadowEnabled } from "@/lib/feature-flags";
import {
  buildDepartmentLens,
  buildFacilityLens,
  buildProjectionRequest,
  formatShadowParityLog,
  permissionKeysForRoleBand,
  runProjectionShadow,
  type LegacyShadowInput,
} from "@/lib/projection";
import type { AppRole } from "@/lib/access";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

export const dynamic = "force-dynamic";

type ShadowBody = {
  facilityId?: string;
  lens?: "FACILITY" | "DEPARTMENT";
  departmentId?: string;
  departmentKey?: OperationalDepartmentKey;
  purpose?: "SIDEBAR" | "LOCATIONS" | "OPERATIONS_CENTER" | "UNIT_WORKSPACE";
  legacy: LegacyShadowInput;
};

export async function POST(request: Request) {
  if (!isProjectionShadowEnabled()) {
    return NextResponse.json(
      { error: "Projection shadow mode is disabled." },
      { status: 404 },
    );
  }

  const session = await getSession();
  if (!session?.facilityId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFacilityAdministratorRole(session.role as AppRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ShadowBody;
  try {
    body = (await request.json()) as ShadowBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const facilityId = body.facilityId ?? session.facilityId;
  if (facilityId !== session.facilityId) {
    return NextResponse.json(
      { error: "Cross-facility shadow requests are not allowed." },
      { status: 403 },
    );
  }

  if (!body.legacy || body.legacy.facilityId !== facilityId) {
    return NextResponse.json(
      { error: "legacy.facilityId must match the request facility." },
      { status: 400 },
    );
  }

  const lens =
    body.lens === "FACILITY"
      ? buildFacilityLens()
      : body.departmentId && body.departmentKey
        ? buildDepartmentLens(body.departmentId, body.departmentKey)
        : null;

  if (!lens) {
    return NextResponse.json(
      {
        error:
          "Provide lens=FACILITY or departmentId+departmentKey for DEPARTMENT.",
      },
      { status: 400 },
    );
  }

  const projectionRequest = buildProjectionRequest({
    facilityId,
    lens,
    purpose: body.purpose ?? "LOCATIONS",
    principal: {
      principalKind: "USER",
      role: session.role,
      allowedUnitIds: "ALL",
      permissionKeys: permissionKeysForRoleBand(session.role),
      accessClassKey: `shadow:${session.role}`,
    },
    asOf: new Date().toISOString(),
  });

  const report = await runProjectionShadow({
    request: projectionRequest,
    legacy: body.legacy,
  });

  return NextResponse.json({
    log: formatShadowParityLog(report),
    ok: report.ok,
    metrics: report.metrics,
    mismatches: report.mismatches,
  });
}
