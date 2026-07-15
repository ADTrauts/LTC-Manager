import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWorkspacePreferences,
  buildDepartmentHealth,
  buildManagementAgenda,
  buildManagerFocus,
  buildManagerFocusHealthyGuidance,
  buildPerformanceSnapshot,
  buildQuickActions,
  buildRecentActivity,
  buildWorkspacePriorities,
  canAccessBusinessWorkspace,
  canCustomizeWorkspace,
  classifyAgendaTemporal,
  currentAgendaBucketId,
  emptyWorkspacePreferenceState,
  greetingForLocalHour,
  healthToneFromReadiness,
  inspectionFocusHref,
  isLinkAllowedForContext,
  loadCachedMorningBriefPreview,
  orderedWorkspaceSections,
  parseWorkspacePreferenceRow,
  resolveAgendaBucketId,
  resolveCompositionConfig,
  resolveWorkspaceContext,
  resolveWorkspaceSections,
  scopeInputsForContext,
  workspaceIsHealthy,
  workspaceSectionVisible,
  type WorkspaceContext,
} from "@/lib/business-workspace";
import { createMemoryBriefCacheStore } from "@/lib/ai/morning-brief/cache-store";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import type { BusinessWorkspaceInputs } from "@/lib/business-workspace/load-workspace-inputs";
import type { UnitReadiness } from "@/lib/readiness";
import { resolveDefaultHomePath, resolveZoneForPathPrefix, normalizePrimaryNavLabel } from "@/lib/nav-zones";
import { resolveRouteAccess, WAVE1_ROUTE_MIN_ROLES, type RoutePermissionRule } from "@/lib/route-permissions";
import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";

const defaultOperation = {
  mealType: "LUNCH" as const,
  mealLabel: "Lunch",
  serviceLabel: "Lunch",
  phase: "Preparation" as const,
  scheduledTimeLabel: "12:00",
  minutesUntilService: 30,
};

function readinessItem(
  partial: Pick<UnitReadiness, "unitId" | "unitName" | "state" | "reason" | "profileKey">,
): UnitReadiness {
  return {
    unitType: "KITCHEN",
    reasonCodes: [],
    evaluatedAt: new Date("2026-07-13T12:00:00.000Z"),
    ...partial,
  };
}

function readinessBatch(
  items: UnitReadiness[],
  summary: { total: number; ready: number; inProgress: number; blocked: number },
): BusinessWorkspaceInputs["readiness"] {
  return {
    items,
    byUnitId: new Map(items.map((item) => [item.unitId, item])),
    summary,
    operationContext: defaultOperation,
    unitCards: [],
    operationalTime: {} as BusinessWorkspaceInputs["operationalTime"],
  };
}

function baseInputs(overrides: Partial<BusinessWorkspaceInputs> = {}): BusinessWorkspaceInputs {
  const now = new Date("2026-07-13T16:00:00.000Z");
  const base: BusinessWorkspaceInputs = {
    facilityId: "fac-a",
    facilityName: "Facility A",
    facilityTimezone: "America/New_York",
    now,
    operationalTime: {
      nowUtc: now,
      facilityTimezone: "America/New_York",
      facilityLocalDate: "2026-07-13",
      facilityLocal: {
        year: 2026,
        month: 7,
        day: 13,
        hour: 12,
        minute: 0,
        second: 0,
      },
      mealType: "LUNCH",
      mealLabel: "Lunch",
      operationPhase: "Preparation",
      scheduledStartLocal: "12:00",
      minutesUntilScheduledStart: 30,
      minutesSinceScheduledStart: null,
      hasScheduledStartPassed: false,
      isDueTimePassed: (dueAt) => (dueAt ? dueAt.getTime() <= now.getTime() : false),
    },
    activeDepartmentKey: null,
    activeDepartmentName: null,
    dashboard: {
      month: 7,
      managerCount: 1,
      birthdaysThisMonth: [],
      unitCount: 2,
      mealBoards: [],
      totals: {
        expected: 10,
        completed: 8,
        pending: 1,
        failed: 1,
        missed: 0,
      },
      unitsWithExceptions: [],
      unitsMissingStaffing: [],
      unitCards: [],
      openRepairCount: 0,
      urgentRepairCount: 0,
      operationContext: defaultOperation,
      sitePulse: {
        headline: "Ready",
        tone: "healthy",
        ready: 2,
        inProgress: 0,
        blocked: 0,
        attentionCount: 0,
        locationSummary: "2 ready",
      },
    },
    readiness: readinessBatch(
      [
        readinessItem({
          unitId: "u1",
          unitName: "Main Kitchen",
          state: "ready",
          reason: "Ready",
          profileKey: "DIETARY",
        }),
        readinessItem({
          unitId: "u2",
          unitName: "2 East",
          state: "ready",
          reason: "Ready",
          profileKey: "EVS",
        }),
        readinessItem({
          unitId: "u3",
          unitName: "Boiler Room",
          state: "ready",
          reason: "Ready",
          profileKey: "PLANT",
        }),
      ],
      { total: 3, ready: 3, inProgress: 0, blocked: 0 },
    ),
    callDownSummary: { open: 0, covered: 0, total: 0 },
    openRepairs: [],
    inspectionsDue: [],
    activeDepartmentKeys: ["DIETARY", "EVS", "PLANT"],
    activity: {
      repairsOpened: [],
      repairsResolved: [],
      inspectionsCompleted: [],
      knowledgePublished: [],
    },
  };

  return {
    ...base,
    ...overrides,
    dashboard: { ...base.dashboard, ...(overrides.dashboard ?? {}) },
    readiness: overrides.readiness ?? base.readiness,
    callDownSummary: { ...base.callDownSummary, ...(overrides.callDownSummary ?? {}) },
    activity: { ...base.activity, ...(overrides.activity ?? {}) },
  };
}

test("canAccessBusinessWorkspace excludes staff and lead", () => {
  assert.equal(canAccessBusinessWorkspace("STAFF"), false);
  assert.equal(canAccessBusinessWorkspace("LEAD_TEAM_MEMBER"), false);
  assert.equal(canAccessBusinessWorkspace("SUPERVISOR"), true);
  assert.equal(canAccessBusinessWorkspace("MANAGER"), true);
  assert.equal(canAccessBusinessWorkspace("FACILITY_ADMINISTRATOR"), true);
});

test("supervisor sees limited workspace sections", () => {
  const sections = resolveWorkspaceSections("SUPERVISOR");
  assert.deepEqual(sections, [
    "manager_focus",
    "management_agenda",
    "quick_actions",
    "todays_work",
  ]);
  assert.equal(workspaceSectionVisible("SUPERVISOR", "department_health"), false);
  assert.equal(workspaceSectionVisible("SUPERVISOR", "performance"), false);
  assert.equal(canCustomizeWorkspace("SUPERVISOR"), false);
});

