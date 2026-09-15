import {
  DEPARTMENT_ADMIN_TABS,
  departmentAdminHref,
  type DepartmentAdminTabId,
} from "@/lib/department-administration";
import { SubNav } from "@/components/design-system/SubNav";

type Props = {
  departmentId: string;
  activeTab: DepartmentAdminTabId;
  profileId: string | null;
  /** When set, only these tabs render (feature-flag filtered). */
  tabs?: readonly (typeof DEPARTMENT_ADMIN_TABS)[number][];
};

/**
 * Department Builder local navigation — horizontal SubNav under the page header.
 * Preserves deep-link hrefs via departmentAdminHref (tab + profile query).
 */
export function DepartmentAdminLocalNav({
  departmentId,
  activeTab,
  profileId,
  tabs = DEPARTMENT_ADMIN_TABS,
}: Props) {
  return (
    <SubNav
      aria-label="Department Builder"
      data-testid="department-builder-nav"
      activeId={activeTab}
      items={tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        href: departmentAdminHref(departmentId, tab.id, profileId),
      }))}
    />
  );
}
