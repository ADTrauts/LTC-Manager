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
  loadCachedMorningBriefPreview,
  orderedWorkspaceSections,
  parseWorkspacePreferenceRow,
  resolveAgendaBucketId,
  resolveWorkspaceSections,
  workspaceIsHealthy,
  workspaceSectionVisible,
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
            at: new Date("2026-07-13T15:00:00.000Z"),
          },
          {
            id: "hi1",
            title: "Freezer alarm",
            priority: "URGENT",
            status: "OPEN",
            unitName: "Main Kitchen",
            at: new Date("2026-07-13T14:00:00.000Z"),
          },
        ],
        repairsResolved: [
          {
            id: "res1",
            title: "Leak fixed",
            priority: "HIGH",
            unitName: "Boiler",
            at: new Date("2026-07-13T13:30:00.000Z"),
          },
        ],
        inspectionsCompleted: [
          {
            id: "insp1",
            title: "Trayline",
            result: "PASS",
            unitName: "Main Kitchen",
            at: new Date("2026-07-13T12:00:00.000Z"),
          },
        ],
        knowledgePublished: [
          {
            id: "k1",
            title: "Dish machine SOP",
            category: "SOP",
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
        },
      ],
      activity: {
        ...baseInputs().activity,
        knowledgePublished: [
          {
            id: "k1",
            title: "SOP",
            category: "SOP",
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