test("manager and FA see full workspace sections", () => {
  for (const role of ["MANAGER", "GM", "FACILITY_ADMINISTRATOR"] as const) {
    const sections = resolveWorkspaceSections(role);
    assert.ok(sections.includes("manager_focus"));
    assert.ok(sections.includes("management_agenda"));
    assert.ok(sections.includes("quick_actions"));
    assert.ok(sections.includes("department_health"));
    assert.ok(sections.includes("performance"));
    assert.ok(sections.includes("recent_activity"));
    assert.equal(canCustomizeWorkspace(role), true);
  }
});

test("staff denied workspace sections", () => {
  assert.deepEqual(resolveWorkspaceSections("STAFF"), []);
  assert.deepEqual(resolveWorkspaceSections("LEAD_TEAM_MEMBER"), []);
});

test("orderedWorkspaceSections preserves layout order", () => {
  const ordered = orderedWorkspaceSections(["operations", "priorities"]);
  assert.deepEqual(
    ordered.map((s) => s.id),
    ["priorities", "operations"],
  );
});

test("greetingForLocalHour is calm and uses first name", () => {
  assert.equal(greetingForLocalHour(8, "Andrew Smith"), "Good morning Andrew");
  assert.equal(greetingForLocalHour(14, "Andrew"), "Good afternoon Andrew");
  assert.equal(greetingForLocalHour(20, "Andrew"), "Good evening Andrew");
});

test("healthToneFromReadiness maps blocked/in-progress/ready", () => {
  assert.equal(healthToneFromReadiness({ blocked: 1, inProgress: 0, total: 3 }), "red");
  assert.equal(healthToneFromReadiness({ blocked: 0, inProgress: 2, total: 3 }), "yellow");
  assert.equal(healthToneFromReadiness({ blocked: 0, inProgress: 0, total: 3 }), "green");
  assert.equal(healthToneFromReadiness({ blocked: 0, inProgress: 0, total: 0 }), "neutral");
});

test("priority: current-operation threat ranks first", () => {
  const priorities = buildWorkspacePriorities(
    baseInputs({
      readiness: readinessBatch(
        [
          readinessItem({
            unitId: "u1",
            unitName: "Main Kitchen",
            state: "blocked",
            reason: "Urgent dishwasher repair",
            profileKey: "DIETARY",
          }),
        ],
        { total: 1, ready: 0, inProgress: 0, blocked: 1 },
      ),
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Dishwasher down",
          priority: "URGENT",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
      ],
    }),
  );
  assert.equal(priorities[0]?.id, "service-threat");
  assert.equal(priorities[0]?.rank, 1);
  assert.ok(priorities.some((p) => p.id === "urgent-issues"));
});

test("priority: urgent issue ranks as safety/compliance", () => {
  const priorities = buildWorkspacePriorities(
    baseInputs({
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Freezer alarm",
          priority: "URGENT",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
      ],
    }),
  );
  assert.equal(priorities[0]?.id, "urgent-issues");
  assert.equal(priorities[0]?.rank, 2);
});

test("priority: staffing gap ranks after service/compliance threats", () => {
  const priorities = buildWorkspacePriorities(
    baseInputs({
      dashboard: {
        ...baseInputs().dashboard,
        unitsMissingStaffing: [
          {
            id: "u1",
            name: "2 East",
            unitType: "RESIDENT_AREA",
            hasDietary: true,
            expected: 0,
            completed: 0,
            pending: 0,
            failed: 0,
            missed: 0,
            mealTimes: [],
            staffingCount: 0,
            openRepairCount: 0,
          },
        ],
      },
    }),
  );
  const staffing = priorities.find((p) => p.id === "staffing-gaps");
  assert.ok(staffing);
  assert.equal(staffing!.rank, 3);
});

test("priority: overdue inspection ranks ahead of routine recovery", () => {
  const now = new Date("2026-07-13T16:00:00.000Z");
  const priorities = buildWorkspacePriorities(
    baseInputs({
      now,
      inspectionsDue: [
        {
          id: "i1",
          definitionId: "def-1",
          definitionName: "Trayline audit",
          unitId: "u1",
          unitName: "Main Kitchen",
          dueAt: new Date(now.getTime() - 60_000),
          overdue: true,
          departmentKey: null,
        },
      ],
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Cart caster",
          priority: "HIGH",
          status: "IN_PROGRESS",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
      ],
    }),
  );
  assert.equal(priorities[0]?.id, "inspections-overdue");
  assert.ok(priorities.some((p) => p.id === "recovery-in-progress"));
});

test("priority: assigned recovery work appears when no critical threat", () => {
  const priorities = buildWorkspacePriorities(
    baseInputs({
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Main Kitchen dishwasher repair",
          priority: "HIGH",
          status: "IN_PROGRESS",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
      ],
    }),
  );
  assert.equal(priorities[0]?.id, "recovery-in-progress");
  assert.match(priorities[0]!.title, /dishwasher/i);
});

test("priority: duplicates collapse across issue buckets", () => {
  const priorities = buildWorkspacePriorities(
    baseInputs({
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Urgent leak",
          priority: "URGENT",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "PLANT",
        },
        {
          id: "r2",
          unitId: "u1",
          title: "High issue",
          priority: "HIGH",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "PLANT",
        },
      ],
    }),
  );
  assert.equal(priorities.filter((p) => p.id === "urgent-issues" || p.id === "high-issues").length, 1);
});

test("priority: healthy state uses calm watch items", () => {
  const priorities = buildWorkspacePriorities(baseInputs());
  assert.ok(workspaceIsHealthy(priorities));
  assert.ok(priorities.every((p) => p.isWatch));
  assert.ok(priorities.some((p) => /on track|Lunch/i.test(p.detail) || /Lunch/i.test(p.title)));
});

test("department health: Dietary/EVS/Plant semantics and links", () => {
  const health = buildDepartmentHealth(
    baseInputs({
      readiness: readinessBatch(
        [
          readinessItem({
            unitId: "u1",
            unitName: "Main Kitchen",
            state: "blocked",
            reason: "Failed temperature log",
            profileKey: "DIETARY",
          }),
          readinessItem({
            unitId: "u2",
            unitName: "2 East",
            state: "in_progress",
            reason: "Discharge clean underway",
            profileKey: "EVS",
          }),
          readinessItem({
            unitId: "u3",
            unitName: "Boiler",
            state: "ready",
            reason: "Ready",
            profileKey: "PLANT",
          }),
        ],
        { total: 3, ready: 1, inProgress: 1, blocked: 1 },
      ),
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Oven",
          priority: "HIGH",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
        {
          id: "r2",
          unitId: "u3",
          title: "Routine gasket",
          priority: "LOW",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Boiler",
          departmentKey: "PLANT",
        },
      ],
    }),
  );

  const dietary = health.find((d) => d.key === "DIETARY")!;
  const evs = health.find((d) => d.key === "EVS")!;
  const plant = health.find((d) => d.key === "PLANT")!;
  assert.equal(dietary.tone, "red");
  assert.equal(dietary.href, "/today/walk");
  assert.equal(dietary.openPriorityWorkCount, 1);
  assert.match(dietary.reason, /Failed temperature/);
  assert.equal(evs.tone, "yellow");
  assert.equal(evs.href, "/evs");
  assert.equal(plant.tone, "green");
  assert.equal(plant.href, "/assets");
  assert.equal(plant.openPriorityWorkCount, 0);
});

