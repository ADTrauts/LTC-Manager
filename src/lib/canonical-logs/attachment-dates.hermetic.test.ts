import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { updateLogAttachment } from "./attachment-service";

test("placement date edits preserve history and reject overlap with a closed segment before writing", async (t) => {
  const priorFlag = process.env.CANONICAL_LOGS_ENABLED;
  process.env.CANONICAL_LOGS_ENABLED = "true";
  t.after(() => {
    if (priorFlag === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
    else process.env.CANONICAL_LOGS_ENABLED = priorFlag;
  });
  const existing = {
    id: "replacement", facilityId: "facility", departmentId: "dietary",
    catalogDefinitionId: "checklist-v2", catalogStableKey: "checklist", catalogVersion: 2,
    status: "ACTIVE", effectiveFrom: new Date("2026-10-16"), effectiveTo: null,
    retiredAt: null, targetKind: "SPACE", spaceId: "kitchen", assetId: null,
    unitId: null, targetDepartmentId: null,
    timingMode: "DAILY_WINDOWS", dailyWindows: [{ label: "Morning", startLocal: "05:00", endLocal: "11:00" }],
    cycleSelections: [], calendarCadence: null, calendarDaysOfWeek: [],
    calendarDayOfMonth: null, calendarDueTimeLocal: null, allowAdHoc: false,
    waiverAllowed: false, localDisplayLabel: null, localInstructions: null,
  };
  let writes = 0;
  const client = {
    logAttachment: {
      findFirst: async () => existing,
      findMany: async (query: { where: { id: { not: string } } }) => {
        assert.equal(query.where.id.not, existing.id);
        return [
          { effectiveFrom: new Date("2026-10-15"), effectiveTo: new Date("2026-10-15") },
          { effectiveFrom: new Date("2026-10-20"), effectiveTo: new Date("2026-10-19") },
        ];
      },
      update: async () => { writes++; return existing; },
    },
  } as unknown as PrismaClient;
  const input = { facilityId: "facility", attachmentId: "replacement", todayKey: "2026-10-15" };
  await assert.rejects(updateLogAttachment(client, { ...input, effectiveFromKey: "2026-10-15" }), /already covers/);
  assert.equal(writes, 0);
  await updateLogAttachment(client, { ...input, effectiveFromKey: "2026-10-17" });
  assert.equal(writes, 1);
  existing.effectiveFrom = new Date("2026-10-15");
  await assert.rejects(updateLogAttachment(client, { ...input, effectiveFromKey: "2026-10-17" }), /start date cannot be changed/);
  assert.equal(writes, 1);
});
