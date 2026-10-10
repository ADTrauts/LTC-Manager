import type { OrganizationMembershipRole, RoleKey } from "@prisma/client";

import { partnerRoleLabel } from "@/lib/partner-user-access";

import type {
  AvailableContextPresentation,
  AvailableContextPresentationGroup,
  AvailableContextRecord,
} from "./types";

const PRESENTATION_GROUPS: readonly AvailableContextPresentationGroup[] = [
  "Organizations",
  "Internal Facilities",
  "Client Facilities",
];

const INTERNAL_ROLE_LABEL: Record<RoleKey, string> = {
  FACILITY_ADMINISTRATOR: "Facility Administrator",
  GM: "General Manager",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  LEAD_TEAM_MEMBER: "Lead Team Member",
  STAFF: "Team Member",
};

function organizationRoleLabel(role: OrganizationMembershipRole): string {
  switch (role) {
    case "ORG_ADMIN":
      return "Administrator";
    case "ORG_MEMBER":
      return "Member";
  }
}

export function departmentSummary(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length <= 2) return names.join(", ");
  return `${names.length} Departments`;
}

function compareLabel(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortRecords(records: AvailableContextRecord[]): AvailableContextRecord[] {
  return [...records].sort((left, right) => {
    const groupOrder = (kind: AvailableContextRecord["context"]["kind"]) =>
      kind === "organization" ? 0 : kind === "facility_internal" ? 1 : 2;
    const byGroup = groupOrder(left.context.kind) - groupOrder(right.context.kind);
    if (byGroup !== 0) return byGroup;

    if (left.context.kind === "organization" && right.context.kind === "organization") {
      const byName = compareLabel(left.organizationName, right.organizationName);
      if (byName !== 0) return byName;
      return left.context.organizationId.localeCompare(right.context.organizationId);
    }

    if (left.context.kind === "facility_internal" && right.context.kind === "facility_internal") {
      if (left.context.isHome !== right.context.isHome) return left.context.isHome ? -1 : 1;
      const byName = compareLabel(left.facilityName ?? "", right.facilityName ?? "");
      if (byName !== 0) return byName;
      return left.context.facilityId.localeCompare(right.context.facilityId);
    }

    if (left.context.kind === "facility_partner" && right.context.kind === "facility_partner") {
      const byOrg = compareLabel(
        left.partnerOrganizationName ?? "",
        right.partnerOrganizationName ?? "",
      );
      if (byOrg !== 0) return byOrg;
      const byFacility = compareLabel(left.facilityName ?? "", right.facilityName ?? "");
      if (byFacility !== 0) return byFacility;
      return left.context.facilityPartnerOrganizationId.localeCompare(
        right.context.facilityPartnerOrganizationId,
      );
    }

    return 0;
  });
}

export function presentAvailableContexts(
  records: AvailableContextRecord[],
): AvailableContextPresentation[] {
  return sortRecords(records).map((record): AvailableContextPresentation => {
    const { context } = record;
    if (context.kind === "organization") {
      const roleLabel = organizationRoleLabel(context.organizationRole);
      return {
        contextKey: context.contextKey,
        kind: context.kind,
        group: "Organizations",
        title: record.organizationName,
        subtitle: `Organization · ${roleLabel}`,
        roleLabel,
        isHome: false,
        departmentSummary: null,
      };
    }
    if (context.kind === "facility_internal") {
      const roleLabel = INTERNAL_ROLE_LABEL[context.role];
      return {
        contextKey: context.contextKey,
        kind: context.kind,
        group: "Internal Facilities",
        title: record.facilityName ?? context.facilityId,
        subtitle: `Internal · ${roleLabel}`,
        roleLabel,
        isHome: context.isHome,
        departmentSummary: null,
      };
    }
    const roleLabel = partnerRoleLabel(context.effectivePartnerRole);
    const via = record.partnerOrganizationName ?? context.partnerOrganizationId;
    return {
      contextKey: context.contextKey,
      kind: context.kind,
      group: "Client Facilities",
      title: record.facilityName ?? context.facilityId,
      subtitle: `Via ${via} · ${roleLabel}`,
      roleLabel,
      isHome: false,
      departmentSummary: departmentSummary(record.departmentNames),
    };
  });
}

/** Non-empty presentation groups in canonical order. Empty groups are omitted. */
export function groupAvailableContextPresentations(
  items: readonly AvailableContextPresentation[],
): Array<{ group: AvailableContextPresentationGroup; items: AvailableContextPresentation[] }> {
  return PRESENTATION_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
}