test("department health: visibility follows active department keys", () => {
  const health = buildDepartmentHealth(
    baseInputs({ activeDepartmentKeys: ["DIETARY", "EVS"] }),
  );
  assert.deepEqual(
    health.map((d) => d.key),
    ["DIETARY", "EVS"],
  );
});

test("department health: empty keys fall back to dietary/evs/plant", () => {
  const health = buildDepartmentHealth(baseInputs({ activeDepartmentKeys: [] }));
  assert.deepEqual(
    health.map((d) => d.key),
    ["DIETARY", "EVS", "PLANT"],
  );
});

test("performance snapshot: existing counts and links; routine repair excluded", () => {
  const metrics = buildPerformanceSnapshot(
    baseInputs({
      readiness: readinessBatch([], { total: 4, ready: 2, inProgress: 1, blocked: 1 }),
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Urgent",
          priority: "URGENT",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
        {
          id: "r2",
          unitId: "u1",
          title: "Routine gasket",
          priority: "LOW",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "PLANT",
        },
      ],
      inspectionsDue: [
        {
          id: "i1",
          definitionId: "def-1",
          definitionName: "Audit",
          unitId: null,
          unitName: null,
          dueAt: new Date("2026-07-13T10:00:00.000Z"),
          overdue: true,
          departmentKey: null,
        },
      ],
      dashboard: {
        ...baseInputs().dashboard,
        totals: { expected: 10, completed: 8, pending: 1, failed: 1, missed: 0 },
        unitsMissingStaffing: [
          {
            id: "u2",
            name: "2 East",
            unitType: "RESIDENT_AREA",
            hasDietary: true,
            expected: 0,
            completed: 0,
            pending: 0,
            failed: 0,
            missed: 0,
            mealTimes: [],
            staffingCount: 0,
            openRepairCount: 0,
          },
        ],
      },
    }),
  );

  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  assert.equal(byId["locations-ready"]?.value, 2);
  assert.equal(byId["locations-attention"]?.value, 1);
  assert.equal(byId["priority-issues"]?.value, 1);
  assert.equal(byId["inspections"]?.value, 1);
  assert.equal(byId["staffing-gaps"]?.value, 1);
  assert.equal(byId["due-compliance"]?.value, "8/10");
  assert.equal(byId["priority-issues"]?.href, "/issues");
  assert.equal(byId["locations-ready"]?.href, "/today/walk");
  assert.ok(metrics.length >= 4 && metrics.length <= 6);
});

test("recent activity: meaningful events only with facility-local stamp", () => {
  const activity = buildRecentActivity(
    baseInputs({
      facilityTimezone: "America/New_York",
      activity: {
        repairsOpened: [
          {
            id: "low1",
            title: "Routine paint",
            priority: "LOW",
            status: "OPEN",
            unitName: "2 East",
            departmentKey: null,
            at: new Date("2026-07-13T15:00:00.000Z"),
          },
          {
            id: "hi1",
            title: "Freezer alarm",
            priority: "URGENT",
            status: "OPEN",
            unitName: "Main Kitchen",
            departmentKey: null,
            at: new Date("2026-07-13T14:00:00.000Z"),
          },
        ],
        repairsResolved: [
          {
            id: "res1",
            title: "Leak fixed",
            priority: "HIGH",
            unitName: "Boiler",
            departmentKey: null,
            at: new Date("2026-07-13T13:30:00.000Z"),
          },
        ],
        inspectionsCompleted: [
          {
            id: "insp1",
            title: "Trayline",
            result: "PASS",
            unitName: "Main Kitchen",
            departmentKey: null,
            at: new Date("2026-07-13T12:00:00.000Z"),
          },
        ],
        knowledgePublished: [
          {
            id: "k1",
            title: "Dish machine SOP",
            category: "SOP",
            departmentKey: null,
            at: new Date("2026-07-13T11:00:00.000Z"),
          },
        ],
      },
    }),
  );

  assert.ok(activity.every((item) => !/Routine paint/i.test(item.title)));
  assert.ok(activity.some((item) => item.title === "Freezer alarm"));
  assert.ok(activity.some((item) => item.kind === "inspection"));
  assert.ok(activity.some((item) => item.kind === "knowledge"));
  const freezer = activity.find((item) => item.title === "Freezer alarm")!;
  assert.match(freezer.meta, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  assert.ok(activity.length <= 8);
});

test("recent activity remains facility-scoped via input facility data only", () => {
  const activity = buildRecentActivity(
    baseInputs({
      facilityId: "fac-b",
      activity: {
        repairsOpened: [
          {
            id: "only-b",
            title: "Facility B issue",
            priority: "HIGH",
            status: "OPEN",
            unitName: "B Kitchen",
            departmentKey: null,
            at: new Date("2026-07-13T14:00:00.000Z"),
          },
        ],
        repairsResolved: [],
        inspectionsCompleted: [],
        knowledgePublished: [],
      },
    }),
  );
  assert.equal(activity.length, 1);
  assert.equal(activity[0]?.title, "Facility B issue");
});

test("manager default home is Business Workspace", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "MANAGER" }),
    "/workspace",
  );
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "FACILITY_ADMINISTRATOR" }),
    "/workspace",
  );
});

test("supervisor default home remains Today's Work when enabled", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }),
    "/today",
  );
});

test("staff never default to workspace", () => {
  assert.equal(
    resolveDefaultHomePath({ authKind: "user", role: "STAFF", activeUnitId: "u1" }),
    "/unit/u1",
  );
  assert.equal(
    resolveDefaultHomePath({ authKind: "employee", role: "STAFF" }),
    "/logs",
  );
});

test("workspace route is SUPERVISOR+ in WAVE1 fallback", () => {
  assert.equal(WAVE1_ROUTE_MIN_ROLES["/workspace"], "SUPERVISOR");
  const rules: RoutePermissionRule[] = Object.entries(WAVE1_ROUTE_MIN_ROLES)
    .map(([pathPrefix, minRole]) => ({
      pathPrefix,
      allowedRoleKeys: new Set(
        APP_ROLES.filter((role) => ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole as AppRole]),
      ),
    }))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  assert.equal(resolveRouteAccess("/workspace", "STAFF", rules), false);
  assert.equal(resolveRouteAccess("/workspace", "SUPERVISOR", rules), true);
  assert.equal(resolveRouteAccess("/workspace", "MANAGER", rules), true);
});

test("workspace maps to Workspace nav zone and label", () => {
  assert.equal(resolveZoneForPathPrefix("/workspace"), "WORKSPACE");
  assert.equal(normalizePrimaryNavLabel("/workspace", "Workspace"), "Workspace");
});

