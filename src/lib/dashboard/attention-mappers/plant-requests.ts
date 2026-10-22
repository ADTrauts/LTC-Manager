import type { OperationalRequestStatus, RepairPriority } from "@prisma/client";

import { TRIAGE_ELIGIBLE_STATUSES } from "@/lib/operational-requests/types";

import type { AttentionSeverity, DashboardAttentionItem } from "../attention";

export type PlantTriageRequestFact = {
  id: string;
  requestCode: string;
  summary: string;
  status: OperationalRequestStatus;
  priority: RepairPriority;
  requestingDepartment: { id?: string; name: string };
  unit: { id: string; name: string } | null;
  space: { id: string; name: string } | null;
};

const PRIORITY_SEVERITY: Readonly<Record<RepairPriority, AttentionSeverity>> = {
  EMERGENCY: "act_now",
  URGENT: "act_now",
  HIGH: "due_soon",
  MEDIUM: "watch",
  LOW: "watch",
};

const TRIAGE_ELIGIBLE: ReadonlySet<OperationalRequestStatus> = new Set(TRIAGE_ELIGIBLE_STATUSES);

/** Requests waiting on Plant triage. Items belong to Plant: the queue is Plant's work. */
export function attentionFromPlantRequests(input: {
  plantDepartmentId: string;
  requests: readonly PlantTriageRequestFact[];
}): DashboardAttentionItem[] {
  return input.requests
    .filter((request) => TRIAGE_ELIGIBLE.has(request.status))
    .map((request) => ({
      id: `plant_request:${request.id}`,
      source: "plant_request",
      severity: PRIORITY_SEVERITY[request.priority],
      departmentId: input.plantDepartmentId,
      locationId: request.space?.id ?? request.unit?.id ?? null,
      title: `${request.requestCode} · ${request.summary}`,
      detail: [request.requestingDepartment.name, request.space?.name ?? request.unit?.name]
        .filter(Boolean)
        .join(" · "),
      dueAt: null,
      href: "/repairs",
    }));
}
