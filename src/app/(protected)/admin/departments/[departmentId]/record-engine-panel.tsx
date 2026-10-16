import { hasAtLeastRole } from "@/lib/access";
import type { FacilitySession } from "@/lib/auth";
import { evaluateCanonicalCutoverReadiness, evaluatePilotAcceptanceReadiness, resolveRecordEngine } from "@/lib/canonical-logs/record-engine-rollout";
import { listRecordEngineRollouts } from "@/lib/canonical-logs/record-engine-store";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { scheduleRecordEngineAction } from "./record-engine-actions";

export async function RecordEnginePanel(props: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
  departmentName: string;
}) {
  if (!hasAtLeastRole(props.session.role, "FACILITY_ADMINISTRATOR")) return null;
  const timezone = await loadFacilityTimezone(prisma, props.facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone));
  const rollouts = await listRecordEngineRollouts(prisma, props.facilityId, props.departmentId);
  const mode = resolveRecordEngine({
    capabilityEnabled: isCanonicalLogsEnabled(),
    facilityId: props.facilityId,
    departmentId: props.departmentId,
    serviceDate: todayKey,
    rollouts,
  });
  const activeAttachmentCount = await prisma.logAttachment.count({
    where: { facilityId: props.facilityId, departmentId: props.departmentId, status: "ACTIVE" },
  });
  const attachments = await prisma.logAttachment.findMany({
    where: { facilityId: props.facilityId, departmentId: props.departmentId, status: "ACTIVE" },
    select: {
      catalogDefinition: { select: { name: true, purposeType: true, repeatingGroupsJson: true } },
    },
  });
  const names = attachments.map((row) => row.catalogDefinition.name.toLowerCase());
  const placed = {
    cooler: names.some((name) => name.includes("cooler") || name.includes("temperature")),
    checklist: attachments.some((row) => row.catalogDefinition.purposeType === "CHECKLIST"),
    inspection: attachments.some((row) => row.catalogDefinition.purposeType === "INSPECTION"),
    repeating: attachments.some((row) => {
      const groups = row.catalogDefinition.repeatingGroupsJson;
      return Array.isArray(groups) && groups.length > 0;
    }),
  };
  const staffAccess = (await prisma.employee.count({
    where: {
      facilityId: props.facilityId,
      primaryDepartmentId: props.departmentId,
      status: "ACTIVE",
      roleType: "STAFF",
      pinDigest: { not: null },
    },
  })) > 0;
  const readiness = evaluateCanonicalCutoverReadiness({
    capabilityEnabled: isCanonicalLogsEnabled(),
    departmentExists: true,
    effectiveFromServiceDate: todayKey,
    todayKey,
    activeAttachmentCount,
    attachmentSetupErrorCount: 0,
    pmUsesOperationalTemplate: true,
  });
  const pilot = evaluatePilotAcceptanceReadiness({
    engine: readiness,
    rolloutConfigured: mode === "CANONICAL",
    placed,
    staffAccess,
  });

  return (
    <details className="group rounded-md border border-zinc-200 bg-white p-3" data-testid="record-engine-panel">
      <summary className="cursor-pointer text-sm font-medium text-zinc-800">
        Record engine: {mode === "CANONICAL" ? "Canonical Records" : "Previous Logs"}
        <span className="ml-2 text-xs font-normal text-zinc-600">Settings & readiness</span>
      </summary>
      <div className="space-y-3 pt-3">
      <p className="text-sm text-zinc-700">
        {props.departmentName} is using {mode === "CANONICAL" ? "canonical Records" : "the previous Logs"} on {todayKey}.
        Earlier Records stay where they were submitted. This does not copy history.
      </p>
      <p className="text-sm text-zinc-700">
        Pilot acceptance: {pilot.pilotStatus === "PILOT_READY" ? "pilot ready" : "not pilot ready"}.
      </p>
      {pilot.blockers.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-amber-900">
          {pilot.blockers.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <ul className="list-disc pl-5 text-xs text-zinc-600">
        {readiness.warnings.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {rollouts.length > 0 ? (
        <ol className="space-y-1 text-xs text-zinc-600">
          {rollouts.map((row) => (
            <li key={`${row.effectiveFromServiceDate}-${row.mode}`}>
              {row.effectiveFromServiceDate}: {row.mode === "CANONICAL" ? "Canonical Records" : "Previous Logs"}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-zinc-500">No service-date decision is stored. New work stays on the previous Logs.</p>
      )}
      <form action={scheduleRecordEngineAction} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="departmentId" value={props.departmentId} />
        <label className="text-sm">
          Engine
          <select name="mode" className="mt-1 w-full rounded border border-zinc-300 px-2 py-1" defaultValue={mode}>
            <option value="CANONICAL">Canonical Records</option>
            <option value="LEGACY">Previous Logs</option>
          </select>
        </label>
        <label className="text-sm">
          Effective service date
          <input name="effectiveFromServiceDate" type="date" required defaultValue={todayKey} className="mt-1 w-full rounded border border-zinc-300 px-2 py-1" />
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="confirm" value="yes" required />
          <span>
            New Logs and inspections for {props.departmentName} use the selected engine from this service date. Legacy history remains available.
          </span>
        </label>
        <button type="submit" className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm text-white">
          Save Record engine
        </button>
      </form>
      </div>
    </details>
  );
}