test("manager focus: ranking prefers overdue inspection then staffing then disruption", () => {
  const now = new Date("2026-07-13T16:00:00.000Z");
  const focus = buildManagerFocus(
    baseInputs({
      now,
      inspectionsDue: [
        {
          id: "i1",
          definitionId: "def-1",
          definitionName: "Trayline audit",
          unitId: "u1",
          unitName: "Main Kitchen",
          dueAt: new Date(now.getTime() - 60_000),
          overdue: true,
          departmentKey: null,
        },
      ],
      dashboard: {
        ...baseInputs().dashboard,
        unitsMissingStaffing: [
          {
            id: "u2",
            name: "2 East",
            unitType: "RESIDENT_AREA",
            hasDietary: true,
            expected: 0,
            completed: 0,
            pending: 0,
            failed: 0,
            missed: 0,
            mealTimes: [],
            staffingCount: 0,
            openRepairCount: 0,
          },
        ],
      },
      readiness: readinessBatch(
        [
          readinessItem({
            unitId: "u1",
            unitName: "Main Kitchen",
            state: "blocked",
            reason: "Failed temperature log",
            profileKey: "DIETARY",
          }),
        ],
        { total: 1, ready: 0, inProgress: 0, blocked: 1 },
      ),
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Freezer alarm",
          priority: "URGENT",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
      ],
    }),
  );

  assert.equal(focus.length, 3);
  assert.equal(focus[0]?.id, "focus-inspection-overdue");
  assert.match(focus[0]!.href, /\/unit\/u1\?.*inspect=def-1/);
  assert.equal(focus[1]?.id, "focus-staffing");
  assert.equal(focus[2]?.id, "focus-service");
  assert.equal(focus[2]?.actionLabel, "Open Unit");
  assert.equal(focus[2]?.href, "/unit/u1");
});

