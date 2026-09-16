import type { DepartmentJobRoleTier } from "@prisma/client";

import {
  type OperationalCapabilityKey,
  normalizeCapabilityKeys,
} from "./capabilities";

export const DEPARTMENT_JOB_ROLE_TIERS = [
  "TEAM_MEMBER",
  "LEAD",
  "SUPERVISOR",
  "MANAGER",
] as const satisfies readonly DepartmentJobRoleTier[];

export type JobRoleTier = (typeof DEPARTMENT_JOB_ROLE_TIERS)[number];

/** Platform starter display names — editable after create; never hard-coded into auth checks. */
export const STARTER_JOB_ROLE_DEFINITIONS: readonly {
  displayName: string;
  tier: JobRoleTier;
  displayOrder: number;
  description: string;
}[] = [
  {
    displayName: "Team Member",
    tier: "TEAM_MEMBER",
    displayOrder: 100,
    description: "Completes assigned work within the Department.",
  },
  {
    displayName: "Lead",
    tier: "LEAD",
    displayOrder: 200,
    description: "Coordinates day-to-day Team operation alongside assigned work.",
  },
  {
    displayName: "Supervisor",
    tier: "SUPERVISOR",
    displayOrder: 300,
    description: "Oversees operational work and staffing adjustments.",
  },
  {
    displayName: "Manager",
    tier: "MANAGER",
    displayOrder: 400,
    description: "Manages Department workforce and operational configuration.",
  },
];

const TIER_DEFAULT_CAPABILITIES: Record<JobRoleTier, readonly OperationalCapabilityKey[]> = {
  TEAM_MEMBER: [
    "COMPLETE_ASSIGNED_WORK",
    "RECORD_OPERATIONAL_LOGS",
    "REPORT_ISSUES",
    "VIEW_TEAM_OPERATION",
    "COMPLETE_KEY_TIMES",
  ],
  LEAD: [
    "COMPLETE_ASSIGNED_WORK",
    "RECORD_OPERATIONAL_LOGS",
    "REPORT_ISSUES",
    "VIEW_TEAM_OPERATION",
    "MANAGE_TEAM_OPERATION",
    "COMPLETE_KEY_TIMES",
    "VIEW_STAFFING",
  ],
  SUPERVISOR: [
    "COMPLETE_ASSIGNED_WORK",
    "RECORD_OPERATIONAL_LOGS",
    "REPORT_ISSUES",
    "VIEW_TEAM_OPERATION",
    "MANAGE_TEAM_OPERATION",
    "COMPLETE_KEY_TIMES",
    "ADJUST_OPERATIONAL_TIMES",
    "CORRECT_OPERATIONAL_RECORDS",
    "VIEW_STAFFING",
    "ASSIGN_DAILY_COVERAGE",
    "VIEW_EMPLOYEES",
  ],
  MANAGER: [
    "COMPLETE_ASSIGNED_WORK",
    "RECORD_OPERATIONAL_LOGS",
    "REPORT_ISSUES",
    "VIEW_TEAM_OPERATION",
    "MANAGE_TEAM_OPERATION",
    "COMPLETE_KEY_TIMES",
    "ADJUST_OPERATIONAL_TIMES",
    "CORRECT_OPERATIONAL_RECORDS",
    "VIEW_STAFFING",
    "ASSIGN_DAILY_COVERAGE",
    "MANAGE_SCHEDULE",
    "VIEW_EMPLOYEES",
    "MANAGE_EMPLOYEES",
    "CONFIGURE_DEPARTMENT",
  ],
};

export function isDepartmentJobRoleTier(value: string): value is JobRoleTier {
  return (DEPARTMENT_JOB_ROLE_TIERS as readonly string[]).includes(value);
}

export function defaultCapabilitiesForTier(tier: JobRoleTier): OperationalCapabilityKey[] {
  return normalizeCapabilityKeys([...TIER_DEFAULT_CAPABILITIES[tier]]);
}

export const JOB_ROLE_TIER_LABEL: Record<JobRoleTier, string> = {
  TEAM_MEMBER: "Team Member",
  LEAD: "Lead",
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
};
