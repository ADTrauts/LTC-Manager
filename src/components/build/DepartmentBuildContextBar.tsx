import {
  BuildContextBar,
  type BuildContextBarFact,
  type BuildContextBarState,
} from "@/components/build/BuildContextBar";
import { formatBuildCountFact } from "@/lib/build/format-build-count-fact";
import {
  departmentAdminHref,
  type DepartmentAdminTabId,
} from "@/lib/department-administration";
import type { DepartmentBuilderContextSummary } from "@/lib/department-administration/builder-context-summary";

type Props = {
  departmentId: string;
  departmentName: string;
  locationCount: number;
  profileId: string | null;
  activeTab: DepartmentAdminTabId;
  context: DepartmentBuilderContextSummary;
};

export function DepartmentBuildContextBar({
  departmentId,
  departmentName,
  locationCount,
  profileId,
  activeTab,
  context,
}: Props) {
  const facts: BuildContextBarFact[] = [
    {
      ...formatBuildCountFact(locationCount, "Location", "Locations"),
      href: departmentAdminHref(departmentId, "locations", profileId),
      ariaLabel: `View ${locationCount} locations for ${departmentName}`,
      active: activeTab === "locations",
    },
    {
      ...formatBuildCountFact(context.activeTeamCount, "Team", "Teams"),
      href: departmentAdminHref(departmentId, "teams", profileId),
      ariaLabel: `View ${context.activeTeamCount} teams for ${departmentName}`,
      active: activeTab === "teams",
    },
    {
      ...formatBuildCountFact(context.currentCycleCount, "Cycle", "Cycles"),
      href: departmentAdminHref(departmentId, "teams", profileId),
      ariaLabel: `View ${context.currentCycleCount} operational cycles for ${departmentName}`,
      active: activeTab === "teams",
    },
    context.headDisplayName
      ? {
          prefix: "Manager:",
          value: context.headDisplayName,
          href: departmentAdminHref(departmentId, "overview", profileId),
          ariaLabel: `Department manager ${context.headDisplayName}`,
          active: activeTab === "overview",
        }
      : {
          prefix: "Manager:",
          value: "No manager",
          href: departmentAdminHref(departmentId, "overview", profileId),
          ariaLabel: "No department manager assigned",
          active: activeTab === "overview",
        },
  ];

  let state: BuildContextBarState | undefined;
  if (context.draftState === "changes") {
    state = { label: "Draft changes", tone: "build" };
  }

  return (
    <BuildContextBar title={departmentName} facts={facts} state={state} />
  );
}