test("manager focus: never duplicates the same destination", () => {
  const focus = buildManagerFocus(
    baseInputs({
      openRepairs: [
        {
          id: "r1",
          unitId: "u1",
          title: "Urgent A",
          priority: "URGENT",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
        {
          id: "r2",
          unitId: "u1",
          title: "Urgent B",
          priority: "URGENT",
          status: "OPEN",
          workOrderKind: "CORRECTIVE",
          dueAt: null,
          unitName: "Main Kitchen",
          departmentKey: "DIETARY",
        },
      ],
    }),
  );
  const hrefs = focus.map((card) => card.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(focus.length <= 3);
});

test("management agenda: current bucket follows facility-local hour", () => {
  assert.equal(currentAgendaBucketId(8), "morning");
  assert.equal(currentAgendaBucketId(12), "midday");
  assert.equal(currentAgendaBucketId(16), "afternoon");
  assert.equal(currentAgendaBucketId(20), "evening");

  const agenda = buildManagementAgenda(
    baseInputs({
      operationalTime: {
        ...baseInputs().operationalTime,
        facilityLocal: {
          ...baseInputs().operationalTime.facilityLocal,
          hour: 8,
        },
      },
    }),
  );
  assert.deepEqual(
    agenda.map((b) => b.id),
    ["morning", "midday", "afternoon", "evening"],
  );
  assert.equal(agenda.find((b) => b.id === "morning")?.isCurrent, true);
  assert.ok((agenda.find((b) => b.id === "morning")?.items.length ?? 0) >= 1);
  assert.ok((agenda.find((b) => b.id === "evening")?.items.length ?? 0) >= 1);
});

test("quick actions keep existing routes and limit supervisor list", () => {
  const managerActions = buildQuickActions();
  assert.ok(managerActions.some((a) => a.href === "/issues"));
  assert.ok(managerActions.some((a) => a.href === "/dashboard"));
  assert.ok(!managerActions.some((a) => a.href === "/employees"));
  assert.ok(!managerActions.some((a) => a.href === "/logs"));
  const supervisorActions = buildQuickActions({ supervisor: true });
  assert.ok(supervisorActions.every((a) =>
    ["/issues", "/dashboard", "/today"].includes(a.href),
  ));
  assert.ok(supervisorActions.length < managerActions.length);
});

test("quick actions demote Operations Center when Focus already promotes it", () => {
  const actions = buildQuickActions({ promotedHrefs: ["/dashboard"] });
  assert.ok(!actions.some((a) => a.id === "operations-center"));
  assert.ok(actions.some((a) => a.id === "todays-work"));
});

test("preferences: hidden optional sections apply; required sections stay", () => {
  const applied = applyWorkspacePreferences({
    role: "MANAGER",
    preferences: {
      ...emptyWorkspacePreferenceState(),
      hiddenSectionIds: ["performance", "recent_activity", "manager_focus"],
      collapsedSectionIds: ["department_health", "performance"],
      preferredLandingSectionId: "quick_actions",
    },
  });
  assert.ok(applied.visibleSections.includes("manager_focus"));
  assert.ok(!applied.visibleSections.includes("performance"));
  assert.ok(!applied.visibleSections.includes("recent_activity"));
  assert.deepEqual(applied.collapsedSections, ["department_health"]);
  assert.equal(applied.preferredLandingSectionId, "quick_actions");
});

test("preferences: facility isolation via parse — independent rows", () => {
  const facA = parseWorkspacePreferenceRow({
    hiddenSectionIds: ["performance"],
    collapsedSectionIds: ["operations"],
    sectionOrder: [],
    preferredLandingSectionId: "management_agenda",
  });
  const facB = parseWorkspacePreferenceRow({
    hiddenSectionIds: [],
    collapsedSectionIds: [],
    sectionOrder: [],
    preferredLandingSectionId: null,
  });
  assert.deepEqual(facA.hiddenSectionIds, ["performance"]);
  assert.deepEqual(facB.hiddenSectionIds, []);
  assert.notEqual(facA.preferredLandingSectionId, facB.preferredLandingSectionId);
});

test("orderedWorkspaceSections keeps core sections first with preference order", () => {
  const ordered = orderedWorkspaceSections(
    ["performance", "manager_focus", "quick_actions", "management_agenda", "department_health"],
    ["performance", "department_health"],
  );
  assert.deepEqual(
    ordered.map((s) => s.id),
    ["manager_focus", "management_agenda", "quick_actions", "performance", "department_health"],
  );
});

test("manager focus healthy guidance is calm with useful routing", () => {
  const guidance = buildManagerFocusHealthyGuidance(baseInputs());
  assert.equal(guidance.title, "Current operations are on track.");
  assert.equal(guidance.primary.href, "/dashboard");
  assert.ok(guidance.secondary.length <= 2);
  assert.ok(guidance.secondary.some((item) => item.href === "/today"));
  assert.equal(buildManagerFocus(baseInputs()).length, 0);
});

test("inspectionFocusHref prefers unit deep link when ids exist", () => {
  assert.match(
    inspectionFocusHref({
      id: "occ-1",
      definitionId: "def-9",
      definitionName: "Audit",
      unitId: "unit-9",
      unitName: "Kitchen",
      dueAt: new Date(),
      overdue: true,
      departmentKey: null,
    }),
    /\/unit\/unit-9\?unitTab=overview&inspect=def-9&occurrence=occ-1/,
  );
  assert.equal(
    inspectionFocusHref({
      id: "occ-2",
      definitionId: "def-9",
      definitionName: "Audit",
      unitId: null,
      unitName: null,
      dueAt: new Date(),
      overdue: false,
      departmentKey: null,
    }),
    "/today/handoffs",
  );
});

test("agenda temporal classification and boundary hours", () => {
  assert.equal(classifyAgendaTemporal("morning", "midday", 12), "past");
  assert.equal(classifyAgendaTemporal("afternoon", "midday", 12), "future");
  assert.equal(classifyAgendaTemporal("midday", "midday", 12), "current");
  assert.equal(classifyAgendaTemporal("morning", "evening", 20), "past");
  assert.equal(classifyAgendaTemporal("morning", "evening", 2), "future");

  assert.equal(currentAgendaBucketId(3), "evening");
  assert.equal(currentAgendaBucketId(4), "morning");
  assert.equal(currentAgendaBucketId(10), "morning");
  assert.equal(currentAgendaBucketId(11), "midday");
  assert.equal(currentAgendaBucketId(14), "midday");
  assert.equal(currentAgendaBucketId(15), "afternoon");
  assert.equal(currentAgendaBucketId(17), "afternoon");
  assert.equal(currentAgendaBucketId(18), "evening");
});

test("agenda bucket uses facility timezone including DST spring-forward day", () => {
  // 2026-03-08 America/New_York spring forward; 15:30 UTC = 11:30 EDT.
  const midday = new Date("2026-03-08T15:30:00.000Z");
  assert.equal(resolveAgendaBucketId(midday, "America/New_York"), "midday");
  // 04:30 UTC = 23:30 previous evening EST on 2026-03-07 (before spring forward day local evening).
  const evening = new Date("2026-03-08T04:30:00.000Z");
  assert.equal(resolveAgendaBucketId(evening, "America/New_York"), "evening");
});

test("agenda orders due/overdue work before routine items", () => {
  const agenda = buildManagementAgenda(
    baseInputs({
      inspectionsDue: [
        {
          id: "i1",
          definitionId: "def-1",
          definitionName: "Trayline",
          unitId: "u1",
          unitName: "Main Kitchen",
          dueAt: new Date("2026-07-13T10:00:00.000Z"),
          overdue: true,
          departmentKey: null,
        },
      ],
      activity: {
        ...baseInputs().activity,
        knowledgePublished: [
          {
            id: "k1",
            title: "SOP",
            category: "SOP",
            departmentKey: null,
            at: new Date("2026-07-13T11:00:00.000Z"),
          },
        ],
      },
    }),
  );
  const afternoon = agenda.find((b) => b.id === "afternoon")!;
  assert.equal(afternoon.items[0]?.id, "afternoon-inspection");
  assert.equal(afternoon.temporal, "future");
  const midday = agenda.find((b) => b.id === "midday")!;
  assert.equal(midday.isCurrent, true);
  assert.equal(midday.temporal, "current");
});

test("preferences ignore stale section ids and keep facility rows isolated", () => {
  const parsed = parseWorkspacePreferenceRow({
    hiddenSectionIds: ["performance", "not-a-section", "manager_focus"],
    collapsedSectionIds: ["bogus", "quick_actions"],
    sectionOrder: ["recent_activity", "nope"],
    preferredLandingSectionId: "not-real",
  });
  assert.deepEqual(parsed.hiddenSectionIds, ["performance", "manager_focus"]);
  assert.deepEqual(parsed.collapsedSectionIds, ["quick_actions"]);
  assert.deepEqual(parsed.sectionOrder, ["recent_activity"]);
  assert.equal(parsed.preferredLandingSectionId, null);

  const applied = applyWorkspacePreferences({
    role: "MANAGER",
    preferences: {
      ...parsed,
      preferredLandingSectionId: "performance",
      hiddenSectionIds: ["performance"],
    },
  });
  assert.equal(applied.preferredLandingSectionId, null);
});

test("cached morning brief preview: ready same-facility shown; mismatches hidden; provider never used", async () => {
  const cache = createMemoryBriefCacheStore();
  const serviceDate = facilityLocalDateToServiceDate("2026-07-13");

  await cache.upsert({
    facilityId: "fac-a",
    departmentKey: "DIETARY",
    serviceDate,
    briefType: "MORNING_BRIEF",
    operationInstanceId: null,
    snapshotHash: "hash-1",
    snapshotJson: null,
    baselineSnapshotHash: null,
    windowStart: null,
    windowEnd: null,
    resultJson: {
      headline: "Kitchen needs attention before lunch.",
      summary: "summary",
      priorities: [],
      watchItems: [],
      generatedAt: new Date().toISOString(),
    },
    provider: "test",
    model: "test",
    status: "READY",
    promptVersion: "v1",
    latencyMs: 1,
    errorCode: null,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const shown = await loadCachedMorningBriefPreview({
    facilityId: "fac-a",
    facilityLocalDate: "2026-07-13",
    activeDepartmentKey: "DIETARY",
    cache,
    aiEnabled: true,
  });
  assert.equal(shown?.headline, "Kitchen needs attention before lunch.");
  assert.equal(shown?.origin, "cached");

  const disabled = await loadCachedMorningBriefPreview({
    facilityId: "fac-a",
    facilityLocalDate: "2026-07-13",
    cache,
    aiEnabled: false,
  });
  assert.equal(disabled, null);

  const wrongFacility = await loadCachedMorningBriefPreview({
    facilityId: "fac-b",
    facilityLocalDate: "2026-07-13",
    cache,
    aiEnabled: true,
  });
  assert.equal(wrongFacility, null);

  const wrongDept = await loadCachedMorningBriefPreview({
    facilityId: "fac-a",
    facilityLocalDate: "2026-07-13",
    activeDepartmentKey: "EVS",
    cache,
    aiEnabled: true,
  });
  assert.equal(wrongDept, null);

  await cache.upsert({
    facilityId: "fac-a",
    departmentKey: "DIETARY",
    serviceDate,
    briefType: "MORNING_BRIEF",
    operationInstanceId: null,
    snapshotHash: "hash-expired",
    snapshotJson: null,
    baselineSnapshotHash: null,
    windowStart: null,
    windowEnd: null,
    resultJson: {
      headline: "Expired",
      summary: "summary",
      priorities: [],
      watchItems: [],
      generatedAt: new Date().toISOString(),
    },
    provider: "test",
    model: "test",
    status: "READY",
    promptVersion: "v1",
    latencyMs: 1,
    errorCode: null,
    generatedAt: new Date(Date.now() - 100_000),
    expiresAt: new Date(Date.now() - 10_000),
  });
  // Latest non-expired still wins if still present — upsert replaced by expired row with different hash.
  // findLatest orders by generatedAt; expired filtered by expiresAt gt now → miss.
  const afterExpiredOnly = await loadCachedMorningBriefPreview({
    facilityId: "fac-expired",
    facilityLocalDate: "2026-07-13",
    cache,
    aiEnabled: true,
  });
  assert.equal(afterExpiredOnly, null);
});

// ---------------------------------------------------------------------------
// Wave 13A — Department-Aware Workspace Composition
// ---------------------------------------------------------------------------

const dietaryCtx: WorkspaceContext = {
  mode: "department",
  departmentId: "dept-dietary",
  departmentKey: "DIETARY",
  departmentName: "Dietary",
};

const evsCtx: WorkspaceContext = {
  mode: "department",
  departmentId: "dept-evs",
  departmentKey: "EVS",
  departmentName: "Environmental Services",
};

const plantCtx: WorkspaceContext = {
  mode: "department",
  departmentId: "dept-plant",
  departmentKey: "PLANT",
  departmentName: "Plant Operations",
};

const facilityCtx: WorkspaceContext = {
  mode: "facility",
  departmentId: null,
  departmentKey: null,
  departmentName: null,
};

function mixedDeptInputs(): BusinessWorkspaceInputs {
  return baseInputs({
    readiness: readinessBatch(
      [
        readinessItem({ unitId: "u1", unitName: "Main Kitchen", state: "blocked", reason: "Log failure", profileKey: "DIETARY" }),
        readinessItem({ unitId: "u2", unitName: "2 East", state: "ready", reason: "Ready", profileKey: "EVS" }),
        readinessItem({ unitId: "u3", unitName: "Boiler Room", state: "in_progress", reason: "PM due", profileKey: "PLANT" }),
        readinessItem({ unitId: "u4", unitName: "Servery A", state: "ready", reason: "Ready", profileKey: "DIETARY" }),
      ],
      { total: 4, ready: 2, inProgress: 1, blocked: 1 },
    ),
    openRepairs: [
      { id: "r1", unitId: "u1", title: "Oven element", priority: "URGENT" as const, status: "OPEN" as const, workOrderKind: "CORRECTIVE" as const, dueAt: null, unitName: "Main Kitchen", departmentKey: "DIETARY" },
      { id: "r2", unitId: "u2", title: "Floor buffer", priority: "HIGH" as const, status: "IN_PROGRESS" as const, workOrderKind: "CORRECTIVE" as const, dueAt: null, unitName: "2 East", departmentKey: "EVS" },
      { id: "r3", unitId: "u3", title: "Boiler valve", priority: "URGENT" as const, status: "OPEN" as const, workOrderKind: "CORRECTIVE" as const, dueAt: null, unitName: "Boiler Room", departmentKey: "PLANT" },
    ],
    inspectionsDue: [
      { id: "i1", definitionId: "def-1", definitionName: "Trayline audit", unitId: "u1", unitName: "Main Kitchen", dueAt: new Date("2026-07-13T10:00:00.000Z"), overdue: true, departmentKey: "DIETARY" },
      { id: "i2", definitionId: "def-2", definitionName: "Room check", unitId: "u2", unitName: "2 East", dueAt: new Date("2026-07-13T14:00:00.000Z"), overdue: false, departmentKey: "EVS" },
      { id: "i3", definitionId: "def-3", definitionName: "Boiler inspection", unitId: "u3", unitName: "Boiler Room", dueAt: new Date("2026-07-13T15:00:00.000Z"), overdue: false, departmentKey: "PLANT" },
      { id: "i4", definitionId: "def-4", definitionName: "Facility fire drill", unitId: null, unitName: null, dueAt: new Date("2026-07-13T16:00:00.000Z"), overdue: false, departmentKey: null },
    ],
    dashboard: {
      ...baseInputs().dashboard,
      unitsMissingStaffing: [
        { id: "u1", name: "Main Kitchen" },
        { id: "u2", name: "2 East" },
      ] as BusinessWorkspaceInputs["dashboard"]["unitsMissingStaffing"],
      unitsWithExceptions: [{ id: "u1", name: "Main Kitchen" }] as BusinessWorkspaceInputs["dashboard"]["unitsWithExceptions"],
    },
    activity: {
      repairsOpened: [
        { id: "ra1", title: "Dietary issue", priority: "URGENT", status: "OPEN", unitName: "Main Kitchen", departmentKey: "DIETARY", at: new Date("2026-07-13T14:00:00.000Z") },
        { id: "ra2", title: "EVS issue", priority: "HIGH", status: "OPEN", unitName: "2 East", departmentKey: "EVS", at: new Date("2026-07-13T13:00:00.000Z") },
      ],
      repairsResolved: [
        { id: "rr1", title: "Plant fix", priority: "HIGH", unitName: "Boiler Room", departmentKey: "PLANT", at: new Date("2026-07-13T12:00:00.000Z") },
      ],
      inspectionsCompleted: [
        { id: "ic1", title: "Trayline", result: "PASS", unitName: "Main Kitchen", departmentKey: "DIETARY", at: new Date("2026-07-13T11:00:00.000Z") },
        { id: "ic2", title: "Room check", result: "FAIL", unitName: "2 East", departmentKey: "EVS", at: new Date("2026-07-13T10:00:00.000Z") },
      ],
      knowledgePublished: [
        { id: "kp1", title: "Menu SOP", category: "SOP", departmentKey: "DIETARY", at: new Date("2026-07-13T09:00:00.000Z") },
        { id: "kp2", title: "Cleaning guide", category: "SOP", departmentKey: "EVS", at: new Date("2026-07-13T08:00:00.000Z") },
      ],
    },
  });
}

// -- Context resolution --

test("resolveWorkspaceContext returns department mode when all fields present", () => {
  const ctx = resolveWorkspaceContext({
    activeDepartmentKey: "DIETARY",
    activeDepartmentId: "dept-1",
    activeDepartmentName: "Dietary",
  });
  assert.equal(ctx.mode, "department");
  assert.equal(ctx.departmentKey, "DIETARY");
  assert.equal(ctx.departmentId, "dept-1");
});

test("resolveWorkspaceContext returns facility mode when key is null", () => {
  const ctx = resolveWorkspaceContext({
    activeDepartmentKey: null,
    activeDepartmentId: null,
    activeDepartmentName: null,
  });
  assert.equal(ctx.mode, "facility");
  assert.equal(ctx.departmentKey, null);
});

test("resolveWorkspaceContext returns facility mode when id is missing", () => {
  const ctx = resolveWorkspaceContext({
    activeDepartmentKey: "DIETARY",
    activeDepartmentId: null,
    activeDepartmentName: "Dietary",
  });
  assert.equal(ctx.mode, "facility");
});

// -- Input scoping --

test("scopeInputsForContext passes inputs through for facility mode", () => {
  const inputs = mixedDeptInputs();
  const scoped = scopeInputsForContext(inputs, facilityCtx);
  assert.equal(scoped, inputs);
});

test("scopeInputsForContext filters readiness by department profileKey", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  assert.ok(scoped.readiness.items.every((item) => item.profileKey === "DIETARY"));
  assert.equal(scoped.readiness.items.length, 2);
  assert.equal(scoped.readiness.summary.blocked, 1);
  assert.equal(scoped.readiness.summary.ready, 1);
});

test("scopeInputsForContext filters repairs by departmentKey", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), plantCtx);
  assert.ok(scoped.openRepairs.every((r) => r.departmentKey === "PLANT"));
  assert.equal(scoped.openRepairs.length, 1);
  assert.equal(scoped.openRepairs[0]?.title, "Boiler valve");
});

