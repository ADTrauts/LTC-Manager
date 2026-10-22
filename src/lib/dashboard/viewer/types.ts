import type { AppRole } from "@/lib/access";
import type { FacilitySession, PartnerFacilitySession } from "@/lib/auth";
import type { DepartmentAccessMode } from "@/lib/department-authority";
import type { RouteFeatureFlags } from "@/lib/route-registry/authorize";

/** Precedence: Facility Administrator > Department leader > Manager > Supervisor. */
export type DashboardAuthority =
  | "FACILITY_ADMINISTRATOR"
  | "DEPARTMENT_LEADER"
  | "MANAGER"
  | "SUPERVISOR";

export const DASHBOARD_AUTHORITY_RANK: Readonly<Record<DashboardAuthority, number>> = {
  SUPERVISOR: 1,
  MANAGER: 2,
  DEPARTMENT_LEADER: 3,
  FACILITY_ADMINISTRATOR: 4,
};

export type DashboardScope =
  | { kind: "FACILITY" }
  | { kind: "DEPARTMENT"; departmentId: string }
  | { kind: "TEAM"; departmentId: string; teamIds: readonly string[]; roomIds: readonly string[] };

export type DashboardScopeKind = DashboardScope["kind"];

/** `NONE` never reaches the Dashboard: such Departments are not in scope. */
export type DashboardDepartmentAccessMode = Exclude<DepartmentAccessMode, "NONE">;

export type DashboardDepartmentOperator = {
  operatingModel: "SELF_OPERATED" | "VENDOR_RUN";
  /** Vendor display name; null for self-operated Departments. */
  operatorName: string | null;
  vendorHeadAccepted: boolean;
};

export type DashboardViewerDepartment = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
};

export type DashboardLayoutOwner =
  | { kind: "USER"; userId: string }
  | { kind: "EMPLOYEE"; employeeId: string }
  | null;

export type DashboardViewerNoticeCode =
  | "NEEDS_DEPARTMENT"
  | "NO_TEAM_ASSIGNED"
  | "TEAM_WITHOUT_ROOMS"
  | "LENS_NOT_AVAILABLE";

export type DashboardViewerNotice = {
  code: DashboardViewerNoticeCode;
  message: string;
};

export type DashboardViewer = {
  facilityId: string;
  facilityTimezone: string;
  /** Facility-local YYYY-MM-DD. */
  serviceDate: string;
  /** Passed through so domain authority checks still run. A vendor head keeps the partner session. */
  session: FacilitySession | PartnerFacilitySession;
  role: AppRole;
  authority: DashboardAuthority;
  employeeId: string | null;
  layoutOwner: DashboardLayoutOwner;
  ledDepartmentIds: readonly string[];
  /** Departments this viewer may ever see on the Dashboard, in facility sort order. */
  departments: readonly DashboardViewerDepartment[];
  scopeDepartmentIds: readonly string[];
  departmentAccess: Readonly<Record<string, DashboardDepartmentAccessMode>>;
  operators: Readonly<Record<string, DashboardDepartmentOperator>>;
  /** Null only when a viewer below Facility Administrator has no Department in scope. */
  scope: DashboardScope | null;
  availableScopes: readonly DashboardScope[];
  notices: readonly DashboardViewerNotice[];
  canCustomize: boolean;
  /** Captured once per request so eligibility stays a pure function. */
  routeFlags: RouteFeatureFlags;
};

/** Lens requests can only pick among `availableScopes`. */
export type DashboardLensRequest = {
  cookieDepartmentId?: string | null;
  /** `facility`, `department:<departmentId>` or `team:<departmentId>`. */
  scopeParam?: string | null;
};

export type DashboardViewerResolution =
  | { kind: "viewer"; viewer: DashboardViewer }
  | { kind: "not_eligible"; reason: "SESSION_KIND" | "ROLE_BELOW_SUPERVISOR" };
