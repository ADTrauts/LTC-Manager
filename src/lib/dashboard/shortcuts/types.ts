import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { AppIconKey } from "@/lib/design-system";

export type WorkspaceContext =
  | {
      mode: "department";
      departmentId: string;
      departmentKey: OperationalDepartmentKey;
      departmentName: string;
    }
  | {
      mode: "facility";
      departmentId: null;
      departmentKey: null;
      departmentName: null;
    };

export type WorkspaceSectionId =
  | "manager_focus"
  | "management_agenda"
  | "quick_actions"
  | "priorities"
  | "department_health"
  | "todays_work"
  | "operations"
  | "performance"
  | "recent_activity";

export type WorkspaceQuickAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: AppIconKey;
};