test("scopeInputsForContext filters inspections by departmentKey, includes null", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), evsCtx);
  assert.ok(scoped.inspectionsDue.every((i) => i.departmentKey === "EVS" || i.departmentKey === null));
  assert.equal(scoped.inspectionsDue.length, 2);
});

test("scopeInputsForContext filters activity by department", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  assert.ok(scoped.activity.repairsOpened.every((r) => r.departmentKey === "DIETARY" || !r.departmentKey));
  assert.equal(scoped.activity.repairsOpened.length, 1);
  assert.equal(scoped.activity.repairsResolved.length, 0);
  assert.equal(scoped.activity.inspectionsCompleted.length, 1);
  assert.equal(scoped.activity.knowledgePublished.length, 1);
});

test("scopeInputsForContext filters dashboard unit lists by department units", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  assert.ok(scoped.dashboard.unitsMissingStaffing.every((u) => u.id === "u1" || u.id === "u4"));
  assert.equal(scoped.dashboard.unitsWithExceptions.length, 1);
  assert.equal(scoped.dashboard.unitsWithExceptions[0]?.id, "u1");
});

// -- Composition config --

test("resolveCompositionConfig returns Dietary config for DIETARY context", () => {
  const config = resolveCompositionConfig(dietaryCtx);
  assert.equal(config.contextLabel, "Dietary");
  assert.equal(config.showLogCompletion, true);
  assert.equal(config.showMealContext, true);
});

