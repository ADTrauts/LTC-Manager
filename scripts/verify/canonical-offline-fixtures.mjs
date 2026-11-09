/**
 * Canonical SPACE offline fixture for disposable VERIFY_DATABASE_URL only.
 *
 * Phase 2C R3: does NOT call Location Function bind/publish or Work Plan draft/publish.
 * Uses Facility structure + Department responsibility, Operating Rhythm publication,
 * supervisor ONE_OFF Work occurrences, optional Catalog Records attachment, and an
 * isolated historical WORK_PLAN occurrence seed for legacy command compatibility.
 */
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { tsImport } from "tsx/esm/api";
import { activateFixtureAccount } from "./fixture-account.mjs";
import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

const WORK_INSTRUCTIONS =
  "Verify supplies for this exact Space before confirming completion.";

export async function prepareCanonicalOfflineFixture(
  db,
  { facilityId, departmentId, tag, pin, extraWorkItems = 0, extraKeyTimes = 0 },
) {
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  const secret = process.env.AUTH_SECRET;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!secret || !password) throw Error("Synthetic fixture credentials required");

  const { onboardFacilityEmployee } = await tsImport(
    "../../src/lib/employee-identity/onboard.ts",
    import.meta.url,
  );
  const { syncEmployeeOrganization } = await tsImport(
    "../../src/lib/employee-membership/organization.ts",
    import.meta.url,
  );
  const structure = await tsImport(
    "../../src/lib/bulk-import/facility-structure-execute.ts",
    import.meta.url,
  );
  const { savePhysicalResponsibility } = await tsImport(
    "../../src/lib/facility-builder/responsibility-service.ts",
    import.meta.url,
  );
  const { getFacilityServiceDate, toServiceDateKey } = await tsImport(
    "../../src/lib/operational-time/index.ts",
    import.meta.url,
  );
  const cycles = await tsImport("../../src/lib/operational-cycles/cycle-service.ts", import.meta.url);
  const { createOneOff } = await tsImport(
    "../../src/lib/department-work/occurrence-service.ts",
    import.meta.url,
  );
  const { buildOccurrenceKey } = await tsImport(
    "../../src/lib/department-work/occurrence-key.ts",
    import.meta.url,
  );

  const facility = await db.facility.findUniqueOrThrow({ where: { id: facilityId } });
  const effectiveFrom = toServiceDateKey(getFacilityServiceDate(facility.timezone, new Date()));

  const csv = `floor,neighborhood,locationName,locationType,roomNumber\nCertification Floor,Canonical ${tag},Food Service ${tag},Servery,001\n`;
  const plan = structure.buildFacilityStructurePlanFromCsv(
    csv,
    await structure.loadFacilityStructureCatalog(db, facilityId),
    "canonical-offline.csv",
  );
  if (!plan.ok || !plan.plan.canConfirm) throw Error(JSON.stringify(plan));
  await structure.executeFacilityStructurePlan(db, facilityId, plan.plan);

  const room = await db.unitSpace.findFirstOrThrow({
    where: { facilityId, name: `Food Service ${tag}` },
    include: { unit: true },
  });
  if (room.unit.hierarchyRole !== "NEIGHBORHOOD" || room.unit.unitType !== "OTHER") {
    throw Error("Expected canonical physical Neighborhood, never a legacy SERVERY override");
  }
  for (const [locationType, locationId] of [
    ["UNIT", room.unitId],
    ["ROOM", room.id],
  ]) {
    await savePhysicalResponsibility(db, {
      facilityId,
      departmentId,
      locationType,
      locationId,
      preserveExisting: true,
    });
  }

  const people = {};
  for (const [key, roleKey] of [
    ["manager", "GM"],
    ["worker", "STAFF"],
    ["secondWorker", "STAFF"],
  ]) {
    const email = `canonical-${tag}-${key.toLowerCase()}@example.test`;
    const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        displayName: `Canonical ${key}`,
        facilityId,
        primaryDepartmentId: departmentId,
        roleId: role.id,
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    await activateFixtureAccount(db, user, { facilityId, roleKey });
    let employee = await db.employee.findUnique({
      where: { facilityId_userId: { facilityId, userId: user.id } },
    });
    if (!employee) {
      const made = await db.$transaction((tx) =>
        onboardFacilityEmployee(tx, {
          facilityId,
          actorUserId: user.id,
          firstName: "Canonical",
          lastName: key,
          email,
          roleType: roleKey,
          employmentType: "FULL_TIME",
          status: "ACTIVE",
          confirmExistingUser: true,
          pinDigest:
            key === "worker"
              ? createHmac("sha256", secret).update(`${facilityId}:${pin}`).digest("hex")
              : roleKey === "STAFF"
                ? createHmac("sha256", secret)
                    .update(`${facilityId}:${pin.slice(0, -1)}9`)
                    .digest("hex")
                : null,
          extras: { primaryUnitId: room.unitId },
        }),
      );
      employee = await db.employee.findUniqueOrThrow({ where: { id: made.employeeId } });
    }
    await db.$transaction((tx) =>
      syncEmployeeOrganization(tx, {
        facilityId,
        employeeId: employee.id,
        primaryDepartmentId: departmentId,
        additionalDepartmentIds: [],
        jobTitleId: null,
        teamMemberships: [],
      }),
    );
    people[key] = { userId: user.id, employeeId: employee.id, email };
  }

  const manager = people.manager;
  const session = {
    uid: manager.userId,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "GM",
    facilityId,
    primaryDepartmentId: departmentId,
    name: "Canonical manager",
    email: manager.email,
    sessionVersion: 0,
  };

  // Operating Rhythm — supported publication path (not Location Function).
  const stableKey = `canonical_offline_${tag}`;
  let cycle = await db.departmentOperationalCycle.findFirst({
    where: { departmentId, stableKey, status: "PUBLISHED" },
  });
  if (!cycle) {
    const draft = await cycles.createDraft(session, {
      facilityId,
      departmentId,
      client: db,
      actor: { userId: manager.userId },
      draft: {
        stableKey,
        label: `Canonical ${tag} service`,
        nodeKind: "PERIOD",
        cycleType: "SERVICE",
        mealType: "LUNCH",
        startLocal: "00:00",
        endLocal: "23:59",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom,
        locationMode: "EXPLICIT_UNITS",
        spaceIds: [room.id],
      },
    });
    cycle = await cycles.publishCycle(session, {
      facilityId,
      departmentId,
      cycleId: draft.id,
      actor: { userId: manager.userId },
      allowImmediate: true,
      client: db,
    });
  }

  let keyPoint = await db.departmentOperationalCycle.findFirst({
    where: { departmentId, stableKey: `canonical_${tag}_ready`, status: "PUBLISHED" },
  });
  if (!keyPoint) {
    const draft = await cycles.createDraft(session, {
      facilityId,
      departmentId,
      client: db,
      actor: { userId: manager.userId },
      draft: {
        stableKey: `canonical_${tag}_ready`,
        label: "Ready",
        nodeKind: "KEY_TIME",
        parentStableKey: stableKey,
        cycleType: "SERVICE",
        mealType: "LUNCH",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom,
        occurrenceTracking: "REQUIRED",
        locationMode: "EXPLICIT_UNITS",
        spaceIds: [room.id],
        keyTimeGroups: [{ dueLocal: "07:00", spaceIds: [room.id] }],
      },
    });
    keyPoint = await cycles.publishCycle(session, {
      facilityId,
      departmentId,
      cycleId: draft.id,
      actor: { userId: manager.userId },
      allowImmediate: true,
      client: db,
    });
  }

  for (let i = 0; i < extraKeyTimes; i++) {
    const key = `canonical_${tag}_actual_${i}`;
    const existing = await db.departmentOperationalCycle.findFirst({
      where: { departmentId, stableKey: key, status: "PUBLISHED" },
    });
    if (existing) continue;
    const draft = await cycles.createDraft(session, {
      facilityId,
      departmentId,
      client: db,
      actor: { userId: manager.userId },
      draft: {
        stableKey: key,
        label: `Service check ${i + 1}`,
        nodeKind: "KEY_TIME",
        parentStableKey: stableKey,
        cycleType: "SERVICE",
        mealType: "LUNCH",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom,
        occurrenceTracking: "OPTIONAL",
        locationMode: "EXPLICIT_UNITS",
        spaceIds: [room.id],
        keyTimeGroups: [{ dueLocal: "08:00", spaceIds: [room.id] }],
      },
    });
    await cycles.publishCycle(session, {
      facilityId,
      departmentId,
      cycleId: draft.id,
      actor: { userId: manager.userId },
      allowImmediate: true,
      client: db,
    });
  }

  // ONE_OFF compatibility Work — supported runtime path (not Work Plan authoring).
  const workLabel = "Check food service supplies";
  const oneOffIds = [];
  const totalWork = 1 + Math.max(0, extraWorkItems);
  const operationalDate = new Date(`${effectiveFrom}T00:00:00.000Z`);
  for (let i = 0; i < totalWork; i++) {
    const title = i === 0 ? workLabel : `Certification Work ${i}`;
    const existing = await db.departmentWorkOccurrence.findFirst({
      where: {
        facilityId,
        departmentId,
        spaceId: room.id,
        sourceKind: "ONE_OFF",
        status: "OPEN",
        operationalDate,
        workItemLabelSnapshot: title,
      },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      oneOffIds.push(existing.id);
      continue;
    }
    const created = await createOneOff(session, {
      client: db,
      actor: {
        userId: manager.userId,
        employeeId: people.manager.employeeId,
        label: "Canonical manager",
        authenticationMethod: "PASSWORD",
      },
      work: {
        facilityId,
        departmentId,
        operationalDate: effectiveFrom,
        unitId: room.unitId,
        spaceId: room.id,
        title,
        instructions: WORK_INSTRUCTIONS,
        priority: "ROUTINE",
        assignedEmployeeId: people.worker.employeeId,
      },
    });
    oneOffIds.push(created.id);
  }

  // Isolated historical WORK_PLAN occurrence for legacy command compatibility only.
  // Not advertised by new offline presentation; not created via Work Plan publish.
  const legacyOccurrenceKey = buildOccurrenceKey({
    sourceKind: "WORK_PLAN",
    workPlanStableKey: `legacy_offline_${tag}`,
    workPlanVersion: 1,
    workItemKey: "legacy_opening",
    operationalDate: effectiveFrom,
    unitId: room.unitId,
    spaceId: room.id,
    windowStartLocal: null,
    windowEndLocal: null,
    employeeId: null,
  });
  let legacyWorkPlanOccurrence = await db.departmentWorkOccurrence.findFirst({
    where: { facilityId, departmentId, occurrenceKey: legacyOccurrenceKey },
  });
  if (!legacyWorkPlanOccurrence) {
    legacyWorkPlanOccurrence = await db.departmentWorkOccurrence.create({
      data: {
        id: cuidLike(),
        facilityId,
        departmentId,
        occurrenceKey: legacyOccurrenceKey,
        sourceKind: "WORK_PLAN",
        operationalDate,
        workPlanId: null,
        workPlanStableKey: `legacy_offline_${tag}`,
        workPlanVersion: 1,
        workItemId: null,
        workItemKey: "legacy_opening",
        workItemLabelSnapshot: `Legacy plan work ${tag}`,
        instructionsSnapshot:
          "Historical plan-derived occurrence for sync compatibility only.",
        priority: "ROUTINE",
        completionMode: "EXPLICIT_CONFIRMATION",
        responsibilityMode: "UNIT_SHARED",
        unitId: room.unitId,
        spaceId: room.id,
        status: "OPEN",
        assignedEmployeeId: people.worker.employeeId,
        createdByUserId: manager.userId,
        authenticationMethod: "PASSWORD",
      },
    });
  }

  // Optional Records attachment when a published Catalog definition exists and flag is on.
  let logAttachmentId = null;
  try {
    const { isCanonicalLogsEnabled } = await tsImport(
      "../../src/lib/feature-flags.ts",
      import.meta.url,
    );
    if (isCanonicalLogsEnabled()) {
      const catalog = await db.catalogLogDefinition.findFirst({
        where: { status: "PUBLISHED", purposeType: "LOG" },
        orderBy: [{ stableKey: "asc" }, { version: "desc" }],
      });
      if (catalog) {
        const { createLogAttachment } = await tsImport(
          "../../src/lib/canonical-logs/attachment-service.ts",
          import.meta.url,
        );
        const attachment = await createLogAttachment(db, {
          facilityId,
          departmentId,
          catalogDefinitionId: catalog.id,
          target: { kind: "SPACE", spaceId: room.id },
          timingMode: "AD_HOC",
          allowAdHoc: true,
          effectiveFromKey: effectiveFrom,
          localDisplayLabel: `Canonical offline ${tag} log`,
        });
        logAttachmentId = attachment.id;
      }
    }
  } catch (err) {
    // Records are optional for SPACE Work/Key Point offline CI-gate. Log and continue.
    console.warn(
      `canonical-offline-fixtures: Records attachment skipped — ${String(err?.message || err)}`,
    );
  }

  return {
    facilityId,
    departmentId,
    unitId: room.unitId,
    spaceId: room.id,
    /** Location Function profiles are retired — always null after Phase 2C R3. */
    profileId: null,
    cycleId: cycle.id,
    keyPointId: keyPoint.id,
    cycleStableKey: stableKey,
    /** Primary ONE_OFF occurrence id (field name retained for Playwright fixture consumers). */
    workPlanId: oneOffIds[0],
    workLabel,
    oneOffOccurrenceIds: oneOffIds,
    legacyWorkPlanOccurrenceId: legacyWorkPlanOccurrence.id,
    logAttachmentId,
    people,
  };
}