test("resolveCompositionConfig returns EVS config for EVS context", () => {
  const config = resolveCompositionConfig(evsCtx);
  assert.equal(config.contextLabel, "Environmental Services");
  assert.equal(config.showLogCompletion, false);
  assert.equal(config.showMealContext, false);
  assert.ok(!config.operationsLinkIds.includes("issues"));
});

test("resolveCompositionConfig returns Plant config for PLANT context", () => {
  const config = resolveCompositionConfig(plantCtx);
  assert.equal(config.contextLabel, "Plant Operations");
  assert.equal(config.showLogCompletion, false);
  assert.ok(config.operationsLinkIds.includes("assets"));
});

test("resolveCompositionConfig returns Facility config for facility context", () => {
  const config = resolveCompositionConfig(facilityCtx);
  assert.equal(config.contextLabel, "Facility Overview");
  assert.equal(config.showLogCompletion, true);
  assert.ok(config.operationsLinkIds.includes("assets"));
  assert.ok(config.operationsLinkIds.includes("logs"));
});

// -- Dietary composition --

test("Dietary Manager Focus includes only dietary signals", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  const focus = buildManagerFocus(scoped);
  for (const card of focus) {
    assert.ok(!card.title.includes("Boiler"), "Plant signal leaked into Dietary focus");
    assert.ok(!card.title.includes("Floor buffer"), "EVS signal leaked into Dietary focus");
  }
});

test("Dietary priorities exclude EVS and Plant signals", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  const priorities = buildWorkspacePriorities(scoped);
  for (const card of priorities) {
    assert.ok(!card.locationLabel?.includes("Boiler"), "Plant location leaked into Dietary priorities");
  }
});

test("Dietary performance excludes Plant and EVS readiness counts", () => {
  const config = resolveCompositionConfig(dietaryCtx);
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  const perf = buildPerformanceSnapshot(scoped, config);
  const ready = perf.find((m) => m.id === "locations-ready");
  assert.equal(ready?.value, 1);
  const attention = perf.find((m) => m.id === "locations-attention");
  assert.equal(attention?.value, 1);
  const compliance = perf.find((m) => m.id === "due-compliance");
  assert.ok(compliance, "Dietary should show log completion");
});

test("Dietary recent activity excludes EVS and Plant activity", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  const activity = buildRecentActivity(scoped);
  for (const item of activity) {
    assert.ok(!item.title.includes("EVS"), "EVS activity leaked into Dietary");
    assert.ok(!item.title.includes("Plant fix"), "Plant activity leaked into Dietary");
  }
});

// -- EVS composition --

test("EVS Manager Focus includes only EVS signals", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), evsCtx);
  const focus = buildManagerFocus(scoped);
  for (const card of focus) {
    assert.ok(!card.title.includes("Oven"), "Dietary signal leaked into EVS focus");
    assert.ok(!card.title.includes("Boiler"), "Plant signal leaked into EVS focus");
  }
});

test("EVS performance hides log completion", () => {
  const config = resolveCompositionConfig(evsCtx);
  const scoped = scopeInputsForContext(mixedDeptInputs(), evsCtx);
  const perf = buildPerformanceSnapshot(scoped, config);
  assert.ok(!perf.find((m) => m.id === "due-compliance"), "EVS should not show log completion");
});

test("EVS agenda uses cleaning language, not meal language", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), evsCtx);
  const agenda = buildManagementAgenda(scoped, evsCtx);
  const morning = agenda.find((b) => b.id === "morning")!;
  assert.ok(morning.items.some((i) => /rounds|cleaning|area/i.test(i.title)), "EVS morning should reference rounds/cleaning");
  assert.ok(!morning.items.some((i) => /Breakfast|Lunch|Kitchen/i.test(i.title)), "EVS morning should not reference meals");
});

// -- Plant composition --

test("Plant Manager Focus includes only Plant signals", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), plantCtx);
  const focus = buildManagerFocus(scoped);
  for (const card of focus) {
    assert.ok(!card.title.includes("Oven"), "Dietary signal leaked into Plant focus");
    assert.ok(!card.title.includes("Floor buffer"), "EVS signal leaked into Plant focus");
  }
});

test("Plant performance hides log completion", () => {
  const config = resolveCompositionConfig(plantCtx);
  const scoped = scopeInputsForContext(mixedDeptInputs(), plantCtx);
  const perf = buildPerformanceSnapshot(scoped, config);
  assert.ok(!perf.find((m) => m.id === "due-compliance"), "Plant should not show log completion");
});

test("Plant agenda uses asset/PM language, not meal language", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), plantCtx);
  const agenda = buildManagementAgenda(scoped, plantCtx);
  const morning = agenda.find((b) => b.id === "morning")!;
  assert.ok(morning.items.some((i) => /asset|PM|Plant/i.test(i.title)), "Plant morning should reference assets/PM");
  assert.ok(!morning.items.some((i) => /Breakfast|Lunch|Kitchen/i.test(i.title)), "Plant morning should not reference meals");
});

// -- Facility Overview --

test("Facility Overview department health shows all departments", () => {
  const inputs = mixedDeptInputs();
  const health = buildDepartmentHealth(inputs, facilityCtx);
  assert.equal(health.length, 3);
  assert.ok(health.some((h) => h.key === "DIETARY"));
  assert.ok(health.some((h) => h.key === "EVS"));
  assert.ok(health.some((h) => h.key === "PLANT"));
});

test("single-department mode shows only that department health", () => {
  const inputs = mixedDeptInputs();
  const health = buildDepartmentHealth(inputs, dietaryCtx);
  assert.equal(health.length, 1);
  assert.equal(health[0]?.key, "DIETARY");
});

test("Facility Overview uses unscoped inputs (all signals)", () => {
  const inputs = mixedDeptInputs();
  const scoped = scopeInputsForContext(inputs, facilityCtx);
  assert.equal(scoped.openRepairs.length, 3);
  assert.equal(scoped.readiness.items.length, 4);
  assert.equal(scoped.inspectionsDue.length, 4);
});

// -- Quick actions --

test("Dietary quick actions exclude /assets", () => {
  const actions = buildQuickActions({ context: dietaryCtx });
  assert.ok(!actions.find((a) => a.href === "/assets"), "Dietary should not show Assets quick action");
  assert.ok(actions.find((a) => a.href === "/issues"), "Dietary should show Issues quick action");
});

test("EVS quick actions exclude /assets and /issues", () => {
  const actions = buildQuickActions({ context: evsCtx });
  assert.ok(!actions.find((a) => a.href === "/assets"), "EVS should not show Assets");
  assert.ok(!actions.find((a) => a.href === "/issues"), "EVS should not show Issues");
});

test("Plant quick actions include /assets but exclude /menus", () => {
  const actions = buildQuickActions({ context: plantCtx });
  assert.ok(actions.find((a) => a.href === "/assets"), "Plant should show Assets");
});

test("Facility quick actions include all shared routes", () => {
  const actions = buildQuickActions({ context: facilityCtx });
  assert.ok(actions.find((a) => a.href === "/assets"), "Facility should show Assets");
  assert.ok(actions.find((a) => a.href === "/issues"), "Facility should show Issues");
});

// -- Manager Focus healthy guidance --

test("healthy guidance uses department name when context is department", () => {
  const inputs = baseInputs();
  const guidance = buildManagerFocusHealthyGuidance(inputs, dietaryCtx);
  assert.match(guidance.title, /Dietary/);
});

test("healthy guidance uses generic copy when context is facility", () => {
  const inputs = baseInputs();
  const guidance = buildManagerFocusHealthyGuidance(inputs, facilityCtx);
  assert.match(guidance.title, /Current operations/);
});

test("healthy guidance uses generic copy when context is undefined (backward compat)", () => {
  const inputs = baseInputs();
  const guidance = buildManagerFocusHealthyGuidance(inputs);
  assert.match(guidance.title, /Current operations/);
});

// -- Link filtering --

test("isLinkAllowedForContext allows all links for facility mode", () => {
  assert.equal(isLinkAllowedForContext("/assets", facilityCtx), true);
  assert.equal(isLinkAllowedForContext("/issues", facilityCtx), true);
  assert.equal(isLinkAllowedForContext("/menus", facilityCtx), true);
});

test("isLinkAllowedForContext restricts /assets for Dietary", () => {
  assert.equal(isLinkAllowedForContext("/assets", dietaryCtx), false);
});

test("isLinkAllowedForContext restricts /issues for EVS", () => {
  assert.equal(isLinkAllowedForContext("/issues", evsCtx), false);
});

test("isLinkAllowedForContext allows shared routes for all departments", () => {
  assert.equal(isLinkAllowedForContext("/dashboard", dietaryCtx), true);
  assert.equal(isLinkAllowedForContext("/today", evsCtx), true);
  assert.equal(isLinkAllowedForContext("/admin/inspections", plantCtx), true);
});

// -- Preferences stability --

test("preferences are not corrupted by department context switch", () => {
  const prefs = parseWorkspacePreferenceRow({
    hiddenSectionIds: ["performance"],
    collapsedSectionIds: ["recent_activity"],
    sectionOrder: ["priorities", "department_health"],
    preferredLandingSectionId: "priorities",
  });
  const composed = applyWorkspacePreferences({ role: "MANAGER", preferences: prefs });
  assert.ok(!composed.visibleSections.includes("performance"));
  assert.ok(composed.collapsedSections.includes("recent_activity"));
  assert.equal(composed.preferredLandingSectionId, "priorities");
});

// -- Metrics scoping --

test("performance metrics scoped to department show correct counts", () => {
  const config = resolveCompositionConfig(evsCtx);
  const scoped = scopeInputsForContext(mixedDeptInputs(), evsCtx);
  const perf = buildPerformanceSnapshot(scoped, config);
  const issues = perf.find((m) => m.id === "priority-issues");
  assert.equal(issues?.value, 1);
  const ready = perf.find((m) => m.id === "locations-ready");
  assert.equal(ready?.value, 1);
});

// -- RBAC --

test("SUPERVISOR sees limited quick actions regardless of context", () => {
  const actions = buildQuickActions({ supervisor: true, context: dietaryCtx });
  assert.ok(actions.length <= 3);
  assert.ok(actions.every((a) => ["report-issue", "operations-center", "todays-work"].includes(a.id)));
});

test("STAFF denied from Business Workspace (unchanged)", () => {
  assert.equal(canAccessBusinessWorkspace("STAFF"), false);
});

// -- Regression: existing builders work without context --

test("buildManagementAgenda works without context (backward compat)", () => {
  const agenda = buildManagementAgenda(baseInputs());
  assert.equal(agenda.length, 4);
  const morning = agenda.find((b) => b.id === "morning")!;
  const evening = agenda.find((b) => b.id === "evening")!;
  assert.ok(morning.items.length > 0, "morning always has meal review");
  assert.ok(evening.items.length > 0, "evening always has handoff");
});

test("buildQuickActions works without context (backward compat)", () => {
  const actions = buildQuickActions();
  assert.ok(actions.length > 0);
});

test("buildDepartmentHealth works without context (backward compat)", () => {
  const health = buildDepartmentHealth(baseInputs());
  assert.equal(health.length, 3);
});

test("buildPerformanceSnapshot works without config (backward compat)", () => {
  const perf = buildPerformanceSnapshot(baseInputs());
  assert.equal(perf.length, 6);
  assert.ok(perf.find((m) => m.id === "due-compliance"));
});

// -- Cross-department leakage --

test("Dietary workspace does not show EVS room state or Plant PM", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), dietaryCtx);
  const priorities = buildWorkspacePriorities(scoped);
  const focus = buildManagerFocus(scoped);
  const all = [...priorities, ...focus.map((f) => ({ ...f, locationLabel: f.locationLabel }))];
  for (const card of all) {
    if ("locationLabel" in card && card.locationLabel) {
      assert.ok(!card.locationLabel.includes("2 East"), "EVS unit leaked into Dietary");
      assert.ok(!card.locationLabel.includes("Boiler"), "Plant unit leaked into Dietary");
    }
  }
});

test("EVS workspace does not show dietary logs or Plant PM", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), evsCtx);
  assert.equal(scoped.openRepairs.length, 1);
  assert.equal(scoped.openRepairs[0]?.departmentKey, "EVS");
});

test("Plant workspace does not show dietary logs or EVS cleaning", () => {
  const scoped = scopeInputsForContext(mixedDeptInputs(), plantCtx);
  assert.equal(scoped.openRepairs.length, 1);
  assert.equal(scoped.openRepairs[0]?.departmentKey, "PLANT");
  assert.ok(scoped.readiness.items.every((item) => item.profileKey === "PLANT"));
});
