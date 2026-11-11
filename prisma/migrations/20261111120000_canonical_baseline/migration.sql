-- Canonical Vssyl schema for a fresh application database.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  ) THEN
    RAISE EXCEPTION 'The Vssyl baseline requires an empty application schema.';
  END IF;
END $$;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('FACILITY_ADMINISTRATOR', 'GM', 'MANAGER', 'SUPERVISOR', 'LEAD_TEAM_MEMBER', 'STAFF');

-- CreateEnum
CREATE TYPE "OrganizationMembershipRole" AS ENUM ('ORG_ADMIN', 'ORG_MEMBER');

-- CreateEnum
CREATE TYPE "OrganizationClaimStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "OrganizationMemberInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OrganizationPartnerRole" AS ENUM ('PARTNER_VIEWER', 'PARTNER_OPERATOR', 'PARTNER_MANAGER');

-- CreateEnum
CREATE TYPE "PartnerAssignmentAuthorityKind" AS ENUM ('facility_admin', 'partner_org_admin');

-- CreateEnum
CREATE TYPE "PartnerUserRolePeriodEndReason" AS ENUM ('ROLE_CHANGED', 'ASSIGNMENT_ENDED', 'FACILITY_BLOCKED', 'ORGANIZATION_MEMBERSHIP_ENDED');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('HEALTHCARE_SYSTEM', 'MANAGEMENT_COMPANY', 'LONG_TERM_CARE', 'HOSPITAL', 'K12_DISTRICT', 'UNIVERSITY', 'CORPORATE', 'HOSPITALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DepartmentVendorHeadAssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REPLACED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BillingSetupPath" AS ENUM ('SELF_SERVE', 'ASSISTED');

-- CreateEnum
CREATE TYPE "FacilityBillingStatus" AS ENUM ('UNMANAGED', 'INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- CreateEnum
CREATE TYPE "DepartmentEntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PushSubscriptionRevocationReason" AS ENUM ('LOGOUT', 'REPLACED', 'GONE', 'UNAUTHORIZED', 'USER_DISABLED');

-- CreateEnum
CREATE TYPE "PushDispatchStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "DashboardScopeKind" AS ENUM ('FACILITY', 'DEPARTMENT', 'TEAM');

-- CreateEnum
CREATE TYPE "DashboardAuthority" AS ENUM ('FACILITY_ADMINISTRATOR', 'DEPARTMENT_LEADER', 'MANAGER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "FacilityAdministratorInvitationKind" AS ENUM ('TRANSFER', 'RECOVERY');

-- CreateEnum
CREATE TYPE "FacilityAdministratorInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('SERVERY', 'KITCHEN', 'RETAIL', 'OFFICE', 'STORAGE', 'OTHER', 'RESIDENT_AREA', 'COMMON_AREA', 'MECHANICAL', 'RESTROOM_CLUSTER', 'EVS_ZONE', 'GROUND');

-- CreateEnum
CREATE TYPE "UnitHierarchyRole" AS ENUM ('BUILDING', 'FLOOR', 'NEIGHBORHOOD', 'STAGED');

-- CreateEnum
CREATE TYPE "UnitDepartmentKind" AS ENUM ('PRIMARY', 'BACKUP', 'SUPPORT');

-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('SERVICE_AREA', 'PATIENT_ROOM', 'PRODUCTION_AREA', 'STORAGE', 'UTILITY', 'OFFICE', 'RESTROOM', 'MECHANICAL', 'PUBLIC_AREA', 'OTHER');

-- CreateEnum
CREATE TYPE "OperationalCycleNodeKind" AS ENUM ('PERIOD', 'KEY_TIME');

-- CreateEnum
CREATE TYPE "OperationalCycleOccurrenceTracking" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "OperationalCycleKeyPointGrain" AS ENUM ('DEPARTMENT', 'LOCATION');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "ServeryMilestone" AS ENUM ('READY', 'SERVICE_STARTED');

-- CreateEnum
CREATE TYPE "ServeryMilestoneEntryKind" AS ENUM ('ORIGINAL', 'CORRECTION');

-- CreateEnum
CREATE TYPE "SessionAuthMethod" AS ENUM ('PASSWORD', 'QUICK_PIN');

-- CreateEnum
CREATE TYPE "MenuWeekStartDay" AS ENUM ('SUNDAY', 'MONDAY');

-- CreateEnum
CREATE TYPE "MenuItemEntryType" AS ENUM ('FIXED', 'CHOICE_PLACEHOLDER');

-- CreateEnum
CREATE TYPE "LogRecurrence" AS ENUM ('DAILY', 'PER_MEAL', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LogFieldType" AS ENUM ('YES_NO', 'NUMBER', 'TEMPERATURE', 'DROPDOWN', 'SHORT_TEXT', 'LONG_TEXT', 'PASS_FAIL');

-- CreateEnum
CREATE TYPE "LogSubmissionStatus" AS ENUM ('COMPLETED', 'FAILED', 'MISSED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'OFF', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SeparationKind" AS ENUM ('RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'PER_DIEM');

-- CreateEnum
CREATE TYPE "JobClassification" AS ENUM ('COOK', 'FOOD_SERVICE_WORKER', 'DIET_CLERK', 'DIETITIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkStation" AS ENUM ('COOK', 'SERVER', 'DISHWASHER', 'RETAIL', 'DIET', 'OFFICE', 'PORTER', 'UTILITY');

-- CreateEnum
CREATE TYPE "ChrcStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'CLEARED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "DisciplinePointCategory" AS ENUM ('ATTENDANCE', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'FULL_DAY');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'DEGRADED', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetStatusChangeReason" AS ENUM ('INITIAL', 'MANUAL', 'TRIAGE', 'RETURN_TO_SERVICE', 'RETIREMENT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AssetIssueStatus" AS ENUM ('REPORTED', 'ACKNOWLEDGED', 'TRIAGED', 'MONITORING', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationalRequestStatus" AS ENUM ('REPORTED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'WORK_ASSIGNED', 'WORK_IN_PROGRESS', 'WAITING_ON_VENDOR', 'WAITING_ON_PARTS', 'MONITORING', 'RESOLVED', 'CLOSED', 'CANCELLED', 'REOPENED');

-- CreateEnum
CREATE TYPE "AssetOperationalImpact" AS ENUM ('NO_IMMEDIATE_IMPACT', 'WORKAROUND_AVAILABLE', 'SERVICE_AT_RISK', 'EQUIPMENT_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AssetCriticality" AS ENUM ('CRITICAL', 'IMPORTANT', 'ROUTINE');

-- CreateEnum
CREATE TYPE "RepairPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "WorkOrderHoldReason" AS ENUM ('WAITING_FOR_PART', 'WAITING_FOR_VENDOR', 'WAITING_FOR_ACCESS', 'SCHEDULED_LATER', 'OTHER');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_VENDOR', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairAssetConditionReview" AS ENUM ('NO_CHANGE', 'OPERATIONAL', 'DEGRADED', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "RepairRecordRequirementStatus" AS ENUM ('PENDING', 'SATISFIED', 'WAIVED');

-- CreateEnum
CREATE TYPE "WorkOrderKind" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "WorkOrderResponseRequirement" AS ENUM ('STANDARD', 'IMMEDIATE');

-- CreateEnum
CREATE TYPE "WorkOrderResponseTransition" AS ENUM ('OPENED', 'CLEARED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairTrade" AS ENUM ('EQUIPMENT', 'PLUMBING', 'ELECTRICAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "PreventiveMaintenanceCadence" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PreventiveMaintenancePlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "PreventiveMaintenancePlanVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PreventiveMaintenanceOccurrenceStatus" AS ENUM ('OPEN', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RoomAreaOperationalStatus" AS ENUM ('CLEAN', 'DIRTY', 'OCCUPIED', 'DISCHARGE', 'ISOLATION', 'TERMINAL_CLEAN_PENDING');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('LOG', 'REPAIR', 'INSPECTION', 'COVERAGE', 'AD_HOC');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskSourceType" AS ENUM ('LOG_SUBMISSION', 'REPAIR', 'INSPECTION_SUBMISSION', 'INSPECTION_FINDING', 'INSPECTION_OCCURRENCE');

-- CreateEnum
CREATE TYPE "InspectionResponseType" AS ENUM ('PASS_FAIL', 'YES_NO', 'TEXT', 'NUMBER', 'TEMPERATURE');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'PASSED_WITH_FINDINGS', 'FAILED');

-- CreateEnum
CREATE TYPE "InspectionCadenceType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "InspectionOccurrenceStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AttachmentParentKind" AS ENUM ('LOG_SUBMISSION', 'REPAIR', 'ASSET');

-- CreateEnum
CREATE TYPE "DepartmentTeamStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmployeeUserLinkInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AssetMaintainerProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AssetTitleKind" AS ENUM ('FACILITY', 'PARTNER');

-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeArticleVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeArticleCategory" AS ENUM ('SOP', 'EQUIPMENT', 'LOCATION', 'SAFETY', 'COMPLIANCE', 'TROUBLESHOOTING', 'TRAINING', 'REFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('MANUAL', 'HANDBOOK', 'VENDOR', 'POLICY', 'INCIDENT_LESSON', 'OTHER');

-- CreateEnum
CREATE TYPE "AiBriefStatus" AS ENUM ('READY', 'FALLBACK', 'FAILED');

-- CreateEnum
CREATE TYPE "AiBriefType" AS ENUM ('MORNING_BRIEF', 'SHIFT_TRANSITION', 'RECOVERY_ASSISTANT');

-- CreateEnum
CREATE TYPE "OperationalAssignmentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationalAssignmentSource" AS ENUM ('MANUAL', 'TEMPLATE', 'COVERAGE', 'REASSIGNMENT', 'SCHEDULED_EMPLOYEE', 'UNSCHEDULED_COVERAGE', 'SUPERVISOR_OVERRIDE', 'CALL_OFF_REPLACEMENT', 'MANUAL_ADDITION');

-- CreateEnum
CREATE TYPE "OperationalAssignmentPlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REOPENED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DepartmentOperationalZoneStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "EmployeeOperationalQualificationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "CoverageEpisodeCloseReason" AS ENUM ('RESTORED', 'SERVICE_WINDOW_ENDED', 'REQUIREMENT_REMOVED');

-- CreateEnum
CREATE TYPE "OperationalAssignmentTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AuthRateLimitBucketType" AS ENUM ('PASSWORD_ACCOUNT', 'PIN_CANDIDATE', 'PIN_FACILITY');

-- CreateEnum
CREATE TYPE "OfflineConflictResolution" AS ENUM ('PENDING', 'MARKED_DUPLICATE', 'APPLIED_AS_CORRECTION', 'REJECTED_WITH_REASON');

-- CreateEnum
CREATE TYPE "OperationalCycleType" AS ENUM ('PREPARATION', 'SERVICE', 'TRANSITION', 'CLOSEOUT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OperationalCycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "OperationalCycleLocationMode" AS ENUM ('ALL_DEPARTMENT_UNITS', 'EXPLICIT_UNITS');

-- CreateEnum
CREATE TYPE "OperationalTemplatePurposeType" AS ENUM ('LOG', 'CHECKLIST', 'INSPECTION');

-- CreateEnum
CREATE TYPE "OperationalTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "OperationalEvidenceFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'TEMPERATURE', 'YES_NO', 'PASS_NEEDS_ATTENTION', 'SINGLE_SELECT', 'MULTI_SELECT', 'DATE', 'TIME', 'ATTESTATION', 'OPTIONAL_COMMENT', 'PHOTO', 'FILE', 'SIGNATURE', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "OperationalEvidenceAttachmentKind" AS ENUM ('PHOTO', 'FILE', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "OperationalTemplateApplicabilityKind" AS ENUM ('SPECIFIC_ASSET', 'ASSET_TYPE', 'SPECIFIC_SPACE', 'SPACE_TYPE', 'DEPARTMENT_UNIT');

-- CreateEnum
CREATE TYPE "OperationalTemplateScheduleKind" AS ENUM ('OPERATIONAL_CYCLE', 'FIXED_DAILY_WINDOW', 'ONCE_PER_OPERATIONAL_DATE', 'AD_HOC');

-- CreateEnum
CREATE TYPE "OperationalEvidenceRecordStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_CORRECTIVE_ACTION', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "CatalogLogStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CatalogLogPurposeType" AS ENUM ('LOG', 'CHECKLIST', 'INSPECTION', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "CatalogLogCategory" AS ENUM ('TEMPERATURE', 'SANITATION', 'CLEANING', 'EQUIPMENT', 'FOOD_SAFETY', 'OPENING_CLOSING', 'COMPLIANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "CatalogRecommendedCadence" AS ENUM ('ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'ONCE_PER_OPERATIONAL_CYCLE', 'WEEKLY', 'MONTHLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "LogAttachmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "LogAttachmentTargetKind" AS ENUM ('ASSET', 'SPACE', 'UNIT', 'DEPARTMENT', 'FACILITY');

-- CreateEnum
CREATE TYPE "LogAttachmentTimingMode" AS ENUM ('DAILY_WINDOWS', 'OPERATIONAL_CYCLE', 'CALENDAR', 'AD_HOC');

-- CreateEnum
CREATE TYPE "LogAttachmentCalendarCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CatalogFormOwnerKind" AS ENUM ('VSSYL', 'FACILITY', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "PlatformStaffRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "HarborAuditAction" AS ENUM ('LOGIN', 'VIEW_CUSTOMER', 'WORK_SESSION_START', 'WORK_SESSION_END', 'CATALOG_CREATE', 'CATALOG_PUBLISH', 'CATALOG_RETIRE', 'CATALOG_DRAFT_SUCCESSOR', 'TICKET_OPEN', 'TICKET_REPLY', 'PROVISION_FACILITY');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('NEW', 'OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('SUPPORT', 'BUG', 'FEATURE_REQUEST', 'IMPROVEMENT', 'ACCOUNT_ACCESS', 'BILLING', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportTicketMessageKind" AS ENUM ('INBOUND', 'OUTBOUND', 'NOTE');

-- CreateEnum
CREATE TYPE "SupportMessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED', 'BOUNCED', 'SPAM_COMPLAINT');

-- CreateEnum
CREATE TYPE "SupportMacroAssignmentMode" AS ENUM ('UNCHANGED', 'ME', 'STAFF', 'UNASSIGN');

-- CreateEnum
CREATE TYPE "SupportStaffNotificationType" AS ENUM ('NEW_TICKET', 'ASSIGNED_TO_ME', 'CUSTOMER_REPLIED', 'HIGH_PRIORITY', 'URGENT_PRIORITY', 'DELIVERY_FAILED', 'BOUNCED', 'SPAM_COMPLAINT', 'UNASSIGNED_ALERT');

-- CreateEnum
CREATE TYPE "SupportStaffNotificationEmailStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportAutomationType" AS ENUM ('WAITING_REMINDER', 'WAITING_RESOLVE', 'RESOLVED_CLOSE', 'UNASSIGNED_ALERT');

-- CreateEnum
CREATE TYPE "SupportAutomationAction" AS ENUM ('SEND_REMINDER', 'RESOLVE_AFTER_WAIT', 'CLOSE_RESOLVED', 'ALERT_UNASSIGNED');

-- CreateEnum
CREATE TYPE "SupportAutomationRunOutcome" AS ENUM ('CLAIMED', 'APPLIED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportTicketEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNMENT_CHANGED', 'PRIORITY_CHANGED', 'TYPE_CHANGED', 'FACILITY_CHANGED', 'CONTACT_CHANGED', 'SUBJECT_CHANGED', 'EMAIL_BOUNCED', 'EMAIL_COMPLAINT', 'AUTOMATION_APPLIED');

-- CreateEnum
CREATE TYPE "SupportAttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'BLOCKED', 'SCAN_FAILED');

-- CreateEnum
CREATE TYPE "SupportAttachmentRejectionReason" AS ENUM ('OVERSIZE', 'INVALID_BASE64', 'BLOCKED_TYPE', 'STORAGE_UNAVAILABLE', 'STORAGE_FAILED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('OPERATIONAL', 'COMMUNICATION', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('UPDATE', 'NEEDS_ATTENTION', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationRecipientReason" AS ENUM ('CURRENT_ASSIGNEE', 'ON_DUTY_SUPERVISOR', 'DEPARTMENT_MANAGER', 'ASSET_OWNER', 'WORK_ORDER_ASSIGNEE', 'ON_CALL_RESPONDER', 'ESCALATION_TARGET', 'FACILITY_ADMIN');

-- CreateEnum
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('IN_APP', 'WEB_PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "displayName" TEXT,
    "organizationType" "OrganizationType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "managementCompanyName" TEXT,
    "billingEmail" TEXT,
    "stripeCustomerId" TEXT,
    "stripeDefaultPaymentMethodId" TEXT,
    "onboardingCurrentStep" TEXT,
    "onboardingStartedAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingEntryConfirmedAt" TIMESTAMP(3),
    "brandColor" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "vocabularyProfile" TEXT,
    "vocabularyLevel0Label" TEXT,
    "vocabularyLevel1Label" TEXT,
    "vocabularyLevel2Label" TEXT,
    "vocabularyLevel3Label" TEXT,
    "unionHandbookPdfPath" TEXT,
    "unionHandbookOriginalFilename" TEXT,
    "unionHandbookUploadedAt" TIMESTAMP(3),
    "unionHandbookEffectiveDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showInEmployeeApp" BOOLEAN NOT NULL DEFAULT true,
    "headEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperatorRelationship" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "externalAccountCode" TEXT,
    "contractReference" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperatorRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentVendorHeadAssignment" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "operatorRelationshipId" TEXT NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "status" "DepartmentVendorHeadAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentVendorHeadAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityPartnerOrganization" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityPartnerAccessPeriod" (
    "id" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerAccessPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityPartnerDepartmentScope" (
    "id" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerDepartmentScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityPartnerRoleCeilingPeriod" (
    "id" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "maxPartnerRole" "OrganizationPartnerRole" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerRoleCeilingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerUserFacilityAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerUserFacilityAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerUserRolePeriod" (
    "id" TEXT NOT NULL,
    "partnerUserFacilityAccessId" TEXT NOT NULL,
    "partnerRole" "OrganizationPartnerRole" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdByAuthorityKind" "PartnerAssignmentAuthorityKind" NOT NULL,
    "createdByOrganizationId" TEXT,
    "endedByAuthorityKind" "PartnerAssignmentAuthorityKind",
    "endedByOrganizationId" TEXT,
    "endReason" "PartnerUserRolePeriodEndReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerUserRolePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityPartnerStaffingPolicyPeriod" (
    "id" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdByAuthorityKind" "PartnerAssignmentAuthorityKind" NOT NULL,
    "createdByOrganizationId" TEXT,
    "endedByAuthorityKind" "PartnerAssignmentAuthorityKind",
    "endedByOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityPartnerUserRestrictionPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityPartnerOrganizationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "note" TEXT,
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdByAuthorityKind" "PartnerAssignmentAuthorityKind" NOT NULL,
    "createdByOrganizationId" TEXT,
    "endedByAuthorityKind" "PartnerAssignmentAuthorityKind",
    "endedByOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityPartnerUserRestrictionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrganizationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrganizationRolePeriod" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "role" "OrganizationMembershipRole" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOrganizationRolePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationClaimInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetEmailNormalized" TEXT NOT NULL,
    "contactName" TEXT,
    "notes" TEXT,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "OrganizationClaimStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT,
    "requestedFromFacilityId" TEXT,
    "approvedByPlatformStaffId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByPlatformStaffId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "revokedByPlatformStaffId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastInvitationDeliveredAt" TIMESTAMP(3),
    "lastInvitationDeliveryStatus" TEXT,
    "lastInvitationDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationClaimInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMemberInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetEmailNormalized" TEXT NOT NULL,
    "intendedRole" "OrganizationMembershipRole" NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "OrganizationMemberInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT,
    "invitedByPlatformStaffId" TEXT,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastInvitationDeliveredAt" TIMESTAMP(3),
    "lastInvitationDeliveryStatus" TEXT,
    "lastInvitationDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMemberInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityBilling" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "status" "FacilityBillingStatus" NOT NULL DEFAULT 'UNMANAGED',
    "interval" "BillingInterval" NOT NULL DEFAULT 'ANNUAL',
    "setupPath" "BillingSetupPath" NOT NULL DEFAULT 'SELF_SERVE',
    "stripeSubscriptionId" TEXT,
    "licensedDepartmentCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityDepartmentEntitlement" (
    "id" TEXT NOT NULL,
    "facilityBillingId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "departmentId" TEXT,
    "status" "DepartmentEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "stripeSubscriptionItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityDepartmentEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentStaffManager" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grantedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentStaffManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDepartment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "roleType" "RoleKey" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingManagerInvite" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "invitedByUserId" TEXT,
    "acceptedByUserId" TEXT,
    "grantAcceptedAt" TIMESTAMP(3),
    "lastDeliveryAt" TIMESTAMP(3),
    "deliveryStatus" TEXT,
    "departmentId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,

    CONSTRAINT "OnboardingManagerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MenuStatus" NOT NULL DEFAULT 'ACTIVE',
    "operatorPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCycleSettings" (
    "id" TEXT NOT NULL,
    "menuId" TEXT,
    "facilityId" TEXT NOT NULL,
    "cycleLengthWeeks" INTEGER NOT NULL DEFAULT 3,
    "weekStartsOn" "MenuWeekStartDay" NOT NULL DEFAULT 'SUNDAY',
    "cycleAnchorDate" DATE NOT NULL,
    "periodConfigJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCycleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT,
    "facilityId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "mealPeriodKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "portionValue" TEXT,
    "portionUnit" TEXT,
    "entryType" "MenuItemEntryType" NOT NULL DEFAULT 'FIXED',
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuLocationApplicability" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "unitId" TEXT,
    "spaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuLocationApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuOperationalCycleApplicability" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "menuPeriodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuOperationalCycleApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "facilityId" TEXT,
    "roleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "primaryDepartmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountInviteToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspacePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "hiddenSectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collapsedSectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sectionOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLandingSectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspacePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "quietEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietStartMinute" INTEGER,
    "quietEndMinute" INTEGER,
    "updateDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevokedUserSession" (
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedUserSession_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorizedSessionVersion" INTEGER,
    "authorizedUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "PushSubscriptionRevocationReason",

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDispatch" (
    "id" TEXT NOT NULL,
    "notificationRecipientId" TEXT NOT NULL,
    "pushSubscriptionId" TEXT NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "status" "PushDispatchStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeId" TEXT,
    "scopeKind" "DashboardScopeKind" NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardFacilityDefault" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "authority" "DashboardAuthority" NOT NULL,
    "scopeKind" "DashboardScopeKind" NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardFacilityDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFacilityAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFacilityAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFacilityRolePeriod" (
    "id" TEXT NOT NULL,
    "userFacilityAccessId" TEXT NOT NULL,
    "roleKey" "RoleKey" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFacilityRolePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityAdministratorInvitation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "kind" "FacilityAdministratorInvitationKind" NOT NULL,
    "status" "FacilityAdministratorInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedUserId" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "outgoingUserId" TEXT,
    "outgoingRoleKey" "RoleKey",
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityAdministratorInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "hierarchyRole" "UnitHierarchyRole",
    "parentUnitId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitDepartmentResponsibility" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "kind" "UnitDepartmentKind" NOT NULL DEFAULT 'PRIMARY',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskLevel" TEXT,
    "cleaningFrequency" TEXT,
    "inspectionFrequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitDepartmentResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityRoomType" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "baseTypeKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityRoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitSpace" (
    "id" TEXT NOT NULL,
    "unitId" TEXT,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spaceType" "SpaceType" NOT NULL,
    "customTypeLabel" TEXT,
    "facilityRoomTypeId" TEXT,
    "parentSpaceId" TEXT,
    "roomNumber" TEXT,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentTeam" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "DepartmentTeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "managerEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentTeamRoomMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentTeamRoomMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTeamMembership" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitSpaceResponsibility" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitSpaceResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "userId" TEXT,
    "pinDigest" TEXT,
    "primaryUnitId" TEXT,
    "primaryDepartmentId" TEXT,
    "operatorPeriodId" TEXT,
    "jobTitleId" TEXT,
    "roleType" "RoleKey" NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "unionMember" BOOLEAN NOT NULL DEFAULT false,
    "hireDate" DATE,
    "birthMonth" INTEGER,
    "birthDay" INTEGER,
    "jobClassification" "JobClassification",
    "chrcStatus" "ChrcStatus",
    "chrcClearedAt" TIMESTAMP(3),
    "chrcNotes" TEXT,
    "onLeave" BOOLEAN NOT NULL DEFAULT false,
    "shirtSize" TEXT,
    "hrNotes" TEXT,
    "terminationDate" DATE,
    "chrcOffboardingCompletedAt" TIMESTAMP(3),
    "chrcOffboardingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeUserLinkInvitation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "targetEmailNormalized" TEXT NOT NULL,
    "intendedRoleKey" "RoleKey" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "EmployeeUserLinkInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeUserLinkInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkStation" (
    "employeeId" TEXT NOT NULL,
    "station" "WorkStation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeWorkStation_pkey" PRIMARY KEY ("employeeId","station")
);

-- CreateTable
CREATE TABLE "DisciplinePointEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" "DisciplinePointCategory" NOT NULL,
    "points" INTEGER NOT NULL,
    "occurredAt" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinePointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeHrAuditLog" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT,
    "fieldKey" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeHrAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTerminationRecord" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "terminatedAt" DATE NOT NULL,
    "lastShiftWorkedAt" DATE,
    "separationKind" "SeparationKind" NOT NULL DEFAULT 'TERMINATED',
    "wouldRehire" BOOLEAN,
    "snapshotJson" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTerminationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeUnitAccess" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeUnitAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskUnitPinLoginEvent" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "unassignedToUnit" BOOLEAN NOT NULL,
    "clientIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskUnitPinLoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roleType" "RoleKey" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" "ShiftType" NOT NULL,
    "roleType" "RoleKey",
    "unitId" TEXT,
    "departmentId" TEXT,
    "operatorPeriodId" TEXT,
    "workShiftId" TEXT,
    "plannedStart" TEXT,
    "plannedEnd" TEXT,
    "calledOffAt" TIMESTAMP(3),
    "callOffReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "contactName" TEXT,
    "notes" TEXT,
    "ownerOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityOrganization" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintainerProposal" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "facilityOrganizationId" TEXT NOT NULL,
    "proposedByUserId" TEXT,
    "status" "AssetMaintainerProposalStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintainerProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "spaceId" TEXT,
    "departmentId" TEXT,
    "responsibleOrganizationId" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "facilityAssetNumber" TEXT,
    "description" TEXT,
    "vendorId" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "criticality" "AssetCriticality" NOT NULL DEFAULT 'ROUTINE',
    "notes" TEXT,
    "procedureInstructions" TEXT,
    "inServiceDate" DATE,
    "warrantyExpiresAt" DATE,
    "retiredAt" TIMESTAMP(3),
    "retiredReason" TEXT,
    "titleKind" "AssetTitleKind" NOT NULL DEFAULT 'FACILITY',
    "titleOrganizationId" TEXT,
    "createdByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPresenceNote" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "onSiteFrom" DATE NOT NULL,
    "onSiteTo" DATE NOT NULL,
    "titleOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPresenceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetStatusHistory" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromStatus" "AssetStatus",
    "toStatus" "AssetStatus" NOT NULL,
    "reason" "AssetStatusChangeReason" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "changedByUserId" TEXT,
    "sourceIssueId" TEXT,
    "sourceRepairId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetIssue" (
    "id" TEXT NOT NULL,
    "issueCode" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "assetId" TEXT,
    "unitId" TEXT NOT NULL,
    "spaceId" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AssetIssueStatus" NOT NULL DEFAULT 'REPORTED',
    "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
    "operationalImpact" "AssetOperationalImpact" NOT NULL DEFAULT 'NO_IMMEDIATE_IMPACT',
    "equipmentRemainsUsable" BOOLEAN NOT NULL DEFAULT true,
    "workaroundInstruction" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synchronizedAt" TIMESTAMP(3),
    "recordedOnline" BOOLEAN NOT NULL DEFAULT true,
    "clientCommandId" TEXT,
    "deviceBoundUnitId" TEXT,
    "reportedByUserId" TEXT,
    "reportedByEmployeeId" TEXT,
    "reportedByLabel" TEXT,
    "triageNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "originEvidenceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetIssueUpdate" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "updateText" TEXT NOT NULL,
    "statusAfterUpdate" "AssetIssueStatus",
    "updatedByUserId" TEXT,
    "updatedByEmployeeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetIssueUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetIssueEvidenceLink" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "evidenceRecordId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "AssetIssueEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentRequestRoute" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "requestingDepartmentId" TEXT NOT NULL,
    "responsibleDepartmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRequestRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalRequest" (
    "id" TEXT NOT NULL,
    "requestCode" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "requestingDepartmentId" TEXT NOT NULL,
    "responsibleDepartmentId" TEXT NOT NULL,
    "affectedDepartmentId" TEXT,
    "unitId" TEXT NOT NULL,
    "spaceId" TEXT,
    "assetId" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "OperationalRequestStatus" NOT NULL DEFAULT 'REPORTED',
    "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
    "operationalImpact" "AssetOperationalImpact" NOT NULL DEFAULT 'NO_IMMEDIATE_IMPACT',
    "equipmentRemainsUsable" BOOLEAN,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requesterVisibleStatusSummary" TEXT,
    "workaroundInstruction" TEXT,
    "reportedByUserId" TEXT,
    "reportedByEmployeeId" TEXT,
    "reportedByLabel" TEXT,
    "triageNote" TEXT,
    "resolutionReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "relatedAssetIssueId" TEXT,
    "workOrderId" TEXT,
    "clientCommandId" TEXT,
    "recordedOnline" BOOLEAN NOT NULL DEFAULT true,
    "synchronizedAt" TIMESTAMP(3),
    "deviceBoundUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalRequestUpdate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "updateText" TEXT NOT NULL,
    "statusAfterUpdate" "OperationalRequestStatus",
    "updatedByUserId" TEXT,
    "updatedByEmployeeId" TEXT,
    "requesterVisible" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalRequestUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalRequestEvidenceLink" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "evidenceRecordId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "OperationalRequestEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceCategory" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL,
    "repairCode" TEXT NOT NULL,
    "assetId" TEXT,
    "unitId" TEXT NOT NULL,
    "spaceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
    "responseRequirement" "WorkOrderResponseRequirement" NOT NULL DEFAULT 'STANDARD',
    "status" "RepairStatus" NOT NULL DEFAULT 'OPEN',
    "workOrderKind" "WorkOrderKind" NOT NULL DEFAULT 'CORRECTIVE',
    "repairTrade" "RepairTrade" NOT NULL DEFAULT 'GENERAL',
    "requestingDepartmentId" TEXT,
    "responsibleDepartmentId" TEXT,
    "assignedEmployeeId" TEXT,
    "pmOccurrenceId" TEXT,
    "dueAt" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "estimatedLaborMinutes" INTEGER,
    "partsNote" TEXT,
    "workPerformed" TEXT,
    "payerOrganizationId" TEXT,
    "externalCost" DECIMAL(12,2),
    "externalCostNote" TEXT,
    "assetConditionReview" "RepairAssetConditionReview",
    "assetConditionReviewedAt" TIMESTAMP(3),
    "assetConditionReviewedByUserId" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "returnToServiceReady" BOOLEAN NOT NULL DEFAULT false,
    "reportedById" TEXT,
    "vendorId" TEXT,
    "issueId" TEXT,
    "holdReason" "WorkOrderHoldReason",
    "procedureVersionId" TEXT,
    "maintenanceCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairEvidenceLink" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "evidenceRecordId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "RepairEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairLaborEntry" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT,

    CONSTRAINT "RepairLaborEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPartUsed" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "partNumber" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "lineCost" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "RepairPartUsed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRecordRequirement" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "templateStableKey" TEXT,
    "templateVersion" INTEGER,
    "templateName" TEXT,
    "catalogDefinitionId" TEXT,
    "catalogStableKey" TEXT,
    "catalogVersion" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "RepairRecordRequirementStatus" NOT NULL DEFAULT 'PENDING',
    "satisfiedByRecordId" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waivedByUserId" TEXT,
    "waiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "RepairRecordRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairUpdate" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "updateText" TEXT NOT NULL,
    "updatedById" TEXT,
    "statusAfterUpdate" "RepairStatus",
    "requesterVisible" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderResponseHistory" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "fromRequirement" "WorkOrderResponseRequirement",
    "toRequirement" "WorkOrderResponseRequirement" NOT NULL,
    "transition" "WorkOrderResponseTransition" NOT NULL,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderResponseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenancePlan" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "PreventiveMaintenancePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "retiredAt" TIMESTAMP(3),
    "retiredByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveMaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenancePlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PreventiveMaintenancePlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdFromVersionId" TEXT,
    "name" TEXT NOT NULL,
    "instructions" TEXT,
    "maintenanceCategoryId" TEXT,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "anchorDate" DATE NOT NULL,
    "effectiveDate" DATE,
    "generationLeadDays" INTEGER NOT NULL DEFAULT 7,
    "priority" "RepairPriority" NOT NULL DEFAULT 'MEDIUM',
    "procedureVersionId" TEXT,
    "defaultAssignedEmployeeId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveMaintenancePlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenancePlanRecordRequirement" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "templateStableKey" TEXT,
    "templateVersion" INTEGER,
    "templateName" TEXT,
    "catalogDefinitionId" TEXT,
    "catalogStableKey" TEXT,
    "catalogVersion" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenanceOccurrence" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "status" "PreventiveMaintenanceOccurrenceStatus" NOT NULL DEFAULT 'OPEN',
    "skippedAt" TIMESTAMP(3),
    "skippedByUserId" TEXT,
    "skipReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedWorkOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveMaintenanceOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAreaStatus" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "statusDate" DATE NOT NULL,
    "status" "RoomAreaOperationalStatus" NOT NULL,
    "notes" TEXT,
    "updatedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomAreaStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "parentKind" "AttachmentParentKind" NOT NULL,
    "repairId" TEXT,
    "assetId" TEXT,
    "fileRelativePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "KnowledgeArticleCategory" NOT NULL,
    "sourceType" "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "KnowledgeArticleVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdFromVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleUnit" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleAsset" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleCatalogDefinition" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "catalogDefinitionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleCatalogDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiOperationalBrief" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "briefType" "AiBriefType" NOT NULL DEFAULT 'MORNING_BRIEF',
    "snapshotHash" TEXT NOT NULL,
    "snapshotJson" JSONB,
    "baselineSnapshotHash" TEXT,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "resultJson" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiBriefStatus" NOT NULL DEFAULT 'READY',
    "promptVersion" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperationalBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAssignmentPlan" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "status" "OperationalAssignmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "coverageAcknowledgedAt" TIMESTAMP(3),
    "coverageAcknowledgedByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "lastChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalZone" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "DepartmentOperationalZoneStatus" NOT NULL DEFAULT 'DRAFT',
    "retiredAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "lastChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalZoneLocation" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "unitSpaceId" TEXT NOT NULL,
    "unitId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalZoneLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAssignmentLocation" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "unitSpaceId" TEXT NOT NULL,
    "unitId" TEXT,
    "labelSnapshot" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalAssignmentLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAssignment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "planId" TEXT,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT,
    "sourceZoneId" TEXT,
    "templateItemId" TEXT,
    "serviceDate" DATE NOT NULL,
    "roleKey" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "OperationalAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "source" "OperationalAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "changeReason" TEXT,
    "clientCommandId" TEXT,
    "createdByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "lastChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeOperationalRoleQualification" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "status" "EmployeeOperationalQualificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeOperationalRoleQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAssignmentEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT,
    "planId" TEXT,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "employeeId" TEXT,
    "unitId" TEXT,
    "serviceDate" DATE,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "authMethod" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "summary" TEXT NOT NULL,
    "reason" TEXT,
    "priorValuesJson" TEXT,
    "newValuesJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageEpisode" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "spaceId" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closeReason" "CoverageEpisodeCloseReason",
    "openingState" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageEpisodeTransition" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageEpisodeTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAssignmentTemplate" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OperationalAssignmentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "publishedAt" TIMESTAMP(3),
    "workShiftId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAssignmentTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "unitId" TEXT,
    "spaceId" TEXT,
    "applicableOperationalCycleStableKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAtLocal" TEXT,
    "endsAtLocal" TEXT,
    "requiredCount" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAssignmentTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimitBucket" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "bucketType" "AuthRateLimitBucketType" NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineBundleIssuance" (
    "spaceScope" JSONB,
    "spaceManifest" JSONB,
    "recoveryKeyEnvelope" JSONB,
    "recoveryAfter" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmployeeId" TEXT,
    "actorRole" "RoleKey" NOT NULL,
    "authMethod" "SessionAuthMethod" NOT NULL,
    "deviceFacilityId" TEXT NOT NULL,
    "deviceBoundUnitId" TEXT,
    "sessionVersion" INTEGER NOT NULL,
    "bundleVersion" TEXT NOT NULL,
    "serverRevision" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineAuthorizedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineBundleIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSyncReceipt" (
    "issuanceId" TEXT,
    "intentDigest" TEXT,
    "authoritativeRecordId" TEXT,
    "outcome" JSONB,
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "resultCategory" TEXT NOT NULL,
    "reasonCode" TEXT,
    "actorUserId" TEXT,
    "actorEmployeeId" TEXT,
    "sessionVersion" INTEGER NOT NULL,
    "deviceBoundUnitId" TEXT,
    "locallyRecordedAt" TIMESTAMP(3),
    "serverAcceptedAt" TIMESTAMP(3),
    "milestoneEntryId" TEXT,
    "evidenceRecordId" TEXT,
    "assetIssueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineSyncReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineConflict" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "conflictCategory" TEXT NOT NULL,
    "commandPayload" JSONB NOT NULL,
    "authoritativeState" JSONB NOT NULL,
    "reasonCode" TEXT,
    "resolution" "OfflineConflictResolution" NOT NULL DEFAULT 'PENDING',
    "resolvedByUserId" TEXT,
    "resolvedByEmployeeId" TEXT,
    "resolutionReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalCycle" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "operatorPeriodId" TEXT,
    "stableKey" TEXT NOT NULL,
    "parentStableKey" TEXT,
    "nodeKind" "OperationalCycleNodeKind" NOT NULL DEFAULT 'PERIOD',
    "occurrenceTracking" "OperationalCycleOccurrenceTracking" NOT NULL DEFAULT 'REQUIRED',
    "keyPointGrain" "OperationalCycleKeyPointGrain" NOT NULL DEFAULT 'LOCATION',
    "timingAdjustmentRevision" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "cycleType" "OperationalCycleType" NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 100,
    "startLocal" TEXT,
    "endLocal" TEXT,
    "overnight" BOOLEAN NOT NULL DEFAULT false,
    "applicableDaysOfWeek" INTEGER[],
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "mealType" "MealType",
    "locationMode" "OperationalCycleLocationMode" NOT NULL DEFAULT 'ALL_DEPARTMENT_UNITS',
    "locationInheritFromParent" BOOLEAN NOT NULL DEFAULT false,
    "expectedMilestones" "ServeryMilestone"[],
    "status" "OperationalCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "publishedByUserId" TEXT,
    "lastChangedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalCycleLocation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "unitId" TEXT,
    "spaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalCycleLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalCycleKeyTimeGroup" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "dueLocal" TEXT NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalCycleKeyTimeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalCycleKeyTimeGroupRoom" (
    "id" TEXT NOT NULL,
    "keyTimeGroupId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalCycleKeyTimeGroupRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalCycleMilestoneTime" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "milestone" "ServeryMilestone" NOT NULL,
    "configuredTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalCycleMilestoneTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalCycleDayExpectation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "cycleVersion" INTEGER NOT NULL,
    "cycleLabel" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "unitId" TEXT NOT NULL,
    "milestone" "ServeryMilestone" NOT NULL,
    "configuredTime" TEXT,
    "adjustedTime" TEXT,
    "adjustmentReason" TEXT,
    "adjustedAt" TIMESTAMP(3),
    "adjustedByUserId" TEXT,
    "adjustedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalCycleDayExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalCycleKeyTimeDayExpectation" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "cycleVersion" INTEGER NOT NULL,
    "cycleLabel" TEXT NOT NULL,
    "parentCycleLabel" TEXT,
    "displayPath" TEXT NOT NULL,
    "keyTimeGroupId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "configuredDueLocal" TEXT NOT NULL,
    "adjustedDueLocal" TEXT,
    "adjustmentReason" TEXT,
    "adjustedAt" TIMESTAMP(3),
    "adjustedByUserId" TEXT,
    "adjustedByEmployeeId" TEXT,
    "actualDueLocal" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "completedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalCycleKeyTimeDayExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalCycleTimingAdjustment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "cycleVersion" INTEGER NOT NULL,
    "adjustedStartLocal" TEXT,
    "adjustedEndLocal" TEXT,
    "adjustedDueLocal" TEXT,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmployeeId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalCycleTimingAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalCycleKeyPointActual" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "cycleVersion" INTEGER NOT NULL,
    "spaceId" TEXT,
    "actualLocal" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorEmployeeId" TEXT,
    "correctionReason" TEXT,
    "correctsActualId" TEXT,

    CONSTRAINT "OperationalCycleKeyPointActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentOperationalCycleEvent" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "detailJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentOperationalCycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvidenceRecord" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "operatorPeriodId" TEXT,
    "logAttachmentId" TEXT,
    "attachmentStableKey" TEXT,
    "catalogDefinitionId" TEXT,
    "templateStableKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "templateName" TEXT NOT NULL,
    "purposeType" "OperationalTemplatePurposeType" NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "logRequirementKey" TEXT,
    "operationalDate" DATE NOT NULL,
    "scheduleKind" "OperationalTemplateScheduleKind" NOT NULL,
    "cycleStableKey" TEXT,
    "cycleLabel" TEXT,
    "windowStartLocal" TEXT,
    "windowEndLocal" TEXT,
    "unitId" TEXT,
    "spaceId" TEXT,
    "placeLabelSnapshot" TEXT,
    "assetId" TEXT,
    "status" "OperationalEvidenceRecordStatus" NOT NULL DEFAULT 'COMPLETED',
    "outOfStandard" BOOLEAN NOT NULL DEFAULT false,
    "correctiveActionText" TEXT,
    "correctiveActionAt" TIMESTAMP(3),
    "correctiveActionByUserId" TEXT,
    "correctiveActionByEmployeeId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synchronizedAt" TIMESTAMP(3),
    "recordedOnline" BOOLEAN NOT NULL DEFAULT true,
    "clientCommandId" TEXT,
    "deviceBoundUnitId" TEXT,
    "recordedByUserId" TEXT,
    "recordedByEmployeeId" TEXT,
    "recordedByLabel" TEXT,
    "actingAccessKind" TEXT,
    "actingPartnerOrganizationId" TEXT,
    "actingFacilityPartnerOrganizationId" TEXT,
    "actingEffectivePartnerRole" "OrganizationPartnerRole",
    "followsRecordId" TEXT,
    "templateSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalEvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvidenceAttachment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldKey" TEXT,
    "kind" "OperationalEvidenceAttachmentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" TEXT,
    "uploadedByEmployeeId" TEXT,
    "uploadedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvidenceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvidenceFieldValue" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "OperationalEvidenceFieldType" NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBoolean" BOOLEAN,
    "valueDateTime" TIMESTAMP(3),
    "valueSelections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outOfStandard" BOOLEAN NOT NULL DEFAULT false,
    "groupKey" TEXT NOT NULL DEFAULT '',
    "rowKey" TEXT NOT NULL DEFAULT '',
    "rowSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvidenceFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvidenceCorrection" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousValuesJson" JSONB NOT NULL,
    "previousStatus" "OperationalEvidenceRecordStatus" NOT NULL,
    "previousCorrectiveActionText" TEXT,
    "correctedByUserId" TEXT,
    "correctedByEmployeeId" TEXT,
    "correctedByLabel" TEXT,
    "actingAccessKind" TEXT,
    "actingPartnerOrganizationId" TEXT,
    "actingFacilityPartnerOrganizationId" TEXT,
    "actingEffectivePartnerRole" "OrganizationPartnerRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvidenceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogLogDefinition" (
    "id" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "CatalogLogStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "purposeType" "CatalogLogPurposeType" NOT NULL,
    "category" "CatalogLogCategory" NOT NULL DEFAULT 'OTHER',
    "recommendedCadence" "CatalogRecommendedCadence",
    "recommendedScheduleKind" "OperationalTemplateScheduleKind",
    "recommendedDaypartLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedFixedWindowsJson" JSONB,
    "suggestionsJson" JSONB NOT NULL DEFAULT '{}',
    "rulesJson" JSONB NOT NULL DEFAULT '[]',
    "passingScore" INTEGER,
    "criticalFailureForcesFailure" BOOLEAN NOT NULL DEFAULT false,
    "sectionsJson" JSONB NOT NULL DEFAULT '[]',
    "repeatingGroupsJson" JSONB NOT NULL DEFAULT '[]',
    "calculationsJson" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "ownerKind" "CatalogFormOwnerKind" NOT NULL DEFAULT 'VSSYL',
    "ownerFacilityId" TEXT,
    "ownerOrganizationId" TEXT,
    "operatorPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogLogDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogLogField" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "OperationalEvidenceFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "displaySequence" INTEGER NOT NULL,
    "helpText" TEXT,
    "unitLabel" TEXT,
    "minNumber" DOUBLE PRECISION,
    "maxNumber" DOUBLE PRECISION,
    "allowedSelections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctiveActionTrigger" BOOLEAN NOT NULL DEFAULT false,
    "correctiveActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "sectionKey" TEXT,
    "scoreWeight" INTEGER,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "creditValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogLogField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSectionComponent" (
    "id" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "CatalogLogStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "structureJson" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSectionComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityCatalogInstall" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "catalogDefinitionId" TEXT NOT NULL,
    "catalogStableKey" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityCatalogInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAttachment" (
    "id" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "catalogDefinitionId" TEXT NOT NULL,
    "catalogStableKey" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL,
    "status" "LogAttachmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "retiredAt" TIMESTAMP(3),
    "localDisplayLabel" TEXT,
    "localInstructions" TEXT,
    "targetKind" "LogAttachmentTargetKind" NOT NULL,
    "assetId" TEXT,
    "spaceId" TEXT,
    "unitId" TEXT,
    "targetDepartmentId" TEXT,
    "timingMode" "LogAttachmentTimingMode" NOT NULL,
    "calendarCadence" "LogAttachmentCalendarCadence",
    "calendarDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "calendarDayOfMonth" INTEGER,
    "calendarDueTimeLocal" TEXT,
    "allowAdHoc" BOOLEAN NOT NULL DEFAULT false,
    "waiverAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAttachmentDailyWindow" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "displaySequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogAttachmentDailyWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAttachmentCycleSelection" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "cycleStableKey" TEXT NOT NULL,
    "displaySequence" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAttachmentCycleSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformStaff" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "PlatformStaffRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupImportBatch" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorStaffId" TEXT,
    "actorSnapshot" JSONB NOT NULL,
    "dataset" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "planDigest" TEXT NOT NULL,
    "reviewedPlan" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),

    CONSTRAINT "SetupImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupImportResult" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'IMPORT',
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "intendedKey" TEXT NOT NULL,
    "targetIds" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "confirmedDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupImportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarborAuditEvent" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "action" "HarborAuditAction" NOT NULL,
    "facilityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HarborAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "userId" TEXT,
    "facilityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "replyToken" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'NEW',
    "type" "SupportTicketType",
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "contactId" TEXT NOT NULL,
    "facilityId" TEXT,
    "assignedStaffId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" "SupportTicketMessageKind" NOT NULL,
    "authorStaffId" TEXT,
    "contactId" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "strippedReplyText" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "toEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT,
    "subject" TEXT,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerMessageId" TEXT,
    "inboundHeaders" JSONB,
    "attachmentManifest" JSONB,
    "deliveryStatus" "SupportMessageDeliveryStatus",
    "deliveryError" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "lastDeliveryEventAt" TIMESTAMP(3),
    "bounceType" TEXT,
    "bounceCode" TEXT,
    "bounceDescription" TEXT,
    "complaintType" TEXT,
    "clientSubmissionId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketAttachment" (
    "scanCycle" INTEGER NOT NULL DEFAULT 1,
    "scanLeaseToken" TEXT,
    "scanLeaseExpiresAt" TIMESTAMP(3),
    "nextScanAt" TIMESTAMP(3),
    "scannedAt" TIMESTAMP(3),
    "scannerProvider" TEXT,
    "scannerEngineVersion" TEXT,
    "scannerSignatureVersion" TEXT,
    "scanResultCode" TEXT,
    "scanFailureReason" TEXT,
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT,
    "checksumSha256" TEXT,
    "contentId" TEXT,
    "scanStatus" "SupportAttachmentScanStatus" NOT NULL,
    "rejectionReason" "SupportAttachmentRejectionReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportSavedReply" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportSavedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketTag" (
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedByStaffId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketTag_pkey" PRIMARY KEY ("ticketId","tagId")
);

-- CreateTable
CREATE TABLE "SupportMacro" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "savedReplyId" TEXT,
    "status" "SupportTicketStatus",
    "statusAfterReply" "SupportTicketStatus",
    "type" "SupportTicketType",
    "priority" "SupportTicketPriority",
    "assignmentMode" "SupportMacroAssignmentMode" NOT NULL DEFAULT 'UNCHANGED',
    "assignedStaffId" TEXT,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportMacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMacroTag" (
    "macroId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "SupportMacroTag_pkey" PRIMARY KEY ("macroId","tagId")
);

-- CreateTable
CREATE TABLE "SupportMacroApplication" (
    "id" TEXT NOT NULL,
    "macroId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "appliedByStaffId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "macroName" TEXT NOT NULL,

    CONSTRAINT "SupportMacroApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportStaffNotification" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "SupportStaffNotificationType" NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "emailStatus" "SupportStaffNotificationEmailStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportStaffNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupportAutomationType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "delayMinutes" INTEGER NOT NULL,
    "savedReplyId" TEXT,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" "SupportAutomationAction" NOT NULL,
    "outcome" "SupportAutomationRunOutcome" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "reason" TEXT,
    "messageId" TEXT,
    "eventId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "SupportTicketEventType" NOT NULL,
    "actorStaffId" TEXT,
    "causedByMessageId" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalRecordWaiver" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "operationalDate" DATE NOT NULL,
    "logAttachmentId" TEXT,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT,
    "recordedByEmployeeId" TEXT,
    "recordedByLabel" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalRecordWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceNameChange" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "placeKind" TEXT NOT NULL,
    "unitSpaceId" TEXT,
    "unitId" TEXT,
    "previousLabel" TEXT NOT NULL,
    "newLabel" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT,

    CONSTRAINT "PlaceNameChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationEngagement" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "responsibleStaffId" TEXT,
    "supportTicketId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "deliveryRevision" INTEGER NOT NULL DEFAULT 0,
    "acceptedRevision" INTEGER,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "requestedScope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationOrder" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "scope" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "waivedByStaffId" TEXT,
    "waiverReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'QUOTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationPaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "checkoutUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationParticipant" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT,
    "staffId" TEXT,

    CONSTRAINT "ImplementationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationEvent" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorStaffId" TEXT,
    "providerEventId" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationImportLink" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImplementationImportLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAttachmentScanAttempt" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "expectedSha256" TEXT NOT NULL,
    "expectedSizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "resultCode" TEXT,
    "engineVersion" TEXT,
    "signatureVersion" TEXT,
    "signatureUpdatedAt" TIMESTAMP(3),
    "scannedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAttachmentScanAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionPath" TEXT,
    "groupKey" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "policyVersion" TEXT NOT NULL,
    "escalationDueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalationPolicyVersion" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "NotificationRecipientReason" NOT NULL,
    "explanation" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationRecipientId" TEXT NOT NULL,
    "channel" "NotificationDeliveryChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledEvaluationLease" (
    "evaluatorKey" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resumeAfter" TEXT,
    "resumeFacilityId" TEXT,
    "lastAttemptedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastOutcome" TEXT,
    "lastFailureCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessingFailureCount" INTEGER NOT NULL DEFAULT 0,
    "lastCycleCompletedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledEvaluationLease_pkey" PRIMARY KEY ("evaluatorKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");

-- CreateIndex
CREATE INDEX "Facility_organizationId_idx" ON "Facility"("organizationId");

-- CreateIndex
CREATE INDEX "Department_facilityId_idx" ON "Department"("facilityId");

-- CreateIndex
CREATE INDEX "Department_facilityId_showInEmployeeApp_idx" ON "Department"("facilityId", "showInEmployeeApp");

-- CreateIndex
CREATE INDEX "Department_headEmployeeId_idx" ON "Department"("headEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_facilityId_key_key" ON "Department"("facilityId", "key");

-- CreateIndex
CREATE INDEX "DepartmentOperatorRelationship_departmentId_effectiveFrom_idx" ON "DepartmentOperatorRelationship"("departmentId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "DepartmentOperatorRelationship_departmentId_effectiveTo_idx" ON "DepartmentOperatorRelationship"("departmentId", "effectiveTo");

-- CreateIndex
CREATE INDEX "DepartmentOperatorRelationship_organizationId_idx" ON "DepartmentOperatorRelationship"("organizationId");

-- CreateIndex
CREATE INDEX "DepartmentOperatorRelationship_createdByUserId_idx" ON "DepartmentOperatorRelationship"("createdByUserId");

-- CreateIndex
CREATE INDEX "DepartmentVendorHeadAssignment_departmentId_status_idx" ON "DepartmentVendorHeadAssignment"("departmentId", "status");

-- CreateIndex
CREATE INDEX "DepartmentVendorHeadAssignment_assigneeUserId_status_idx" ON "DepartmentVendorHeadAssignment"("assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "DepartmentVendorHeadAssignment_operatorRelationshipId_idx" ON "DepartmentVendorHeadAssignment"("operatorRelationshipId");

-- CreateIndex
CREATE INDEX "DepartmentVendorHeadAssignment_assignedByUserId_idx" ON "DepartmentVendorHeadAssignment"("assignedByUserId");

-- CreateIndex
CREATE INDEX "FacilityPartnerOrganization_facilityId_idx" ON "FacilityPartnerOrganization"("facilityId");

-- CreateIndex
CREATE INDEX "FacilityPartnerOrganization_organizationId_idx" ON "FacilityPartnerOrganization"("organizationId");

-- CreateIndex
CREATE INDEX "FacilityPartnerOrganization_endedAt_idx" ON "FacilityPartnerOrganization"("endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityPartnerOrganization_facilityId_organizationId_key" ON "FacilityPartnerOrganization"("facilityId", "organizationId");

-- CreateIndex
CREATE INDEX "FacilityPartnerAccessPeriod_partner_startsAt_idx" ON "FacilityPartnerAccessPeriod"("facilityPartnerOrganizationId", "startsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerAccessPeriod_partner_endsAt_idx" ON "FacilityPartnerAccessPeriod"("facilityPartnerOrganizationId", "endsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerDeptScope_partner_startsAt_idx" ON "FacilityPartnerDepartmentScope"("facilityPartnerOrganizationId", "startsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerDeptScope_partner_dept_startsAt_idx" ON "FacilityPartnerDepartmentScope"("facilityPartnerOrganizationId", "departmentId", "startsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerDeptScope_departmentId_idx" ON "FacilityPartnerDepartmentScope"("departmentId");

-- CreateIndex
CREATE INDEX "FacilityPartnerRoleCeiling_partner_startsAt_idx" ON "FacilityPartnerRoleCeilingPeriod"("facilityPartnerOrganizationId", "startsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerRoleCeiling_partner_endsAt_idx" ON "FacilityPartnerRoleCeilingPeriod"("facilityPartnerOrganizationId", "endsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerRoleCeilingPeriod_createdByUserId_idx" ON "FacilityPartnerRoleCeilingPeriod"("createdByUserId");

-- CreateIndex
CREATE INDEX "FacilityPartnerRoleCeilingPeriod_endedByUserId_idx" ON "FacilityPartnerRoleCeilingPeriod"("endedByUserId");

-- CreateIndex
CREATE INDEX "PartnerUserFacilityAccess_facilityPartnerOrganizationId_idx" ON "PartnerUserFacilityAccess"("facilityPartnerOrganizationId");

-- CreateIndex
CREATE INDEX "PartnerUserFacilityAccess_userId_idx" ON "PartnerUserFacilityAccess"("userId");

-- CreateIndex
CREATE INDEX "PartnerUserFacilityAccess_createdByUserId_idx" ON "PartnerUserFacilityAccess"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerUserFacilityAccess_userId_facilityPartnerOrganizatio_key" ON "PartnerUserFacilityAccess"("userId", "facilityPartnerOrganizationId");

-- CreateIndex
CREATE INDEX "PartnerUserRolePeriod_access_startsAt_idx" ON "PartnerUserRolePeriod"("partnerUserFacilityAccessId", "startsAt");

-- CreateIndex
CREATE INDEX "PartnerUserRolePeriod_access_endsAt_idx" ON "PartnerUserRolePeriod"("partnerUserFacilityAccessId", "endsAt");

-- CreateIndex
CREATE INDEX "PartnerUserRolePeriod_createdByUserId_idx" ON "PartnerUserRolePeriod"("createdByUserId");

-- CreateIndex
CREATE INDEX "PartnerUserRolePeriod_endedByUserId_idx" ON "PartnerUserRolePeriod"("endedByUserId");

-- CreateIndex
CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_partner_startsAt_idx" ON "FacilityPartnerStaffingPolicyPeriod"("facilityPartnerOrganizationId", "startsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_partner_endsAt_idx" ON "FacilityPartnerStaffingPolicyPeriod"("facilityPartnerOrganizationId", "endsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_createdByUserId_idx" ON "FacilityPartnerStaffingPolicyPeriod"("createdByUserId");

-- CreateIndex
CREATE INDEX "FacilityPartnerStaffingPolicyPeriod_endedByUserId_idx" ON "FacilityPartnerStaffingPolicyPeriod"("endedByUserId");

-- CreateIndex
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_partner_user_startsAt_idx" ON "FacilityPartnerUserRestrictionPeriod"("facilityPartnerOrganizationId", "userId", "startsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_partner_user_endsAt_idx" ON "FacilityPartnerUserRestrictionPeriod"("facilityPartnerOrganizationId", "userId", "endsAt");

-- CreateIndex
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_userId_idx" ON "FacilityPartnerUserRestrictionPeriod"("userId");

-- CreateIndex
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_createdByUserId_idx" ON "FacilityPartnerUserRestrictionPeriod"("createdByUserId");

-- CreateIndex
CREATE INDEX "FacilityPartnerUserRestrictionPeriod_endedByUserId_idx" ON "FacilityPartnerUserRestrictionPeriod"("endedByUserId");

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_organizationId_idx" ON "UserOrganizationMembership"("organizationId");

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_userId_idx" ON "UserOrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_createdByUserId_idx" ON "UserOrganizationMembership"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOrganizationMembership_userId_organizationId_key" ON "UserOrganizationMembership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "UserOrgRolePeriod_membership_startsAt_idx" ON "UserOrganizationRolePeriod"("membershipId", "startsAt");

-- CreateIndex
CREATE INDEX "UserOrgRolePeriod_membership_endsAt_idx" ON "UserOrganizationRolePeriod"("membershipId", "endsAt");

-- CreateIndex
CREATE INDEX "UserOrganizationRolePeriod_createdByUserId_idx" ON "UserOrganizationRolePeriod"("createdByUserId");

-- CreateIndex
CREATE INDEX "UserOrganizationRolePeriod_endedByUserId_idx" ON "UserOrganizationRolePeriod"("endedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationClaimInvitation_tokenHash_key" ON "OrganizationClaimInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_organizationId_status_idx" ON "OrganizationClaimInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_targetEmailNormalized_idx" ON "OrganizationClaimInvitation"("targetEmailNormalized");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_requestedFromFacilityId_idx" ON "OrganizationClaimInvitation"("requestedFromFacilityId");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_requestedByUserId_idx" ON "OrganizationClaimInvitation"("requestedByUserId");

-- CreateIndex
CREATE INDEX "OrganizationClaimInvitation_status_expiresAt_idx" ON "OrganizationClaimInvitation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMemberInvitation_tokenHash_key" ON "OrganizationMemberInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationMemberInvitation_organizationId_status_idx" ON "OrganizationMemberInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMemberInvitation_organizationId_targetEmailNorm_idx" ON "OrganizationMemberInvitation"("organizationId", "targetEmailNormalized", "status");

-- CreateIndex
CREATE INDEX "OrganizationMemberInvitation_targetEmailNormalized_idx" ON "OrganizationMemberInvitation"("targetEmailNormalized");

-- CreateIndex
CREATE INDEX "OrganizationMemberInvitation_invitedByUserId_idx" ON "OrganizationMemberInvitation"("invitedByUserId");

-- CreateIndex
CREATE INDEX "OrganizationMemberInvitation_invitedByPlatformStaffId_idx" ON "OrganizationMemberInvitation"("invitedByPlatformStaffId");

-- CreateIndex
CREATE INDEX "OrganizationMemberInvitation_status_expiresAt_idx" ON "OrganizationMemberInvitation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityBilling_facilityId_key" ON "FacilityBilling"("facilityId");

-- CreateIndex
CREATE INDEX "FacilityBilling_status_idx" ON "FacilityBilling"("status");

-- CreateIndex
CREATE INDEX "FacilityDepartmentEntitlement_facilityId_status_idx" ON "FacilityDepartmentEntitlement"("facilityId", "status");

-- CreateIndex
CREATE INDEX "FacilityDepartmentEntitlement_departmentId_idx" ON "FacilityDepartmentEntitlement"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityDepartmentEntitlement_facilityBillingId_departmentK_key" ON "FacilityDepartmentEntitlement"("facilityBillingId", "departmentKey");

-- CreateIndex
CREATE INDEX "JobTitle_facilityId_idx" ON "JobTitle"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "JobTitle_facilityId_name_key" ON "JobTitle"("facilityId", "name");

-- CreateIndex
CREATE INDEX "DepartmentStaffManager_employeeId_idx" ON "DepartmentStaffManager"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentStaffManager_departmentId_employeeId_key" ON "DepartmentStaffManager"("departmentId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDepartment_employeeId_idx" ON "EmployeeDepartment"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDepartment_departmentId_idx" ON "EmployeeDepartment"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDepartment_employeeId_departmentId_key" ON "EmployeeDepartment"("employeeId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingManagerInvite_tokenHash_key" ON "OnboardingManagerInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "OnboardingManagerInvite_facilityId_createdAt_idx" ON "OnboardingManagerInvite"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingManagerInvite_departmentId_idx" ON "OnboardingManagerInvite"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingManagerInvite_facilityId_email_key" ON "OnboardingManagerInvite"("facilityId", "email");

-- CreateIndex
CREATE INDEX "Menu_facilityId_departmentId_status_idx" ON "Menu"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "Menu_departmentId_status_idx" ON "Menu"("departmentId", "status");

-- CreateIndex
CREATE INDEX "Menu_facilityId_status_name_idx" ON "Menu"("facilityId", "status", "name");

-- CreateIndex
CREATE INDEX "Menu_departmentId_operatorPeriodId_idx" ON "Menu"("departmentId", "operatorPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCycleSettings_menuId_key" ON "MenuCycleSettings"("menuId");

-- CreateIndex
CREATE INDEX "MenuCycleSettings_facilityId_idx" ON "MenuCycleSettings"("facilityId");

-- CreateIndex
CREATE INDEX "MenuItem_menuId_weekNumber_dayIndex_mealPeriodKey_idx" ON "MenuItem"("menuId", "weekNumber", "dayIndex", "mealPeriodKey");

-- CreateIndex
CREATE INDEX "MenuItem_menuId_weekNumber_dayIndex_mealPeriodKey_category_idx" ON "MenuItem"("menuId", "weekNumber", "dayIndex", "mealPeriodKey", "category");

-- CreateIndex
CREATE INDEX "MenuItem_facilityId_weekNumber_dayIndex_mealPeriodKey_idx" ON "MenuItem"("facilityId", "weekNumber", "dayIndex", "mealPeriodKey");

-- CreateIndex
CREATE INDEX "MenuItem_facilityId_weekNumber_dayIndex_mealPeriodKey_categ_idx" ON "MenuItem"("facilityId", "weekNumber", "dayIndex", "mealPeriodKey", "category");

-- CreateIndex
CREATE INDEX "MenuLocationApplicability_unitId_idx" ON "MenuLocationApplicability"("unitId");

-- CreateIndex
CREATE INDEX "MenuLocationApplicability_spaceId_idx" ON "MenuLocationApplicability"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuLocationApplicability_menuId_unitId_key" ON "MenuLocationApplicability"("menuId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuLocationApplicability_menuId_spaceId_key" ON "MenuLocationApplicability"("menuId", "spaceId");

-- CreateIndex
CREATE INDEX "MenuOperationalCycleApplicability_cycleStableKey_idx" ON "MenuOperationalCycleApplicability"("cycleStableKey");

-- CreateIndex
CREATE UNIQUE INDEX "MenuOperationalCycleApplicability_menuId_cycleStableKey_key" ON "MenuOperationalCycleApplicability"("menuId", "cycleStableKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "User_facilityId_idx" ON "User"("facilityId");

-- CreateIndex
CREATE INDEX "User_primaryDepartmentId_idx" ON "User"("primaryDepartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_usedAt_expiresAt_idx" ON "PasswordResetToken"("userId", "usedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_usedAt_expiresAt_idx" ON "EmailVerificationToken"("userId", "usedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountInviteToken_tokenHash_key" ON "AccountInviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountInviteToken_userId_usedAt_expiresAt_idx" ON "AccountInviteToken"("userId", "usedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "WorkspacePreference_userId_idx" ON "WorkspacePreference"("userId");

-- CreateIndex
CREATE INDEX "WorkspacePreference_facilityId_idx" ON "WorkspacePreference"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspacePreference_userId_facilityId_key" ON "WorkspacePreference"("userId", "facilityId");

-- CreateIndex
CREATE INDEX "NotificationPreference_facilityId_idx" ON "NotificationPreference"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_facilityId_key" ON "NotificationPreference"("userId", "facilityId");

-- CreateIndex
CREATE INDEX "RevokedUserSession_userId_idx" ON "RevokedUserSession"("userId");

-- CreateIndex
CREATE INDEX "RevokedUserSession_expiresAt_idx" ON "RevokedUserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_revokedAt_idx" ON "PushSubscription"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "PushSubscription_endpoint_idx" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushDispatch_status_expiresAt_idx" ON "PushDispatch"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PushDispatch_notificationRecipientId_idx" ON "PushDispatch"("notificationRecipientId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDispatch_pushSubscriptionId_triggerKey_key" ON "PushDispatch"("pushSubscriptionId", "triggerKey");

-- CreateIndex
CREATE INDEX "DashboardLayout_facilityId_idx" ON "DashboardLayout"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_facilityId_userId_scopeKind_key" ON "DashboardLayout"("facilityId", "userId", "scopeKind");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_facilityId_employeeId_scopeKind_key" ON "DashboardLayout"("facilityId", "employeeId", "scopeKind");

-- CreateIndex
CREATE INDEX "DashboardFacilityDefault_facilityId_idx" ON "DashboardFacilityDefault"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardFacilityDefault_facilityId_authority_scopeKind_key" ON "DashboardFacilityDefault"("facilityId", "authority", "scopeKind");

-- CreateIndex
CREATE INDEX "UserFacilityAccess_userId_isActive_idx" ON "UserFacilityAccess"("userId", "isActive");

-- CreateIndex
CREATE INDEX "UserFacilityAccess_facilityId_isActive_idx" ON "UserFacilityAccess"("facilityId", "isActive");

-- CreateIndex
CREATE INDEX "UserFacilityAccess_grantedByUserId_idx" ON "UserFacilityAccess"("grantedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFacilityAccess_userId_facilityId_key" ON "UserFacilityAccess"("userId", "facilityId");

-- CreateIndex
CREATE INDEX "UserFacilityRolePeriod_access_startsAt_idx" ON "UserFacilityRolePeriod"("userFacilityAccessId", "startsAt");

-- CreateIndex
CREATE INDEX "UserFacilityRolePeriod_access_endsAt_idx" ON "UserFacilityRolePeriod"("userFacilityAccessId", "endsAt");

-- CreateIndex
CREATE INDEX "UserFacilityRolePeriod_createdByUserId_idx" ON "UserFacilityRolePeriod"("createdByUserId");

-- CreateIndex
CREATE INDEX "UserFacilityRolePeriod_endedByUserId_idx" ON "UserFacilityRolePeriod"("endedByUserId");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_facilityId_status_idx" ON "FacilityAdministratorInvitation"("facilityId", "status");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_invitedUserId_status_idx" ON "FacilityAdministratorInvitation"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_invitedByUserId_idx" ON "FacilityAdministratorInvitation"("invitedByUserId");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_outgoingUserId_idx" ON "FacilityAdministratorInvitation"("outgoingUserId");

-- CreateIndex
CREATE INDEX "FacilityAdministratorInvitation_closedByUserId_idx" ON "FacilityAdministratorInvitation"("closedByUserId");

-- CreateIndex
CREATE INDEX "Unit_parentUnitId_idx" ON "Unit"("parentUnitId");

-- CreateIndex
CREATE INDEX "Unit_isActive_displayOrder_idx" ON "Unit"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "Unit_facilityId_idx" ON "Unit"("facilityId");

-- CreateIndex
CREATE INDEX "Unit_hierarchyRole_idx" ON "Unit"("hierarchyRole");

-- CreateIndex
CREATE INDEX "UnitDepartmentResponsibility_unitId_idx" ON "UnitDepartmentResponsibility"("unitId");

-- CreateIndex
CREATE INDEX "UnitDepartmentResponsibility_departmentId_idx" ON "UnitDepartmentResponsibility"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitDepartmentResponsibility_unitId_departmentId_key" ON "UnitDepartmentResponsibility"("unitId", "departmentId");

-- CreateIndex
CREATE INDEX "FacilityRoomType_facilityId_isActive_displayOrder_idx" ON "FacilityRoomType"("facilityId", "isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "FacilityRoomType_facilityId_baseTypeKey_idx" ON "FacilityRoomType"("facilityId", "baseTypeKey");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityRoomType_facilityId_displayName_key" ON "FacilityRoomType"("facilityId", "displayName");

-- CreateIndex
CREATE INDEX "UnitSpace_facilityId_idx" ON "UnitSpace"("facilityId");

-- CreateIndex
CREATE INDEX "UnitSpace_unitId_isActive_sortOrder_idx" ON "UnitSpace"("unitId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "UnitSpace_facilityRoomTypeId_idx" ON "UnitSpace"("facilityRoomTypeId");

-- CreateIndex
CREATE INDEX "UnitSpace_parentSpaceId_idx" ON "UnitSpace"("parentSpaceId");

-- CreateIndex
CREATE INDEX "DepartmentTeam_facilityId_departmentId_status_displayOrder_idx" ON "DepartmentTeam"("facilityId", "departmentId", "status", "displayOrder");

-- CreateIndex
CREATE INDEX "DepartmentTeam_departmentId_status_idx" ON "DepartmentTeam"("departmentId", "status");

-- CreateIndex
CREATE INDEX "DepartmentTeam_managerEmployeeId_idx" ON "DepartmentTeam"("managerEmployeeId");

-- CreateIndex
CREATE INDEX "DepartmentTeamRoomMembership_spaceId_idx" ON "DepartmentTeamRoomMembership"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentTeamRoomMembership_teamId_spaceId_key" ON "DepartmentTeamRoomMembership"("teamId", "spaceId");

-- CreateIndex
CREATE INDEX "EmployeeTeamMembership_employeeId_idx" ON "EmployeeTeamMembership"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeTeamMembership_teamId_idx" ON "EmployeeTeamMembership"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTeamMembership_employeeId_teamId_key" ON "EmployeeTeamMembership"("employeeId", "teamId");

-- CreateIndex
CREATE INDEX "UnitSpaceResponsibility_spaceId_idx" ON "UnitSpaceResponsibility"("spaceId");

-- CreateIndex
CREATE INDEX "UnitSpaceResponsibility_departmentId_idx" ON "UnitSpaceResponsibility"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitSpaceResponsibility_spaceId_departmentId_key" ON "UnitSpaceResponsibility"("spaceId", "departmentId");

-- CreateIndex
CREATE INDEX "Employee_status_roleType_idx" ON "Employee"("status", "roleType");

-- CreateIndex
CREATE INDEX "Employee_facilityId_idx" ON "Employee"("facilityId");

-- CreateIndex
CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_primaryUnitId_idx" ON "Employee"("primaryUnitId");

-- CreateIndex
CREATE INDEX "Employee_primaryDepartmentId_idx" ON "Employee"("primaryDepartmentId");

-- CreateIndex
CREATE INDEX "Employee_operatorPeriodId_idx" ON "Employee"("operatorPeriodId");

-- CreateIndex
CREATE INDEX "Employee_jobTitleId_idx" ON "Employee"("jobTitleId");

-- CreateIndex
CREATE INDEX "Employee_facilityId_unionMember_idx" ON "Employee"("facilityId", "unionMember");

-- CreateIndex
CREATE INDEX "Employee_birthMonth_birthDay_idx" ON "Employee"("birthMonth", "birthDay");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_facilityId_pinDigest_key" ON "Employee"("facilityId", "pinDigest");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_facilityId_userId_key" ON "Employee"("facilityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeUserLinkInvitation_tokenHash_key" ON "EmployeeUserLinkInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "EmployeeUserLinkInvitation_employeeId_status_idx" ON "EmployeeUserLinkInvitation"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeUserLinkInvitation_facilityId_status_idx" ON "EmployeeUserLinkInvitation"("facilityId", "status");

-- CreateIndex
CREATE INDEX "EmployeeUserLinkInvitation_targetEmailNormalized_status_idx" ON "EmployeeUserLinkInvitation"("targetEmailNormalized", "status");

-- CreateIndex
CREATE INDEX "EmployeeUserLinkInvitation_status_expiresAt_idx" ON "EmployeeUserLinkInvitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "EmployeeWorkStation_employeeId_idx" ON "EmployeeWorkStation"("employeeId");

-- CreateIndex
CREATE INDEX "DisciplinePointEntry_employeeId_occurredAt_idx" ON "DisciplinePointEntry"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "DisciplinePointEntry_employeeId_category_idx" ON "DisciplinePointEntry"("employeeId", "category");

-- CreateIndex
CREATE INDEX "EmployeeHrAuditLog_facilityId_createdAt_idx" ON "EmployeeHrAuditLog"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeHrAuditLog_employeeId_createdAt_idx" ON "EmployeeHrAuditLog"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeTerminationRecord_facilityId_terminatedAt_idx" ON "EmployeeTerminationRecord"("facilityId", "terminatedAt");

-- CreateIndex
CREATE INDEX "EmployeeTerminationRecord_employeeId_idx" ON "EmployeeTerminationRecord"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeUnitAccess_employeeId_idx" ON "EmployeeUnitAccess"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeUnitAccess_unitId_idx" ON "EmployeeUnitAccess"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeUnitAccess_employeeId_unitId_key" ON "EmployeeUnitAccess"("employeeId", "unitId");

-- CreateIndex
CREATE INDEX "KioskUnitPinLoginEvent_facilityId_createdAt_idx" ON "KioskUnitPinLoginEvent"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "KioskUnitPinLoginEvent_employeeId_createdAt_idx" ON "KioskUnitPinLoginEvent"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "KioskUnitPinLoginEvent_unitId_createdAt_idx" ON "KioskUnitPinLoginEvent"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "DefaultAssignment_unitId_isActive_idx" ON "DefaultAssignment"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "DefaultAssignment_employeeId_isActive_idx" ON "DefaultAssignment"("employeeId", "isActive");

-- CreateIndex
CREATE INDEX "ScheduleEntry_date_unitId_idx" ON "ScheduleEntry"("date", "unitId");

-- CreateIndex
CREATE INDEX "ScheduleEntry_employeeId_date_idx" ON "ScheduleEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ScheduleEntry_workShiftId_idx" ON "ScheduleEntry"("workShiftId");

-- CreateIndex
CREATE INDEX "ScheduleEntry_departmentId_date_idx" ON "ScheduleEntry"("departmentId", "date");

-- CreateIndex
CREATE INDEX "ScheduleEntry_departmentId_operatorPeriodId_idx" ON "ScheduleEntry"("departmentId", "operatorPeriodId");

-- CreateIndex
CREATE INDEX "Vendor_facilityId_idx" ON "Vendor"("facilityId");

-- CreateIndex
CREATE INDEX "Vendor_ownerOrganizationId_idx" ON "Vendor"("ownerOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_facilityId_name_key" ON "Vendor"("facilityId", "name");

-- CreateIndex
CREATE INDEX "FacilityOrganization_facilityId_isActive_idx" ON "FacilityOrganization"("facilityId", "isActive");

-- CreateIndex
CREATE INDEX "FacilityOrganization_organizationId_idx" ON "FacilityOrganization"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityOrganization_facilityId_name_key" ON "FacilityOrganization"("facilityId", "name");

-- CreateIndex
CREATE INDEX "AssetMaintainerProposal_assetId_status_idx" ON "AssetMaintainerProposal"("assetId", "status");

-- CreateIndex
CREATE INDEX "AssetMaintainerProposal_facilityOrganizationId_idx" ON "AssetMaintainerProposal"("facilityOrganizationId");

-- CreateIndex
CREATE INDEX "AssetMaintainerProposal_proposedByUserId_idx" ON "AssetMaintainerProposal"("proposedByUserId");

-- CreateIndex
CREATE INDEX "AssetMaintainerProposal_acceptedByUserId_idx" ON "AssetMaintainerProposal"("acceptedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetCode_key" ON "Asset"("assetCode");

-- CreateIndex
CREATE INDEX "Asset_unitId_status_idx" ON "Asset"("unitId", "status");

-- CreateIndex
CREATE INDEX "Asset_unitId_criticality_idx" ON "Asset"("unitId", "criticality");

-- CreateIndex
CREATE INDEX "Asset_vendorId_idx" ON "Asset"("vendorId");

-- CreateIndex
CREATE INDEX "Asset_departmentId_idx" ON "Asset"("departmentId");

-- CreateIndex
CREATE INDEX "Asset_responsibleOrganizationId_idx" ON "Asset"("responsibleOrganizationId");

-- CreateIndex
CREATE INDEX "Asset_spaceId_idx" ON "Asset"("spaceId");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_titleOrganizationId_idx" ON "Asset"("titleOrganizationId");

-- CreateIndex
CREATE INDEX "AssetPresenceNote_facilityId_departmentId_idx" ON "AssetPresenceNote"("facilityId", "departmentId");

-- CreateIndex
CREATE INDEX "AssetPresenceNote_titleOrganizationId_idx" ON "AssetPresenceNote"("titleOrganizationId");

-- CreateIndex
CREATE INDEX "AssetStatusHistory_assetId_changedAt_idx" ON "AssetStatusHistory"("assetId", "changedAt");

-- CreateIndex
CREATE INDEX "AssetStatusHistory_sourceIssueId_idx" ON "AssetStatusHistory"("sourceIssueId");

-- CreateIndex
CREATE INDEX "AssetStatusHistory_sourceRepairId_idx" ON "AssetStatusHistory"("sourceRepairId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetIssue_issueCode_key" ON "AssetIssue"("issueCode");

-- CreateIndex
CREATE INDEX "AssetIssue_facilityId_departmentId_status_idx" ON "AssetIssue"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "AssetIssue_facilityId_assetId_status_idx" ON "AssetIssue"("facilityId", "assetId", "status");

-- CreateIndex
CREATE INDEX "AssetIssue_facilityId_unitId_status_idx" ON "AssetIssue"("facilityId", "unitId", "status");

-- CreateIndex
CREATE INDEX "AssetIssue_priority_status_idx" ON "AssetIssue"("priority", "status");

-- CreateIndex
CREATE INDEX "AssetIssue_observedAt_idx" ON "AssetIssue"("observedAt");

-- CreateIndex
CREATE INDEX "AssetIssue_originEvidenceRecordId_idx" ON "AssetIssue"("originEvidenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetIssue_facilityId_departmentId_clientCommandId_key" ON "AssetIssue"("facilityId", "departmentId", "clientCommandId");

-- CreateIndex
CREATE INDEX "AssetIssueUpdate_issueId_updatedAt_idx" ON "AssetIssueUpdate"("issueId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssetIssueEvidenceLink_evidenceRecordId_idx" ON "AssetIssueEvidenceLink"("evidenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetIssueEvidenceLink_issueId_evidenceRecordId_key" ON "AssetIssueEvidenceLink"("issueId", "evidenceRecordId");

-- CreateIndex
CREATE INDEX "DepartmentRequestRoute_facilityId_requestingDepartmentId_idx" ON "DepartmentRequestRoute"("facilityId", "requestingDepartmentId");

-- CreateIndex
CREATE INDEX "DepartmentRequestRoute_facilityId_requestingDepartmentId_is_idx" ON "DepartmentRequestRoute"("facilityId", "requestingDepartmentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentRequestRoute_facilityId_requestingDepartmentId_re_key" ON "DepartmentRequestRoute"("facilityId", "requestingDepartmentId", "responsibleDepartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRequest_requestCode_key" ON "OperationalRequest"("requestCode");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRequest_workOrderId_key" ON "OperationalRequest"("workOrderId");

-- CreateIndex
CREATE INDEX "OperationalRequest_facilityId_responsibleDepartmentId_statu_idx" ON "OperationalRequest"("facilityId", "responsibleDepartmentId", "status");

-- CreateIndex
CREATE INDEX "OperationalRequest_facilityId_requestingDepartmentId_status_idx" ON "OperationalRequest"("facilityId", "requestingDepartmentId", "status");

-- CreateIndex
CREATE INDEX "OperationalRequest_facilityId_unitId_status_idx" ON "OperationalRequest"("facilityId", "unitId", "status");

-- CreateIndex
CREATE INDEX "OperationalRequest_priority_status_idx" ON "OperationalRequest"("priority", "status");

-- CreateIndex
CREATE INDEX "OperationalRequest_assetId_idx" ON "OperationalRequest"("assetId");

-- CreateIndex
CREATE INDEX "OperationalRequest_workOrderId_idx" ON "OperationalRequest"("workOrderId");

-- CreateIndex
CREATE INDEX "OperationalRequest_relatedAssetIssueId_idx" ON "OperationalRequest"("relatedAssetIssueId");

-- CreateIndex
CREATE INDEX "OperationalRequest_observedAt_idx" ON "OperationalRequest"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRequest_facilityId_requestingDepartmentId_client_key" ON "OperationalRequest"("facilityId", "requestingDepartmentId", "clientCommandId");

-- CreateIndex
CREATE INDEX "OperationalRequestUpdate_requestId_updatedAt_idx" ON "OperationalRequestUpdate"("requestId", "updatedAt");

-- CreateIndex
CREATE INDEX "OperationalRequestEvidenceLink_evidenceRecordId_idx" ON "OperationalRequestEvidenceLink"("evidenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRequestEvidenceLink_requestId_evidenceRecordId_key" ON "OperationalRequestEvidenceLink"("requestId", "evidenceRecordId");

-- CreateIndex
CREATE INDEX "MaintenanceCategory_facilityId_archivedAt_idx" ON "MaintenanceCategory"("facilityId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceCategory_facilityId_key_key" ON "MaintenanceCategory"("facilityId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Repair_repairCode_key" ON "Repair"("repairCode");

-- CreateIndex
CREATE INDEX "Repair_unitId_status_idx" ON "Repair"("unitId", "status");

-- CreateIndex
CREATE INDEX "Repair_priority_status_idx" ON "Repair"("priority", "status");

-- CreateIndex
CREATE INDEX "Repair_requestingDepartmentId_idx" ON "Repair"("requestingDepartmentId");

-- CreateIndex
CREATE INDEX "Repair_responsibleDepartmentId_idx" ON "Repair"("responsibleDepartmentId");

-- CreateIndex
CREATE INDEX "Repair_payerOrganizationId_idx" ON "Repair"("payerOrganizationId");

-- CreateIndex
CREATE INDEX "Repair_assignedEmployeeId_idx" ON "Repair"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "Repair_pmOccurrenceId_idx" ON "Repair"("pmOccurrenceId");

-- CreateIndex
CREATE INDEX "Repair_dueAt_idx" ON "Repair"("dueAt");

-- CreateIndex
CREATE INDEX "Repair_targetDate_idx" ON "Repair"("targetDate");

-- CreateIndex
CREATE INDEX "Repair_issueId_idx" ON "Repair"("issueId");

-- CreateIndex
CREATE INDEX "Repair_spaceId_idx" ON "Repair"("spaceId");

-- CreateIndex
CREATE INDEX "Repair_procedureVersionId_idx" ON "Repair"("procedureVersionId");

-- CreateIndex
CREATE INDEX "Repair_maintenanceCategoryId_idx" ON "Repair"("maintenanceCategoryId");

-- CreateIndex
CREATE INDEX "Repair_assetConditionReviewedByUserId_idx" ON "Repair"("assetConditionReviewedByUserId");

-- CreateIndex
CREATE INDEX "RepairEvidenceLink_evidenceRecordId_idx" ON "RepairEvidenceLink"("evidenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairEvidenceLink_repairId_evidenceRecordId_key" ON "RepairEvidenceLink"("repairId", "evidenceRecordId");

-- CreateIndex
CREATE INDEX "RepairLaborEntry_repairId_idx" ON "RepairLaborEntry"("repairId");

-- CreateIndex
CREATE INDEX "RepairLaborEntry_employeeId_idx" ON "RepairLaborEntry"("employeeId");

-- CreateIndex
CREATE INDEX "RepairLaborEntry_recordedByUserId_idx" ON "RepairLaborEntry"("recordedByUserId");

-- CreateIndex
CREATE INDEX "RepairPartUsed_repairId_idx" ON "RepairPartUsed"("repairId");

-- CreateIndex
CREATE INDEX "RepairPartUsed_createdByUserId_idx" ON "RepairPartUsed"("createdByUserId");

-- CreateIndex
CREATE INDEX "RepairRecordRequirement_repairId_status_idx" ON "RepairRecordRequirement"("repairId", "status");

-- CreateIndex
CREATE INDEX "RepairRecordRequirement_catalogDefinitionId_idx" ON "RepairRecordRequirement"("catalogDefinitionId");

-- CreateIndex
CREATE INDEX "RepairRecordRequirement_satisfiedByRecordId_idx" ON "RepairRecordRequirement"("satisfiedByRecordId");

-- CreateIndex
CREATE INDEX "RepairRecordRequirement_waivedByUserId_idx" ON "RepairRecordRequirement"("waivedByUserId");

-- CreateIndex
CREATE INDEX "RepairRecordRequirement_createdByUserId_idx" ON "RepairRecordRequirement"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRecordRequirement_repairId_catalogDefinitionId_key" ON "RepairRecordRequirement"("repairId", "catalogDefinitionId");

-- CreateIndex
CREATE INDEX "RepairUpdate_repairId_updatedAt_idx" ON "RepairUpdate"("repairId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkOrderResponseHistory_repairId_changedAt_idx" ON "WorkOrderResponseHistory"("repairId", "changedAt");

-- CreateIndex
CREATE INDEX "WorkOrderResponseHistory_changedByUserId_idx" ON "WorkOrderResponseHistory"("changedByUserId");

-- CreateIndex
CREATE INDEX "WorkShift_facilityId_idx" ON "WorkShift"("facilityId");

-- CreateIndex
CREATE INDEX "WorkShift_departmentId_idx" ON "WorkShift"("departmentId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlan_facilityId_status_idx" ON "PreventiveMaintenancePlan"("facilityId", "status");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlan_departmentId_status_idx" ON "PreventiveMaintenancePlan"("departmentId", "status");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlan_assetId_status_idx" ON "PreventiveMaintenancePlan"("assetId", "status");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlan_retiredByUserId_idx" ON "PreventiveMaintenancePlan"("retiredByUserId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlan_createdByUserId_idx" ON "PreventiveMaintenancePlan"("createdByUserId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlanVersion_planId_status_idx" ON "PreventiveMaintenancePlanVersion"("planId", "status");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlanVersion_maintenanceCategoryId_idx" ON "PreventiveMaintenancePlanVersion"("maintenanceCategoryId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlanVersion_procedureVersionId_idx" ON "PreventiveMaintenancePlanVersion"("procedureVersionId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlanVersion_defaultAssignedEmployeeId_idx" ON "PreventiveMaintenancePlanVersion"("defaultAssignedEmployeeId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlanVersion_publishedByUserId_idx" ON "PreventiveMaintenancePlanVersion"("publishedByUserId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlanVersion_createdFromVersionId_idx" ON "PreventiveMaintenancePlanVersion"("createdFromVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventiveMaintenancePlanVersion_planId_version_key" ON "PreventiveMaintenancePlanVersion"("planId", "version");

-- CreateIndex
CREATE INDEX "PreventiveMaintenancePlanRecordRequirement_catalogDefinitio_idx" ON "PreventiveMaintenancePlanRecordRequirement"("catalogDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventiveMaintenancePlanRecordRequirement_planVersionId_ca_key" ON "PreventiveMaintenancePlanRecordRequirement"("planVersionId", "catalogDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventiveMaintenanceOccurrence_completedWorkOrderId_key" ON "PreventiveMaintenanceOccurrence"("completedWorkOrderId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceOccurrence_planVersionId_idx" ON "PreventiveMaintenanceOccurrence"("planVersionId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceOccurrence_status_scheduledDate_idx" ON "PreventiveMaintenanceOccurrence"("status", "scheduledDate");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceOccurrence_skippedByUserId_idx" ON "PreventiveMaintenanceOccurrence"("skippedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventiveMaintenanceOccurrence_planId_scheduledDate_key" ON "PreventiveMaintenanceOccurrence"("planId", "scheduledDate");

-- CreateIndex
CREATE INDEX "RoomAreaStatus_facilityId_idx" ON "RoomAreaStatus"("facilityId");

-- CreateIndex
CREATE INDEX "RoomAreaStatus_unitId_statusDate_idx" ON "RoomAreaStatus"("unitId", "statusDate");

-- CreateIndex
CREATE INDEX "RoomAreaStatus_updatedByEmployeeId_idx" ON "RoomAreaStatus"("updatedByEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomAreaStatus_unitId_statusDate_key" ON "RoomAreaStatus"("unitId", "statusDate");

-- CreateIndex
CREATE INDEX "Attachment_facilityId_idx" ON "Attachment"("facilityId");

-- CreateIndex
CREATE INDEX "Attachment_repairId_idx" ON "Attachment"("repairId");

-- CreateIndex
CREATE INDEX "Attachment_assetId_idx" ON "Attachment"("assetId");

-- CreateIndex
CREATE INDEX "Attachment_createdByUserId_idx" ON "Attachment"("createdByUserId");

-- CreateIndex
CREATE INDEX "Attachment_createdByEmployeeId_idx" ON "Attachment"("createdByEmployeeId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_status_idx" ON "KnowledgeArticle"("facilityId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_category_idx" ON "KnowledgeArticle"("facilityId", "category");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_departmentId_idx" ON "KnowledgeArticle"("facilityId", "departmentId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_facilityId_status_category_idx" ON "KnowledgeArticle"("facilityId", "status", "category");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_articleId_status_idx" ON "KnowledgeArticleVersion"("articleId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_createdFromVersionId_idx" ON "KnowledgeArticleVersion"("createdFromVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleVersion_articleId_version_key" ON "KnowledgeArticleVersion"("articleId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeArticleUnit_unitId_idx" ON "KnowledgeArticleUnit"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleUnit_articleId_unitId_key" ON "KnowledgeArticleUnit"("articleId", "unitId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleAsset_assetId_idx" ON "KnowledgeArticleAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleAsset_articleId_assetId_key" ON "KnowledgeArticleAsset"("articleId", "assetId");

-- CreateIndex
CREATE INDEX "KnowledgeArticleCatalogDefinition_catalogDefinitionId_idx" ON "KnowledgeArticleCatalogDefinition"("catalogDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleCatalogDefinition_articleId_catalogDefiniti_key" ON "KnowledgeArticleCatalogDefinition"("articleId", "catalogDefinitionId");

-- CreateIndex
CREATE INDEX "AiBrief_fac_dept_svc_type_idx" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate", "briefType");

-- CreateIndex
CREATE INDEX "AiBrief_fac_type_generated_idx" ON "AiOperationalBrief"("facilityId", "briefType", "generatedAt");

-- CreateIndex
CREATE INDEX "AiOperationalBrief_expiresAt_idx" ON "AiOperationalBrief"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiBrief_fac_dept_svc_type_hash_key" ON "AiOperationalBrief"("facilityId", "departmentKey", "serviceDate", "briefType", "snapshotHash");

-- CreateIndex
CREATE INDEX "OperationalAssignmentPlan_facilityId_serviceDate_idx" ON "OperationalAssignmentPlan"("facilityId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignmentPlan_departmentId_serviceDate_idx" ON "OperationalAssignmentPlan"("departmentId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAssignmentPlan_facilityId_departmentId_serviceDa_key" ON "OperationalAssignmentPlan"("facilityId", "departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "DepartmentOperationalZone_facilityId_departmentId_status_idx" ON "DepartmentOperationalZone"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "DepartmentOperationalZone_departmentId_status_idx" ON "DepartmentOperationalZone"("departmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalZone_facilityId_departmentId_name_key" ON "DepartmentOperationalZone"("facilityId", "departmentId", "name");

-- CreateIndex
CREATE INDEX "DepartmentOperationalZoneLocation_unitSpaceId_idx" ON "DepartmentOperationalZoneLocation"("unitSpaceId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalZoneLocation_unitId_idx" ON "DepartmentOperationalZoneLocation"("unitId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalZoneLocation_zoneId_sortOrder_idx" ON "DepartmentOperationalZoneLocation"("zoneId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalZoneLocation_zoneId_unitSpaceId_key" ON "DepartmentOperationalZoneLocation"("zoneId", "unitSpaceId");

-- CreateIndex
CREATE INDEX "OperationalAssignmentLocation_unitSpaceId_idx" ON "OperationalAssignmentLocation"("unitSpaceId");

-- CreateIndex
CREATE INDEX "OperationalAssignmentLocation_unitId_idx" ON "OperationalAssignmentLocation"("unitId");

-- CreateIndex
CREATE INDEX "OperationalAssignmentLocation_assignmentId_sortOrder_idx" ON "OperationalAssignmentLocation"("assignmentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAssignmentLocation_assignmentId_unitSpaceId_key" ON "OperationalAssignmentLocation"("assignmentId", "unitSpaceId");

-- CreateIndex
CREATE INDEX "OperationalAssignment_facilityId_serviceDate_idx" ON "OperationalAssignment"("facilityId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_departmentId_serviceDate_idx" ON "OperationalAssignment"("departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_employeeId_serviceDate_idx" ON "OperationalAssignment"("employeeId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_unitId_serviceDate_idx" ON "OperationalAssignment"("unitId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalAssignment_sourceZoneId_idx" ON "OperationalAssignment"("sourceZoneId");

-- CreateIndex
CREATE INDEX "OperationalAssignment_templateItemId_idx" ON "OperationalAssignment"("templateItemId");

-- CreateIndex
CREATE INDEX "OperationalAssignment_planId_idx" ON "OperationalAssignment"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAssignment_facilityId_clientCommandId_key" ON "OperationalAssignment"("facilityId", "clientCommandId");

-- CreateIndex
CREATE INDEX "EmployeeOperationalRoleQualification_facilityId_departmentI_idx" ON "EmployeeOperationalRoleQualification"("facilityId", "departmentId");

-- CreateIndex
CREATE INDEX "EmployeeOperationalRoleQualification_employeeId_idx" ON "EmployeeOperationalRoleQualification"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeOperationalRoleQualification_employeeId_departmentI_key" ON "EmployeeOperationalRoleQualification"("employeeId", "departmentId", "roleKey");

-- CreateIndex
CREATE INDEX "OperationalAssignmentEvent_assignmentId_createdAt_idx" ON "OperationalAssignmentEvent"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalAssignmentEvent_planId_createdAt_idx" ON "OperationalAssignmentEvent"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalAssignmentEvent_facilityId_createdAt_idx" ON "OperationalAssignmentEvent"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalAssignmentEvent_departmentId_createdAt_idx" ON "OperationalAssignmentEvent"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "CoverageEpisode_date_idx" ON "CoverageEpisode"("facilityId", "serviceDate", "departmentId");

-- CreateIndex
CREATE INDEX "CoverageEpisode_grain_idx" ON "CoverageEpisode"("facilityId", "departmentId", "spaceId", "responsibility", "cycleStableKey");

-- CreateIndex
CREATE INDEX "CoverageEpisodeTransition_episodeId_occurredAt_idx" ON "CoverageEpisodeTransition"("episodeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageEpisodeTransition_facilityId_dedupeKey_key" ON "CoverageEpisodeTransition"("facilityId", "dedupeKey");

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplate_facilityId_departmentId_idx" ON "OperationalAssignmentTemplate"("facilityId", "departmentId");

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplate_facilityId_isActive_idx" ON "OperationalAssignmentTemplate"("facilityId", "isActive");

-- CreateIndex
CREATE INDEX "OATemplate_stable_status_idx" ON "OperationalAssignmentTemplate"("facilityId", "departmentId", "stableKey", "status");

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplate_facilityId_departmentId_effec_idx" ON "OperationalAssignmentTemplate"("facilityId", "departmentId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "OATemplate_stable_version_key" ON "OperationalAssignmentTemplate"("facilityId", "departmentId", "stableKey", "version");

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplateItem_templateId_sortOrder_idx" ON "OperationalAssignmentTemplateItem"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "OperationalAssignmentTemplateItem_spaceId_idx" ON "OperationalAssignmentTemplateItem"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthRateLimitBucket_bucketKey_key" ON "AuthRateLimitBucket"("bucketKey");

-- CreateIndex
CREATE INDEX "AuthRateLimitBucket_bucketType_lockedUntil_idx" ON "AuthRateLimitBucket"("bucketType", "lockedUntil");

-- CreateIndex
CREATE INDEX "AuthRateLimitBucket_lastAttemptAt_idx" ON "AuthRateLimitBucket"("lastAttemptAt");

-- CreateIndex
CREATE INDEX "OfflineBundleIssuance_facilityId_unitId_issuedAt_idx" ON "OfflineBundleIssuance"("facilityId", "unitId", "issuedAt");

-- CreateIndex
CREATE INDEX "OfflineSyncReceipt_facilityId_unitId_createdAt_idx" ON "OfflineSyncReceipt"("facilityId", "unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSyncReceipt_facilityId_unitId_clientCommandId_key" ON "OfflineSyncReceipt"("facilityId", "unitId", "clientCommandId");

-- CreateIndex
CREATE INDEX "OfflineConflict_facilityId_unitId_resolution_idx" ON "OfflineConflict"("facilityId", "unitId", "resolution");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineConflict_facilityId_unitId_clientCommandId_key" ON "OfflineConflict"("facilityId", "unitId", "clientCommandId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_facilityId_departmentId_status_idx" ON "DepartmentOperationalCycle"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_facilityId_departmentId_effectiv_idx" ON "DepartmentOperationalCycle"("facilityId", "departmentId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_departmentId_displaySequence_idx" ON "DepartmentOperationalCycle"("departmentId", "displaySequence");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_departmentId_status_displaySeque_idx" ON "DepartmentOperationalCycle"("departmentId", "status", "displaySequence");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_departmentId_parentStableKey_idx" ON "DepartmentOperationalCycle"("departmentId", "parentStableKey");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_departmentId_nodeKind_idx" ON "DepartmentOperationalCycle"("departmentId", "nodeKind");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycle_departmentId_operatorPeriodId_idx" ON "DepartmentOperationalCycle"("departmentId", "operatorPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalCycle_departmentId_stableKey_version_key" ON "DepartmentOperationalCycle"("departmentId", "stableKey", "version");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleLocation_unitId_idx" ON "DepartmentOperationalCycleLocation"("unitId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleLocation_spaceId_idx" ON "DepartmentOperationalCycleLocation"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalCycleLocation_cycleId_unitId_key" ON "DepartmentOperationalCycleLocation"("cycleId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalCycleLocation_cycleId_spaceId_key" ON "DepartmentOperationalCycleLocation"("cycleId", "spaceId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleKeyTimeGroup_cycleId_displaySeque_idx" ON "DepartmentOperationalCycleKeyTimeGroup"("cycleId", "displaySequence");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalCycleKeyTimeGroup_cycleId_dueLocal_key" ON "DepartmentOperationalCycleKeyTimeGroup"("cycleId", "dueLocal");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_spaceId_idx" ON "DepartmentOperationalCycleKeyTimeGroupRoom"("spaceId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_cycleId_idx" ON "DepartmentOperationalCycleKeyTimeGroupRoom"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_keyTimeGroupId_s_key" ON "DepartmentOperationalCycleKeyTimeGroupRoom"("keyTimeGroupId", "spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalCycleKeyTimeGroupRoom_cycleId_spaceId_key" ON "DepartmentOperationalCycleKeyTimeGroupRoom"("cycleId", "spaceId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleMilestoneTime_unitId_idx" ON "DepartmentOperationalCycleMilestoneTime"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentOperationalCycleMilestoneTime_cycleId_unitId_mile_key" ON "DepartmentOperationalCycleMilestoneTime"("cycleId", "unitId", "milestone");

-- CreateIndex
CREATE INDEX "OperationalCycleDayExpectation_facilityId_departmentId_serv_idx" ON "OperationalCycleDayExpectation"("facilityId", "departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalCycleDayExpectation_unitId_serviceDate_idx" ON "OperationalCycleDayExpectation"("unitId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalCycleDayExpectation_cycleId_idx" ON "OperationalCycleDayExpectation"("cycleId");

-- CreateIndex
CREATE INDEX "OperationalCycleDayExpectation_adjustedByUserId_idx" ON "OperationalCycleDayExpectation"("adjustedByUserId");

-- CreateIndex
CREATE INDEX "OperationalCycleDayExpectation_adjustedByEmployeeId_idx" ON "OperationalCycleDayExpectation"("adjustedByEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalCycleDayExpectation_serviceDate_cycleId_unitId_m_key" ON "OperationalCycleDayExpectation"("serviceDate", "cycleId", "unitId", "milestone");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_facilityId_department_idx" ON "OperationalCycleKeyTimeDayExpectation"("facilityId", "departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_spaceId_serviceDate_idx" ON "OperationalCycleKeyTimeDayExpectation"("spaceId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_cycleId_idx" ON "OperationalCycleKeyTimeDayExpectation"("cycleId");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_keyTimeGroupId_idx" ON "OperationalCycleKeyTimeDayExpectation"("keyTimeGroupId");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_adjustedByUserId_idx" ON "OperationalCycleKeyTimeDayExpectation"("adjustedByUserId");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_adjustedByEmployeeId_idx" ON "OperationalCycleKeyTimeDayExpectation"("adjustedByEmployeeId");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_completedByUserId_idx" ON "OperationalCycleKeyTimeDayExpectation"("completedByUserId");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyTimeDayExpectation_completedByEmployeeId_idx" ON "OperationalCycleKeyTimeDayExpectation"("completedByEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalCycleKeyTimeDayExpectation_serviceDate_cycleId_s_key" ON "OperationalCycleKeyTimeDayExpectation"("serviceDate", "cycleId", "spaceId");

-- CreateIndex
CREATE INDEX "OperationalCycleTimingAdjustment_facilityId_departmentId_se_idx" ON "OperationalCycleTimingAdjustment"("facilityId", "departmentId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalCycleTimingAdjustment_cycleStableKey_serviceDate_idx" ON "OperationalCycleTimingAdjustment"("cycleStableKey", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalCycleTimingAdjustment_cycleId_idx" ON "OperationalCycleTimingAdjustment"("cycleId");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyPointActual_facilityId_departmentId_serv_idx" ON "OperationalCycleKeyPointActual"("facilityId", "departmentId", "serviceDate", "cycleStableKey");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyPointActual_cycleId_serviceDate_idx" ON "OperationalCycleKeyPointActual"("cycleId", "serviceDate");

-- CreateIndex
CREATE INDEX "OperationalCycleKeyPointActual_correctsActualId_idx" ON "OperationalCycleKeyPointActual"("correctsActualId");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleEvent_cycleId_createdAt_idx" ON "DepartmentOperationalCycleEvent"("cycleId", "createdAt");

-- CreateIndex
CREATE INDEX "DepartmentOperationalCycleEvent_facilityId_departmentId_cre_idx" ON "DepartmentOperationalCycleEvent"("facilityId", "departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_departmentId_operation_idx" ON "OperationalEvidenceRecord"("facilityId", "departmentId", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_departmentId_templateS_idx" ON "OperationalEvidenceRecord"("facilityId", "departmentId", "templateStableKey", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_unitId_operationalDate_idx" ON "OperationalEvidenceRecord"("facilityId", "unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_facilityId_assetId_operationalDat_idx" ON "OperationalEvidenceRecord"("facilityId", "assetId", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_requirementKey_operationalDate_idx" ON "OperationalEvidenceRecord"("requirementKey", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_logAttachmentId_operationalDate_idx" ON "OperationalEvidenceRecord"("logAttachmentId", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_logRequirementKey_operationalDate_idx" ON "OperationalEvidenceRecord"("logRequirementKey", "operationalDate");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_catalogDefinitionId_idx" ON "OperationalEvidenceRecord"("catalogDefinitionId");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_attachmentStableKey_idx" ON "OperationalEvidenceRecord"("attachmentStableKey");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_followsRecordId_idx" ON "OperationalEvidenceRecord"("followsRecordId");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_recordedByEmployeeId_idx" ON "OperationalEvidenceRecord"("recordedByEmployeeId");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_status_idx" ON "OperationalEvidenceRecord"("status");

-- CreateIndex
CREATE INDEX "OperationalEvidenceRecord_departmentId_operatorPeriodId_idx" ON "OperationalEvidenceRecord"("departmentId", "operatorPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvidenceRecord_facilityId_departmentId_clientCom_key" ON "OperationalEvidenceRecord"("facilityId", "departmentId", "clientCommandId");

-- CreateIndex
CREATE INDEX "OperationalEvidenceAttachment_recordId_displaySequence_idx" ON "OperationalEvidenceAttachment"("recordId", "displaySequence");

-- CreateIndex
CREATE INDEX "OperationalEvidenceAttachment_facilityId_recordId_idx" ON "OperationalEvidenceAttachment"("facilityId", "recordId");

-- CreateIndex
CREATE INDEX "OperationalEvidenceFieldValue_recordId_idx" ON "OperationalEvidenceFieldValue"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvidenceFieldValue_recordId_fieldKey_groupKey_ro_key" ON "OperationalEvidenceFieldValue"("recordId", "fieldKey", "groupKey", "rowKey");

-- CreateIndex
CREATE INDEX "OperationalEvidenceCorrection_recordId_createdAt_idx" ON "OperationalEvidenceCorrection"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogLogDefinition_status_idx" ON "CatalogLogDefinition"("status");

-- CreateIndex
CREATE INDEX "CatalogLogDefinition_purposeType_category_idx" ON "CatalogLogDefinition"("purposeType", "category");

-- CreateIndex
CREATE INDEX "CatalogLogDefinition_stableKey_status_idx" ON "CatalogLogDefinition"("stableKey", "status");

-- CreateIndex
CREATE INDEX "CatalogLogDefinition_ownerKind_ownerOrganizationId_idx" ON "CatalogLogDefinition"("ownerKind", "ownerOrganizationId");

-- CreateIndex
CREATE INDEX "CatalogLogDefinition_ownerFacilityId_idx" ON "CatalogLogDefinition"("ownerFacilityId");

-- CreateIndex
CREATE INDEX "CatalogLogDefinition_operatorPeriodId_idx" ON "CatalogLogDefinition"("operatorPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogLogDefinition_stableKey_version_key" ON "CatalogLogDefinition"("stableKey", "version");

-- CreateIndex
CREATE INDEX "CatalogLogField_definitionId_idx" ON "CatalogLogField"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogLogField_definitionId_fieldKey_key" ON "CatalogLogField"("definitionId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogLogField_definitionId_displaySequence_key" ON "CatalogLogField"("definitionId", "displaySequence");

-- CreateIndex
CREATE INDEX "CatalogSectionComponent_stableKey_status_idx" ON "CatalogSectionComponent"("stableKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSectionComponent_stableKey_version_key" ON "CatalogSectionComponent"("stableKey", "version");

-- CreateIndex
CREATE INDEX "FacilityCatalogInstall_catalogStableKey_idx" ON "FacilityCatalogInstall"("catalogStableKey");

-- CreateIndex
CREATE INDEX "FacilityCatalogInstall_catalogDefinitionId_idx" ON "FacilityCatalogInstall"("catalogDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityCatalogInstall_facilityId_catalogStableKey_key" ON "FacilityCatalogInstall"("facilityId", "catalogStableKey");

-- CreateIndex
CREATE INDEX "LogAttachment_facilityId_departmentId_status_idx" ON "LogAttachment"("facilityId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "LogAttachment_facilityId_catalogStableKey_idx" ON "LogAttachment"("facilityId", "catalogStableKey");

-- CreateIndex
CREATE INDEX "LogAttachment_catalogDefinitionId_idx" ON "LogAttachment"("catalogDefinitionId");

-- CreateIndex
CREATE INDEX "LogAttachment_assetId_idx" ON "LogAttachment"("assetId");

-- CreateIndex
CREATE INDEX "LogAttachment_spaceId_idx" ON "LogAttachment"("spaceId");

-- CreateIndex
CREATE INDEX "LogAttachment_unitId_idx" ON "LogAttachment"("unitId");

-- CreateIndex
CREATE INDEX "LogAttachment_targetDepartmentId_idx" ON "LogAttachment"("targetDepartmentId");

-- CreateIndex
CREATE INDEX "LogAttachment_effectiveFrom_idx" ON "LogAttachment"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LogAttachment_facilityId_stableKey_key" ON "LogAttachment"("facilityId", "stableKey");

-- CreateIndex
CREATE INDEX "LogAttachmentDailyWindow_attachmentId_idx" ON "LogAttachmentDailyWindow"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LogAttachmentDailyWindow_attachmentId_displaySequence_key" ON "LogAttachmentDailyWindow"("attachmentId", "displaySequence");

-- CreateIndex
CREATE INDEX "LogAttachmentCycleSelection_attachmentId_idx" ON "LogAttachmentCycleSelection"("attachmentId");

-- CreateIndex
CREATE INDEX "LogAttachmentCycleSelection_cycleStableKey_idx" ON "LogAttachmentCycleSelection"("cycleStableKey");

-- CreateIndex
CREATE UNIQUE INDEX "LogAttachmentCycleSelection_attachmentId_cycleStableKey_key" ON "LogAttachmentCycleSelection"("attachmentId", "cycleStableKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformStaff_email_key" ON "PlatformStaff"("email");

-- CreateIndex
CREATE INDEX "SetupImportBatch_facilityId_createdAt_idx" ON "SetupImportBatch"("facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "SetupImportResult_batchId_rowNumber_idx" ON "SetupImportResult"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SetupImportResult_batchId_rowNumber_phase_attempt_key" ON "SetupImportResult"("batchId", "rowNumber", "phase", "attempt");

-- CreateIndex
CREATE INDEX "HarborAuditEvent_staffId_createdAt_idx" ON "HarborAuditEvent"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX "HarborAuditEvent_facilityId_createdAt_idx" ON "HarborAuditEvent"("facilityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportContact_email_key" ON "SupportContact"("email");

-- CreateIndex
CREATE INDEX "SupportContact_userId_idx" ON "SupportContact"("userId");

-- CreateIndex
CREATE INDEX "SupportContact_facilityId_idx" ON "SupportContact"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_replyToken_key" ON "SupportTicket"("replyToken");

-- CreateIndex
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedStaffId_status_idx" ON "SupportTicket"("assignedStaffId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_facilityId_idx" ON "SupportTicket"("facilityId");

-- CreateIndex
CREATE INDEX "SupportTicket_contactId_idx" ON "SupportTicket"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketMessage_providerMessageId_key" ON "SupportTicketMessage"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketMessage_clientSubmissionId_key" ON "SupportTicketMessage"("clientSubmissionId");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_internetMessageId_idx" ON "SupportTicketMessage"("internetMessageId");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_messageId_idx" ON "SupportTicketAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketAttachment_messageId_position_key" ON "SupportTicketAttachment"("messageId", "position");

-- CreateIndex
CREATE INDEX "SupportSavedReply_isActive_name_idx" ON "SupportSavedReply"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTag_normalizedName_key" ON "SupportTag"("normalizedName");

-- CreateIndex
CREATE INDEX "SupportTag_isActive_name_idx" ON "SupportTag"("isActive", "name");

-- CreateIndex
CREATE INDEX "SupportTicketTag_tagId_ticketId_idx" ON "SupportTicketTag"("tagId", "ticketId");

-- CreateIndex
CREATE INDEX "SupportMacro_isActive_name_idx" ON "SupportMacro"("isActive", "name");

-- CreateIndex
CREATE INDEX "SupportMacro_savedReplyId_idx" ON "SupportMacro"("savedReplyId");

-- CreateIndex
CREATE INDEX "SupportMacroTag_tagId_idx" ON "SupportMacroTag"("tagId");

-- CreateIndex
CREATE INDEX "SupportMacroApplication_ticketId_appliedAt_idx" ON "SupportMacroApplication"("ticketId", "appliedAt");

-- CreateIndex
CREATE INDEX "SupportMacroApplication_macroId_appliedAt_idx" ON "SupportMacroApplication"("macroId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportStaffNotification_dedupeKey_key" ON "SupportStaffNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "SupportStaffNotification_staffId_isRead_createdAt_idx" ON "SupportStaffNotification"("staffId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "SupportStaffNotification_staffId_createdAt_idx" ON "SupportStaffNotification"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportStaffNotification_ticketId_idx" ON "SupportStaffNotification"("ticketId");

-- CreateIndex
CREATE INDEX "SupportAutomationRule_isActive_type_idx" ON "SupportAutomationRule"("isActive", "type");

-- CreateIndex
CREATE INDEX "SupportAutomationRule_savedReplyId_idx" ON "SupportAutomationRule"("savedReplyId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportAutomationRun_dedupeKey_key" ON "SupportAutomationRun"("dedupeKey");

-- CreateIndex
CREATE INDEX "SupportAutomationRun_ruleId_occurredAt_idx" ON "SupportAutomationRun"("ruleId", "occurredAt");

-- CreateIndex
CREATE INDEX "SupportAutomationRun_ticketId_occurredAt_idx" ON "SupportAutomationRun"("ticketId", "occurredAt");

-- CreateIndex
CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalRecordWaiver_facilityId_departmentId_operational_idx" ON "OperationalRecordWaiver"("facilityId", "departmentId", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRecordWaiver_facilityId_requirementKey_key" ON "OperationalRecordWaiver"("facilityId", "requirementKey");

-- CreateIndex
CREATE INDEX "PlaceNameChange_facilityId_unitSpaceId_effectiveFrom_idx" ON "PlaceNameChange"("facilityId", "unitSpaceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PlaceNameChange_facilityId_unitId_effectiveFrom_idx" ON "PlaceNameChange"("facilityId", "unitId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationEngagement_supportTicketId_key" ON "ImplementationEngagement"("supportTicketId");

-- CreateIndex
CREATE INDEX "ImplementationEngagement_facilityId_createdAt_idx" ON "ImplementationEngagement"("facilityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationOrder_engagementId_revision_key" ON "ImplementationOrder"("engagementId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_idempotencyKey_key" ON "ImplementationPaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_checkoutSessionId_key" ON "ImplementationPaymentAttempt"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_paymentIntentId_key" ON "ImplementationPaymentAttempt"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_orderId_sequence_key" ON "ImplementationPaymentAttempt"("orderId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationParticipant_engagementId_userId_key" ON "ImplementationParticipant"("engagementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationParticipant_engagementId_staffId_key" ON "ImplementationParticipant"("engagementId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationEvent_providerEventId_key" ON "ImplementationEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "ImplementationEvent_engagementId_createdAt_idx" ON "ImplementationEvent"("engagementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationImportLink_batchId_key" ON "ImplementationImportLink"("batchId");

-- CreateIndex
CREATE INDEX "SupportAttachmentScanAttempt_attachmentId_createdAt_idx" ON "SupportAttachmentScanAttempt"("attachmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportAttachmentScanAttempt_attachmentId_cycle_attempt_key" ON "SupportAttachmentScanAttempt"("attachmentId", "cycle", "attempt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_processedAt_createdAt_idx" ON "NotificationOutbox"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_departmentId_idx" ON "NotificationOutbox"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_facilityId_dedupeKey_key" ON "NotificationOutbox"("facilityId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_facilityId_resolvedAt_idx" ON "Notification"("facilityId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Notification_facilityId_sourceType_sourceId_idx" ON "Notification"("facilityId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Notification_departmentId_idx" ON "Notification"("departmentId");

-- CreateIndex
CREATE INDEX "Notification_facilityId_escalationDueAt_idx" ON "Notification"("facilityId", "escalationDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_facilityId_dedupeKey_key" ON "Notification"("facilityId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_createdAt_idx" ON "NotificationRecipient"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_readAt_idx" ON "NotificationRecipient"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_acknowledgedAt_idx" ON "NotificationRecipient"("userId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_snoozedUntil_idx" ON "NotificationRecipient"("userId", "snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_reason_key" ON "NotificationRecipient"("notificationId", "userId", "reason");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_queuedAt_idx" ON "NotificationDelivery"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationRecipientId_channel_key" ON "NotificationDelivery"("notificationRecipientId", "channel");

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperatorRelationship" ADD CONSTRAINT "DepartmentOperatorRelationship_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperatorRelationship" ADD CONSTRAINT "DepartmentOperatorRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperatorRelationship" ADD CONSTRAINT "DepartmentOperatorRelationship_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_operatorRelationshipId_fkey" FOREIGN KEY ("operatorRelationshipId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentVendorHeadAssignment" ADD CONSTRAINT "DepartmentVendorHeadAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerOrganization" ADD CONSTRAINT "FacilityPartnerOrganization_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerAccessPeriod" ADD CONSTRAINT "FacilityPartnerAccessPeriod_facilityPartnerOrganizationId_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerAccessPeriod" ADD CONSTRAINT "FacilityPartnerAccessPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerAccessPeriod" ADD CONSTRAINT "FacilityPartnerAccessPeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_facilityPartnerOrganization_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerDepartmentScope" ADD CONSTRAINT "FacilityPartnerDepartmentScope_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerRoleCeilingPeriod" ADD CONSTRAINT "FacilityPartnerRoleCeilingPeriod_facilityPartnerOrganizati_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerRoleCeilingPeriod" ADD CONSTRAINT "FacilityPartnerRoleCeilingPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerRoleCeilingPeriod" ADD CONSTRAINT "FacilityPartnerRoleCeilingPeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUserFacilityAccess" ADD CONSTRAINT "PartnerUserFacilityAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUserFacilityAccess" ADD CONSTRAINT "PartnerUserFacilityAccess_facilityPartnerOrganizationId_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUserFacilityAccess" ADD CONSTRAINT "PartnerUserFacilityAccess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_partnerUserFacilityAccessId_fkey" FOREIGN KEY ("partnerUserFacilityAccessId") REFERENCES "PartnerUserFacilityAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerStaffingPolicyPeriod" ADD CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_facilityPartnerOrganiz_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerStaffingPolicyPeriod" ADD CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerStaffingPolicyPeriod" ADD CONSTRAINT "FacilityPartnerStaffingPolicyPeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerUserRestrictionPeriod" ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerUserRestrictionPeriod" ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_facilityPartnerOrgani_fkey" FOREIGN KEY ("facilityPartnerOrganizationId") REFERENCES "FacilityPartnerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerUserRestrictionPeriod" ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityPartnerUserRestrictionPeriod" ADD CONSTRAINT "FacilityPartnerUserRestrictionPeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationRolePeriod" ADD CONSTRAINT "UserOrganizationRolePeriod_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "UserOrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationRolePeriod" ADD CONSTRAINT "UserOrganizationRolePeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationRolePeriod" ADD CONSTRAINT "UserOrganizationRolePeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_requestedFromFacilityId_fkey" FOREIGN KEY ("requestedFromFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_approvedByPlatformStaffId_fkey" FOREIGN KEY ("approvedByPlatformStaffId") REFERENCES "PlatformStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_rejectedByPlatformStaffId_fkey" FOREIGN KEY ("rejectedByPlatformStaffId") REFERENCES "PlatformStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_revokedByPlatformStaffId_fkey" FOREIGN KEY ("revokedByPlatformStaffId") REFERENCES "PlatformStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationClaimInvitation" ADD CONSTRAINT "OrganizationClaimInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_invitedByPlatformStaffId_fkey" FOREIGN KEY ("invitedByPlatformStaffId") REFERENCES "PlatformStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMemberInvitation" ADD CONSTRAINT "OrganizationMemberInvitation_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBilling" ADD CONSTRAINT "FacilityBilling_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityDepartmentEntitlement" ADD CONSTRAINT "FacilityDepartmentEntitlement_facilityBillingId_fkey" FOREIGN KEY ("facilityBillingId") REFERENCES "FacilityBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityDepartmentEntitlement" ADD CONSTRAINT "FacilityDepartmentEntitlement_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityDepartmentEntitlement" ADD CONSTRAINT "FacilityDepartmentEntitlement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTitle" ADD CONSTRAINT "JobTitle_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentStaffManager" ADD CONSTRAINT "DepartmentStaffManager_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentStaffManager" ADD CONSTRAINT "DepartmentStaffManager_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingManagerInvite" ADD CONSTRAINT "OnboardingManagerInvite_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCycleSettings" ADD CONSTRAINT "MenuCycleSettings_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCycleSettings" ADD CONSTRAINT "MenuCycleSettings_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuLocationApplicability" ADD CONSTRAINT "MenuLocationApplicability_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuLocationApplicability" ADD CONSTRAINT "MenuLocationApplicability_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuLocationApplicability" ADD CONSTRAINT "MenuLocationApplicability_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOperationalCycleApplicability" ADD CONSTRAINT "MenuOperationalCycleApplicability_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_primaryDepartmentId_fkey" FOREIGN KEY ("primaryDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountInviteToken" ADD CONSTRAINT "AccountInviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevokedUserSession" ADD CONSTRAINT "RevokedUserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDispatch" ADD CONSTRAINT "PushDispatch_notificationRecipientId_fkey" FOREIGN KEY ("notificationRecipientId") REFERENCES "NotificationRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDispatch" ADD CONSTRAINT "PushDispatch_pushSubscriptionId_fkey" FOREIGN KEY ("pushSubscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardFacilityDefault" ADD CONSTRAINT "DashboardFacilityDefault_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFacilityAccess" ADD CONSTRAINT "UserFacilityAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFacilityAccess" ADD CONSTRAINT "UserFacilityAccess_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFacilityAccess" ADD CONSTRAINT "UserFacilityAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFacilityRolePeriod" ADD CONSTRAINT "UserFacilityRolePeriod_userFacilityAccessId_fkey" FOREIGN KEY ("userFacilityAccessId") REFERENCES "UserFacilityAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFacilityRolePeriod" ADD CONSTRAINT "UserFacilityRolePeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFacilityRolePeriod" ADD CONSTRAINT "UserFacilityRolePeriod_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_outgoingUserId_fkey" FOREIGN KEY ("outgoingUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_parentUnitId_fkey" FOREIGN KEY ("parentUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDepartmentResponsibility" ADD CONSTRAINT "UnitDepartmentResponsibility_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDepartmentResponsibility" ADD CONSTRAINT "UnitDepartmentResponsibility_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityRoomType" ADD CONSTRAINT "FacilityRoomType_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitSpace" ADD CONSTRAINT "UnitSpace_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitSpace" ADD CONSTRAINT "UnitSpace_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitSpace" ADD CONSTRAINT "UnitSpace_facilityRoomTypeId_fkey" FOREIGN KEY ("facilityRoomTypeId") REFERENCES "FacilityRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitSpace" ADD CONSTRAINT "UnitSpace_parentSpaceId_fkey" FOREIGN KEY ("parentSpaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeam" ADD CONSTRAINT "DepartmentTeam_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeam" ADD CONSTRAINT "DepartmentTeam_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeam" ADD CONSTRAINT "DepartmentTeam_managerEmployeeId_fkey" FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeamRoomMembership" ADD CONSTRAINT "DepartmentTeamRoomMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DepartmentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTeamRoomMembership" ADD CONSTRAINT "DepartmentTeamRoomMembership_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTeamMembership" ADD CONSTRAINT "EmployeeTeamMembership_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTeamMembership" ADD CONSTRAINT "EmployeeTeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DepartmentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitSpaceResponsibility" ADD CONSTRAINT "UnitSpaceResponsibility_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitSpaceResponsibility" ADD CONSTRAINT "UnitSpaceResponsibility_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_primaryUnitId_fkey" FOREIGN KEY ("primaryUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_primaryDepartmentId_fkey" FOREIGN KEY ("primaryDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUserLinkInvitation" ADD CONSTRAINT "EmployeeUserLinkInvitation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUserLinkInvitation" ADD CONSTRAINT "EmployeeUserLinkInvitation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUserLinkInvitation" ADD CONSTRAINT "EmployeeUserLinkInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUserLinkInvitation" ADD CONSTRAINT "EmployeeUserLinkInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkStation" ADD CONSTRAINT "EmployeeWorkStation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinePointEntry" ADD CONSTRAINT "DisciplinePointEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinePointEntry" ADD CONSTRAINT "DisciplinePointEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHrAuditLog" ADD CONSTRAINT "EmployeeHrAuditLog_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHrAuditLog" ADD CONSTRAINT "EmployeeHrAuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHrAuditLog" ADD CONSTRAINT "EmployeeHrAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTerminationRecord" ADD CONSTRAINT "EmployeeTerminationRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTerminationRecord" ADD CONSTRAINT "EmployeeTerminationRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTerminationRecord" ADD CONSTRAINT "EmployeeTerminationRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUnitAccess" ADD CONSTRAINT "EmployeeUnitAccess_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUnitAccess" ADD CONSTRAINT "EmployeeUnitAccess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskUnitPinLoginEvent" ADD CONSTRAINT "KioskUnitPinLoginEvent_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskUnitPinLoginEvent" ADD CONSTRAINT "KioskUnitPinLoginEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskUnitPinLoginEvent" ADD CONSTRAINT "KioskUnitPinLoginEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultAssignment" ADD CONSTRAINT "DefaultAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultAssignment" ADD CONSTRAINT "DefaultAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityOrganization" ADD CONSTRAINT "FacilityOrganization_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityOrganization" ADD CONSTRAINT "FacilityOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_facilityOrganizationId_fkey" FOREIGN KEY ("facilityOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintainerProposal" ADD CONSTRAINT "AssetMaintainerProposal_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_responsibleOrganizationId_fkey" FOREIGN KEY ("responsibleOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_titleOrganizationId_fkey" FOREIGN KEY ("titleOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_lastChangedByUserId_fkey" FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPresenceNote" ADD CONSTRAINT "AssetPresenceNote_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPresenceNote" ADD CONSTRAINT "AssetPresenceNote_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPresenceNote" ADD CONSTRAINT "AssetPresenceNote_titleOrganizationId_fkey" FOREIGN KEY ("titleOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_sourceIssueId_fkey" FOREIGN KEY ("sourceIssueId") REFERENCES "AssetIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetStatusHistory" ADD CONSTRAINT "AssetStatusHistory_sourceRepairId_fkey" FOREIGN KEY ("sourceRepairId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_reportedByEmployeeId_fkey" FOREIGN KEY ("reportedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_originEvidenceRecordId_fkey" FOREIGN KEY ("originEvidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssueUpdate" ADD CONSTRAINT "AssetIssueUpdate_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "AssetIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssueUpdate" ADD CONSTRAINT "AssetIssueUpdate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssueUpdate" ADD CONSTRAINT "AssetIssueUpdate_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssueEvidenceLink" ADD CONSTRAINT "AssetIssueEvidenceLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "AssetIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssueEvidenceLink" ADD CONSTRAINT "AssetIssueEvidenceLink_evidenceRecordId_fkey" FOREIGN KEY ("evidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIssueEvidenceLink" ADD CONSTRAINT "AssetIssueEvidenceLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRequestRoute" ADD CONSTRAINT "DepartmentRequestRoute_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRequestRoute" ADD CONSTRAINT "DepartmentRequestRoute_requestingDepartmentId_fkey" FOREIGN KEY ("requestingDepartmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRequestRoute" ADD CONSTRAINT "DepartmentRequestRoute_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_requestingDepartmentId_fkey" FOREIGN KEY ("requestingDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_affectedDepartmentId_fkey" FOREIGN KEY ("affectedDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_reportedByEmployeeId_fkey" FOREIGN KEY ("reportedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_relatedAssetIssueId_fkey" FOREIGN KEY ("relatedAssetIssueId") REFERENCES "AssetIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequest" ADD CONSTRAINT "OperationalRequest_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequestUpdate" ADD CONSTRAINT "OperationalRequestUpdate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequestUpdate" ADD CONSTRAINT "OperationalRequestUpdate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequestUpdate" ADD CONSTRAINT "OperationalRequestUpdate_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequestEvidenceLink" ADD CONSTRAINT "OperationalRequestEvidenceLink_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequestEvidenceLink" ADD CONSTRAINT "OperationalRequestEvidenceLink_evidenceRecordId_fkey" FOREIGN KEY ("evidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRequestEvidenceLink" ADD CONSTRAINT "OperationalRequestEvidenceLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCategory" ADD CONSTRAINT "MaintenanceCategory_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_requestingDepartmentId_fkey" FOREIGN KEY ("requestingDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_pmOccurrenceId_fkey" FOREIGN KEY ("pmOccurrenceId") REFERENCES "PreventiveMaintenanceOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_payerOrganizationId_fkey" FOREIGN KEY ("payerOrganizationId") REFERENCES "FacilityOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_assetConditionReviewedByUserId_fkey" FOREIGN KEY ("assetConditionReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "AssetIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_procedureVersionId_fkey" FOREIGN KEY ("procedureVersionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_maintenanceCategoryId_fkey" FOREIGN KEY ("maintenanceCategoryId") REFERENCES "MaintenanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairEvidenceLink" ADD CONSTRAINT "RepairEvidenceLink_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairEvidenceLink" ADD CONSTRAINT "RepairEvidenceLink_evidenceRecordId_fkey" FOREIGN KEY ("evidenceRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairEvidenceLink" ADD CONSTRAINT "RepairEvidenceLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLaborEntry" ADD CONSTRAINT "RepairLaborEntry_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLaborEntry" ADD CONSTRAINT "RepairLaborEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLaborEntry" ADD CONSTRAINT "RepairLaborEntry_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPartUsed" ADD CONSTRAINT "RepairPartUsed_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPartUsed" ADD CONSTRAINT "RepairPartUsed_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRecordRequirement" ADD CONSTRAINT "RepairRecordRequirement_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRecordRequirement" ADD CONSTRAINT "RepairRecordRequirement_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRecordRequirement" ADD CONSTRAINT "RepairRecordRequirement_satisfiedByRecordId_fkey" FOREIGN KEY ("satisfiedByRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRecordRequirement" ADD CONSTRAINT "RepairRecordRequirement_waivedByUserId_fkey" FOREIGN KEY ("waivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRecordRequirement" ADD CONSTRAINT "RepairRecordRequirement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairUpdate" ADD CONSTRAINT "RepairUpdate_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairUpdate" ADD CONSTRAINT "RepairUpdate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderResponseHistory" ADD CONSTRAINT "WorkOrderResponseHistory_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderResponseHistory" ADD CONSTRAINT "WorkOrderResponseHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlan" ADD CONSTRAINT "PreventiveMaintenancePlan_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlan" ADD CONSTRAINT "PreventiveMaintenancePlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlan" ADD CONSTRAINT "PreventiveMaintenancePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlan" ADD CONSTRAINT "PreventiveMaintenancePlan_retiredByUserId_fkey" FOREIGN KEY ("retiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlan" ADD CONSTRAINT "PreventiveMaintenancePlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanVersion" ADD CONSTRAINT "PreventiveMaintenancePlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PreventiveMaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanVersion" ADD CONSTRAINT "PreventiveMaintenancePlanVersion_createdFromVersionId_fkey" FOREIGN KEY ("createdFromVersionId") REFERENCES "PreventiveMaintenancePlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanVersion" ADD CONSTRAINT "PreventiveMaintenancePlanVersion_maintenanceCategoryId_fkey" FOREIGN KEY ("maintenanceCategoryId") REFERENCES "MaintenanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanVersion" ADD CONSTRAINT "PreventiveMaintenancePlanVersion_procedureVersionId_fkey" FOREIGN KEY ("procedureVersionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanVersion" ADD CONSTRAINT "PreventiveMaintenancePlanVersion_defaultAssignedEmployeeId_fkey" FOREIGN KEY ("defaultAssignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanVersion" ADD CONSTRAINT "PreventiveMaintenancePlanVersion_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ADD CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PreventiveMaintenancePlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenancePlanRecordRequirement" ADD CONSTRAINT "PreventiveMaintenancePlanRecordRequirement_catalogDefiniti_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceOccurrence" ADD CONSTRAINT "PreventiveMaintenanceOccurrence_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PreventiveMaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceOccurrence" ADD CONSTRAINT "PreventiveMaintenanceOccurrence_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PreventiveMaintenancePlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceOccurrence" ADD CONSTRAINT "PreventiveMaintenanceOccurrence_skippedByUserId_fkey" FOREIGN KEY ("skippedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceOccurrence" ADD CONSTRAINT "PreventiveMaintenanceOccurrence_completedWorkOrderId_fkey" FOREIGN KEY ("completedWorkOrderId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAreaStatus" ADD CONSTRAINT "RoomAreaStatus_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAreaStatus" ADD CONSTRAINT "RoomAreaStatus_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAreaStatus" ADD CONSTRAINT "RoomAreaStatus_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_createdFromVersionId_fkey" FOREIGN KEY ("createdFromVersionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleUnit" ADD CONSTRAINT "KnowledgeArticleUnit_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleUnit" ADD CONSTRAINT "KnowledgeArticleUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleAsset" ADD CONSTRAINT "KnowledgeArticleAsset_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleAsset" ADD CONSTRAINT "KnowledgeArticleAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleCatalogDefinition" ADD CONSTRAINT "KnowledgeArticleCatalogDefinition_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleCatalogDefinition" ADD CONSTRAINT "KnowledgeArticleCatalogDefinition_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperationalBrief" ADD CONSTRAINT "AiOperationalBrief_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentPlan" ADD CONSTRAINT "OperationalAssignmentPlan_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentPlan" ADD CONSTRAINT "OperationalAssignmentPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentPlan" ADD CONSTRAINT "OperationalAssignmentPlan_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentPlan" ADD CONSTRAINT "OperationalAssignmentPlan_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentPlan" ADD CONSTRAINT "OperationalAssignmentPlan_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentPlan" ADD CONSTRAINT "OperationalAssignmentPlan_coverageAcknowledgedByUserId_fkey" FOREIGN KEY ("coverageAcknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentPlan" ADD CONSTRAINT "OperationalAssignmentPlan_lastChangedByUserId_fkey" FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalZone" ADD CONSTRAINT "DepartmentOperationalZone_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalZone" ADD CONSTRAINT "DepartmentOperationalZone_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalZone" ADD CONSTRAINT "DepartmentOperationalZone_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalZone" ADD CONSTRAINT "DepartmentOperationalZone_lastChangedByUserId_fkey" FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalZoneLocation" ADD CONSTRAINT "DepartmentOperationalZoneLocation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DepartmentOperationalZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalZoneLocation" ADD CONSTRAINT "DepartmentOperationalZoneLocation_unitSpaceId_fkey" FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentLocation" ADD CONSTRAINT "OperationalAssignmentLocation_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "OperationalAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentLocation" ADD CONSTRAINT "OperationalAssignmentLocation_unitSpaceId_fkey" FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OperationalAssignmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_sourceZoneId_fkey" FOREIGN KEY ("sourceZoneId") REFERENCES "DepartmentOperationalZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "OperationalAssignmentTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignment" ADD CONSTRAINT "OperationalAssignment_lastChangedByUserId_fkey" FOREIGN KEY ("lastChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeOperationalRoleQualification" ADD CONSTRAINT "EmployeeOperationalRoleQualification_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeOperationalRoleQualification" ADD CONSTRAINT "EmployeeOperationalRoleQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeOperationalRoleQualification" ADD CONSTRAINT "EmployeeOperationalRoleQualification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentEvent" ADD CONSTRAINT "OperationalAssignmentEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "OperationalAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentEvent" ADD CONSTRAINT "OperationalAssignmentEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OperationalAssignmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentEvent" ADD CONSTRAINT "OperationalAssignmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageEpisode" ADD CONSTRAINT "CoverageEpisode_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageEpisode" ADD CONSTRAINT "CoverageEpisode_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageEpisodeTransition" ADD CONSTRAINT "CoverageEpisodeTransition_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "CoverageEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplate" ADD CONSTRAINT "OperationalAssignmentTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplateItem" ADD CONSTRAINT "OperationalAssignmentTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OperationalAssignmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplateItem" ADD CONSTRAINT "OperationalAssignmentTemplateItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAssignmentTemplateItem" ADD CONSTRAINT "OperationalAssignmentTemplateItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineBundleIssuance" ADD CONSTRAINT "OfflineBundleIssuance_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineBundleIssuance" ADD CONSTRAINT "OfflineBundleIssuance_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncReceipt" ADD CONSTRAINT "OfflineSyncReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncReceipt" ADD CONSTRAINT "OfflineSyncReceipt_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_resolvedByEmployeeId_fkey" FOREIGN KEY ("resolvedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycle" ADD CONSTRAINT "DepartmentOperationalCycle_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycle" ADD CONSTRAINT "DepartmentOperationalCycle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycle" ADD CONSTRAINT "DepartmentOperationalCycle_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleLocation" ADD CONSTRAINT "DepartmentOperationalCycleLocation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleLocation" ADD CONSTRAINT "DepartmentOperationalCycleLocation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleLocation" ADD CONSTRAINT "DepartmentOperationalCycleLocation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleKeyTimeGroup" ADD CONSTRAINT "DepartmentOperationalCycleKeyTimeGroup_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleKeyTimeGroupRoom" ADD CONSTRAINT "DepartmentOperationalCycleKeyTimeGroupRoom_keyTimeGroupId_fkey" FOREIGN KEY ("keyTimeGroupId") REFERENCES "DepartmentOperationalCycleKeyTimeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleKeyTimeGroupRoom" ADD CONSTRAINT "DepartmentOperationalCycleKeyTimeGroupRoom_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleMilestoneTime" ADD CONSTRAINT "DepartmentOperationalCycleMilestoneTime_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleMilestoneTime" ADD CONSTRAINT "DepartmentOperationalCycleMilestoneTime_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleDayExpectation" ADD CONSTRAINT "OperationalCycleDayExpectation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleDayExpectation" ADD CONSTRAINT "OperationalCycleDayExpectation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleDayExpectation" ADD CONSTRAINT "OperationalCycleDayExpectation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleDayExpectation" ADD CONSTRAINT "OperationalCycleDayExpectation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleDayExpectation" ADD CONSTRAINT "OperationalCycleDayExpectation_adjustedByUserId_fkey" FOREIGN KEY ("adjustedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleDayExpectation" ADD CONSTRAINT "OperationalCycleDayExpectation_adjustedByEmployeeId_fkey" FOREIGN KEY ("adjustedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_keyTimeGroupId_fkey" FOREIGN KEY ("keyTimeGroupId") REFERENCES "DepartmentOperationalCycleKeyTimeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_adjustedByUserId_fkey" FOREIGN KEY ("adjustedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_adjustedByEmployeeId_fkey" FOREIGN KEY ("adjustedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyTimeDayExpectation" ADD CONSTRAINT "OperationalCycleKeyTimeDayExpectation_completedByEmployeeI_fkey" FOREIGN KEY ("completedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleTimingAdjustment" ADD CONSTRAINT "OperationalCycleTimingAdjustment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalCycleKeyPointActual" ADD CONSTRAINT "OperationalCycleKeyPointActual_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentOperationalCycleEvent" ADD CONSTRAINT "DepartmentOperationalCycleEvent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DepartmentOperationalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_logAttachmentId_fkey" FOREIGN KEY ("logAttachmentId") REFERENCES "LogAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_recordedByEmployeeId_fkey" FOREIGN KEY ("recordedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_followsRecordId_fkey" FOREIGN KEY ("followsRecordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceAttachment" ADD CONSTRAINT "OperationalEvidenceAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceFieldValue" ADD CONSTRAINT "OperationalEvidenceFieldValue_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceCorrection" ADD CONSTRAINT "OperationalEvidenceCorrection_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OperationalEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceCorrection" ADD CONSTRAINT "OperationalEvidenceCorrection_correctedByUserId_fkey" FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvidenceCorrection" ADD CONSTRAINT "OperationalEvidenceCorrection_correctedByEmployeeId_fkey" FOREIGN KEY ("correctedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogLogDefinition" ADD CONSTRAINT "CatalogLogDefinition_ownerFacilityId_fkey" FOREIGN KEY ("ownerFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogLogDefinition" ADD CONSTRAINT "CatalogLogDefinition_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogLogDefinition" ADD CONSTRAINT "CatalogLogDefinition_operatorPeriodId_fkey" FOREIGN KEY ("operatorPeriodId") REFERENCES "DepartmentOperatorRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogLogField" ADD CONSTRAINT "CatalogLogField_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityCatalogInstall" ADD CONSTRAINT "FacilityCatalogInstall_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityCatalogInstall" ADD CONSTRAINT "FacilityCatalogInstall_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_catalogDefinitionId_fkey" FOREIGN KEY ("catalogDefinitionId") REFERENCES "CatalogLogDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "UnitSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_targetDepartmentId_fkey" FOREIGN KEY ("targetDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachmentDailyWindow" ADD CONSTRAINT "LogAttachmentDailyWindow_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "LogAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAttachmentCycleSelection" ADD CONSTRAINT "LogAttachmentCycleSelection_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "LogAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupImportBatch" ADD CONSTRAINT "SetupImportBatch_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupImportBatch" ADD CONSTRAINT "SetupImportBatch_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupImportBatch" ADD CONSTRAINT "SetupImportBatch_actorStaffId_fkey" FOREIGN KEY ("actorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupImportResult" ADD CONSTRAINT "SetupImportResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SetupImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarborAuditEvent" ADD CONSTRAINT "HarborAuditEvent_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportContact" ADD CONSTRAINT "SupportContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportContact" ADD CONSTRAINT "SupportContact_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SupportContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SupportContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportSavedReply" ADD CONSTRAINT "SupportSavedReply_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketTag" ADD CONSTRAINT "SupportTicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketTag" ADD CONSTRAINT "SupportTicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "SupportTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketTag" ADD CONSTRAINT "SupportTicketTag_addedByStaffId_fkey" FOREIGN KEY ("addedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacro" ADD CONSTRAINT "SupportMacro_savedReplyId_fkey" FOREIGN KEY ("savedReplyId") REFERENCES "SupportSavedReply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacro" ADD CONSTRAINT "SupportMacro_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacro" ADD CONSTRAINT "SupportMacro_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroTag" ADD CONSTRAINT "SupportMacroTag_macroId_fkey" FOREIGN KEY ("macroId") REFERENCES "SupportMacro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroTag" ADD CONSTRAINT "SupportMacroTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "SupportTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroApplication" ADD CONSTRAINT "SupportMacroApplication_macroId_fkey" FOREIGN KEY ("macroId") REFERENCES "SupportMacro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroApplication" ADD CONSTRAINT "SupportMacroApplication_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMacroApplication" ADD CONSTRAINT "SupportMacroApplication_appliedByStaffId_fkey" FOREIGN KEY ("appliedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportStaffNotification" ADD CONSTRAINT "SupportStaffNotification_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportStaffNotification" ADD CONSTRAINT "SupportStaffNotification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportStaffNotification" ADD CONSTRAINT "SupportStaffNotification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAutomationRule" ADD CONSTRAINT "SupportAutomationRule_savedReplyId_fkey" FOREIGN KEY ("savedReplyId") REFERENCES "SupportSavedReply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAutomationRule" ADD CONSTRAINT "SupportAutomationRule_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAutomationRun" ADD CONSTRAINT "SupportAutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SupportAutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAutomationRun" ADD CONSTRAINT "SupportAutomationRun_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_actorStaffId_fkey" FOREIGN KEY ("actorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_causedByMessageId_fkey" FOREIGN KEY ("causedByMessageId") REFERENCES "SupportTicketMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_responsibleStaffId_fkey" FOREIGN KEY ("responsibleStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_supportTicketId_fkey" FOREIGN KEY ("supportTicketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEngagement" ADD CONSTRAINT "ImplementationEngagement_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_waivedByStaffId_fkey" FOREIGN KEY ("waivedByStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationPaymentAttempt" ADD CONSTRAINT "ImplementationPaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ImplementationOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_actorStaffId_fkey" FOREIGN KEY ("actorStaffId") REFERENCES "PlatformStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationImportLink" ADD CONSTRAINT "ImplementationImportLink_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ImplementationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationImportLink" ADD CONSTRAINT "ImplementationImportLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SetupImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAttachmentScanAttempt" ADD CONSTRAINT "SupportAttachmentScanAttempt_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "SupportTicketAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationRecipientId_fkey" FOREIGN KEY ("notificationRecipientId") REFERENCES "NotificationRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL constraints and indexes outside the Prisma model.
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_one_owner_check" CHECK ((num_nonnulls("userId", "employeeId") = 1));
ALTER TABLE "DepartmentOperationalCycleLocation" ADD CONSTRAINT "DepartmentOperationalCycleLocation_target_xor" CHECK (((("unitId" IS NOT NULL) AND ("spaceId" IS NULL)) OR (("unitId" IS NULL) AND ("spaceId" IS NOT NULL))));
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_closed_check" CHECK (((status = 'PENDING'::"FacilityAdministratorInvitationStatus") = ("closedAt" IS NULL)));
ALTER TABLE "FacilityAdministratorInvitation" ADD CONSTRAINT "FacilityAdministratorInvitation_outgoing_role_check" CHECK ((((kind = 'TRANSFER'::"FacilityAdministratorInvitationKind") = ("outgoingRoleKey" IS NOT NULL)) AND (("outgoingRoleKey" IS NULL) OR ("outgoingRoleKey" <> 'FACILITY_ADMINISTRATOR'::"RoleKey"))));
ALTER TABLE "ImplementationEvent" ADD CONSTRAINT "ImplementationEvent_actor" CHECK (((("actorKind" = 'customer'::text) AND ("actorUserId" IS NOT NULL) AND ("actorStaffId" IS NULL)) OR (("actorKind" = 'staff'::text) AND ("actorStaffId" IS NOT NULL) AND ("actorUserId" IS NULL)) OR (("actorKind" = 'provider'::text) AND ("actorUserId" IS NULL) AND ("actorStaffId" IS NULL))));
ALTER TABLE "ImplementationOrder" ADD CONSTRAINT "ImplementationOrder_price_approval" CHECK ((("amountCents" >= 0) AND (currency = 'usd'::text) AND (revision > 0) AND ((("approvedAt" IS NULL) AND ("approvedByUserId" IS NULL)) OR (("approvedAt" IS NOT NULL) AND ("approvedByUserId" IS NOT NULL))) AND ((("waivedByStaffId" IS NULL) AND ("waiverReason" IS NULL) AND ("amountCents" > 0)) OR (("waivedByStaffId" IS NOT NULL) AND (length(TRIM(BOTH FROM "waiverReason")) >= 3) AND ("amountCents" = 0)))));
ALTER TABLE "ImplementationParticipant" ADD CONSTRAINT "ImplementationParticipant_principal" CHECK ((((("userId" IS NOT NULL))::integer + (("staffId" IS NOT NULL))::integer) = 1));
ALTER TABLE "ImplementationPaymentAttempt" ADD CONSTRAINT "ImplementationPaymentAttempt_status" CHECK ((status = ANY (ARRAY['PREPARED'::text, 'UNKNOWN'::text, 'OPEN'::text, 'PAID'::text, 'EXPIRED'::text])));
ALTER TABLE "LogAttachment" ADD CONSTRAINT "LogAttachment_target_exclusivity_check" CHECK (((("targetKind" = 'ASSET'::"LogAttachmentTargetKind") AND ("assetId" IS NOT NULL) AND ("spaceId" IS NULL) AND ("unitId" IS NULL) AND ("targetDepartmentId" IS NULL)) OR (("targetKind" = 'SPACE'::"LogAttachmentTargetKind") AND ("spaceId" IS NOT NULL) AND ("assetId" IS NULL) AND ("unitId" IS NULL) AND ("targetDepartmentId" IS NULL)) OR (("targetKind" = 'UNIT'::"LogAttachmentTargetKind") AND ("unitId" IS NOT NULL) AND ("assetId" IS NULL) AND ("spaceId" IS NULL) AND ("targetDepartmentId" IS NULL)) OR (("targetKind" = 'DEPARTMENT'::"LogAttachmentTargetKind") AND ("targetDepartmentId" IS NOT NULL) AND ("assetId" IS NULL) AND ("spaceId" IS NULL) AND ("unitId" IS NULL)) OR (("targetKind" = 'FACILITY'::"LogAttachmentTargetKind") AND ("assetId" IS NULL) AND ("spaceId" IS NULL) AND ("unitId" IS NULL) AND ("targetDepartmentId" IS NULL))));
ALTER TABLE "MenuLocationApplicability" ADD CONSTRAINT "MenuLocationApplicability_target_xor" CHECK (((("unitId" IS NOT NULL) AND ("spaceId" IS NULL)) OR (("unitId" IS NULL) AND ("spaceId" IS NOT NULL))));
ALTER TABLE "OperationalEvidenceCorrection" ADD CONSTRAINT "OperationalEvidenceCorrection_acting_context_chk" CHECK ((("actingAccessKind" IS NULL) OR (("actingAccessKind" = 'partner'::text) AND ("actingPartnerOrganizationId" IS NOT NULL) AND ("actingFacilityPartnerOrganizationId" IS NOT NULL) AND ("actingEffectivePartnerRole" IS NOT NULL))));
ALTER TABLE "OperationalEvidenceRecord" ADD CONSTRAINT "OperationalEvidenceRecord_acting_context_chk" CHECK ((("actingAccessKind" IS NULL) OR (("actingAccessKind" = 'partner'::text) AND ("actingPartnerOrganizationId" IS NOT NULL) AND ("actingFacilityPartnerOrganizationId" IS NOT NULL) AND ("actingEffectivePartnerRole" IS NOT NULL))));
ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_created_authority_ck" CHECK (((("createdByAuthorityKind" = 'facility_admin'::"PartnerAssignmentAuthorityKind") AND ("createdByOrganizationId" IS NULL)) OR (("createdByAuthorityKind" = 'partner_org_admin'::"PartnerAssignmentAuthorityKind") AND ("createdByOrganizationId" IS NOT NULL))));
ALTER TABLE "PartnerUserRolePeriod" ADD CONSTRAINT "PartnerUserRolePeriod_ended_authority_ck" CHECK (((("endsAt" IS NULL) AND ("endedByAuthorityKind" IS NULL) AND ("endedByOrganizationId" IS NULL)) OR (("endsAt" IS NOT NULL) AND ("endedByAuthorityKind" = 'facility_admin'::"PartnerAssignmentAuthorityKind") AND ("endedByOrganizationId" IS NULL)) OR (("endsAt" IS NOT NULL) AND ("endedByAuthorityKind" = 'partner_org_admin'::"PartnerAssignmentAuthorityKind") AND ("endedByOrganizationId" IS NOT NULL))));
ALTER TABLE "SetupImportBatch" ADD CONSTRAINT "SetupImportBatch_actor_check" CHECK (((("actorKind" = 'user'::text) AND ("actorUserId" IS NOT NULL) AND ("actorStaffId" IS NULL)) OR (("actorKind" = 'harbor_staff'::text) AND ("actorStaffId" IS NOT NULL) AND ("actorUserId" IS NULL))));
ALTER TABLE "SetupImportResult" ADD CONSTRAINT "SetupImportResult_attempt_check" CHECK (((attempt > 0) AND ("rowNumber" > 1)));
ALTER TABLE "SupportAttachmentScanAttempt" ADD CONSTRAINT "SupportAttachmentScanAttempt_bounds" CHECK ((((attempt >= 1) AND (attempt <= 3)) AND (cycle > 0) AND (("expectedSizeBytes" >= 1) AND ("expectedSizeBytes" <= 10485760)) AND ("expectedSha256" ~ '^[a-f0-9]{64}$'::text) AND (status = ANY (ARRAY['RUNNING'::text, 'CLEAN'::text, 'BLOCKED'::text, 'FAILED'::text, 'STALE'::text]))));
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_replyToken_format_check" CHECK (("replyToken" ~ '^[0-9a-f]{32,40}$'::text));
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_inbound_check" CHECK (((kind <> 'INBOUND'::"SupportTicketMessageKind") OR (("contactId" IS NOT NULL) AND ("authorStaffId" IS NULL) AND ("deliveryStatus" IS NULL) AND ("deliveryError" IS NULL) AND ("sentAt" IS NULL))));
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_note_check" CHECK (((kind <> 'NOTE'::"SupportTicketMessageKind") OR (("authorStaffId" IS NOT NULL) AND ("contactId" IS NULL) AND ("deliveryStatus" IS NULL) AND ("deliveryError" IS NULL) AND ("sentAt" IS NULL) AND ("receivedAt" IS NULL) AND ("bodyHtml" IS NULL) AND ("strippedReplyText" IS NULL) AND ("fromEmail" IS NULL) AND ("fromName" IS NULL) AND ("replyTo" IS NULL) AND (subject IS NULL) AND ("internetMessageId" IS NULL) AND ("inReplyTo" IS NULL) AND ("providerMessageId" IS NULL) AND ("inboundHeaders" IS NULL) AND ("attachmentManifest" IS NULL) AND (COALESCE(cardinality("toEmails"), 0) = 0) AND (COALESCE(cardinality("ccEmails"), 0) = 0) AND (COALESCE(cardinality("references"), 0) = 0))));
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_outbound_check" CHECK (((kind <> 'OUTBOUND'::"SupportTicketMessageKind") OR (("authorStaffId" IS NOT NULL) AND ("deliveryStatus" IS NOT NULL) AND ("clientSubmissionId" IS NOT NULL) AND ("receivedAt" IS NULL) AND ("strippedReplyText" IS NULL) AND ("inboundHeaders" IS NULL))));
CREATE UNIQUE INDEX "AssetMaintainerProposal_one_pending" ON public."AssetMaintainerProposal" USING btree ("assetId") WHERE (status = 'PENDING'::public."AssetMaintainerProposalStatus");
CREATE UNIQUE INDEX "CoverageEpisode_one_open_grain" ON public."CoverageEpisode" USING btree ("facilityId", "serviceDate", "departmentId", "spaceId", responsibility, "cycleStableKey") WHERE ("closedAt" IS NULL);
CREATE INDEX "CoverageEpisode_open_facility_idx" ON public."CoverageEpisode" USING btree ("facilityId", "serviceDate") WHERE ("closedAt" IS NULL);
CREATE UNIQUE INDEX "DepartmentVendorHeadAssignment_one_open" ON public."DepartmentVendorHeadAssignment" USING btree ("departmentId") WHERE (status = ANY (ARRAY['PENDING'::public."DepartmentVendorHeadAssignmentStatus", 'ACCEPTED'::public."DepartmentVendorHeadAssignmentStatus"]));
CREATE UNIQUE INDEX "FacilityAdministratorInvitation_one_pending_uidx" ON public."FacilityAdministratorInvitation" USING btree ("facilityId") WHERE (status = 'PENDING'::public."FacilityAdministratorInvitationStatus");
CREATE UNIQUE INDEX "ImplementationPaymentAttempt_one_unresolved" ON public."ImplementationPaymentAttempt" USING btree ("orderId") WHERE (status <> 'EXPIRED'::text);
CREATE UNIQUE INDEX "PushSubscription_active_endpoint_key" ON public."PushSubscription" USING btree (endpoint) WHERE ("revokedAt" IS NULL);
CREATE UNIQUE INDEX "Repair_pmOccurrenceId_active_key" ON public."Repair" USING btree ("pmOccurrenceId") WHERE (("pmOccurrenceId" IS NOT NULL) AND (status <> ALL (ARRAY['COMPLETED'::public."RepairStatus", 'CANCELLED'::public."RepairStatus"])));
CREATE UNIQUE INDEX "SupportAttachmentScanAttempt_one_running" ON public."SupportAttachmentScanAttempt" USING btree ("attachmentId") WHERE (status = 'RUNNING'::text);
CREATE UNIQUE INDEX "UnitSpace_facilityId_name_undesignated_key" ON public."UnitSpace" USING btree ("facilityId", name) WHERE ("unitId" IS NULL);
CREATE UNIQUE INDEX "UnitSpace_unitId_name_assigned_key" ON public."UnitSpace" USING btree ("unitId", name) WHERE ("unitId" IS NOT NULL);
CREATE UNIQUE INDEX "Unit_facility_parent_name_key" ON public."Unit" USING btree ("facilityId", "parentUnitId", name) WHERE ("parentUnitId" IS NOT NULL);
CREATE UNIQUE INDEX "Unit_facility_root_name_key" ON public."Unit" USING btree ("facilityId", name) WHERE ("parentUnitId" IS NULL);
CREATE UNIQUE INDEX "UserFacilityRolePeriod_access_current_uidx" ON public."UserFacilityRolePeriod" USING btree ("userFacilityAccessId") WHERE ("endsAt" IS NULL);

-- Application sequences.
CREATE SEQUENCE public."AssetCodeSequence"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public."AssetIssueCodeSequence"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public."RepairCodeSequence"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Database-enforced authority and audit rules.
CREATE FUNCTION public.facility_single_administrator() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_facility TEXT;
BEGIN
  IF NEW."roleKey" <> 'FACILITY_ADMINISTRATOR' OR NEW."endsAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT "facilityId" INTO target_facility FROM "UserFacilityAccess" WHERE "id" = NEW."userFacilityAccessId";
  PERFORM 1 FROM "Facility" WHERE "id" = target_facility FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM "UserFacilityRolePeriod" p
    JOIN "UserFacilityAccess" a ON a."id" = p."userFacilityAccessId"
    WHERE a."facilityId" = target_facility
      AND p."roleKey" = 'FACILITY_ADMINISTRATOR'
      AND p."endsAt" IS NULL
      AND p."id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'Facility % already has a Facility Administrator', target_facility
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'UserFacilityRolePeriod_one_facility_administrator';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.implementation_event_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'Implementation evidence is append-only'; END $$;

CREATE FUNCTION public.implementation_order_immutable_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF ROW(NEW."engagementId",NEW."revision",NEW."scope",NEW."digest",NEW."amountCents",NEW."currency",NEW."waivedByStaffId",NEW."waiverReason") IS DISTINCT FROM ROW(OLD."engagementId",OLD."revision",OLD."scope",OLD."digest",OLD."amountCents",OLD."currency",OLD."waivedByStaffId",OLD."waiverReason") THEN RAISE EXCEPTION 'Quoted scope and price are immutable'; END IF;
 IF OLD."approvedAt" IS NOT NULL AND ROW(NEW."approvedAt",NEW."approvedByUserId") IS DISTINCT FROM ROW(OLD."approvedAt",OLD."approvedByUserId") THEN RAISE EXCEPTION 'Customer approval is immutable'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.support_scan_attempt_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF OLD."status" <> 'RUNNING' OR ROW(NEW."attachmentId",NEW."cycle",NEW."attempt",NEW."expectedSha256",NEW."expectedSizeBytes") IS DISTINCT FROM ROW(OLD."attachmentId",OLD."cycle",OLD."attempt",OLD."expectedSha256",OLD."expectedSizeBytes") THEN RAISE EXCEPTION 'Scan binding and completed results are immutable'; END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER "ImplementationEvent_append_only" BEFORE DELETE OR UPDATE ON public."ImplementationEvent" FOR EACH ROW EXECUTE FUNCTION public.implementation_event_append_only();

CREATE TRIGGER "ImplementationOrder_immutable_scope" BEFORE UPDATE ON public."ImplementationOrder" FOR EACH ROW EXECUTE FUNCTION public.implementation_order_immutable_scope();

CREATE TRIGGER "SupportAttachmentScanAttempt_immutable" BEFORE UPDATE ON public."SupportAttachmentScanAttempt" FOR EACH ROW EXECUTE FUNCTION public.support_scan_attempt_immutable();

CREATE TRIGGER "UserFacilityRolePeriod_one_facility_administrator" BEFORE INSERT OR UPDATE OF "roleKey", "endsAt", "userFacilityAccessId" ON public."UserFacilityRolePeriod" FOR EACH ROW EXECUTE FUNCTION public.facility_single_administrator();

-- Platform role catalog.
INSERT INTO "Role" ("id", "key", "name", "createdAt", "updatedAt")
VALUES
  ('cmrole_fa000000000000001', 'FACILITY_ADMINISTRATOR', 'Facility Administrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_gm0000000000000001', 'GM', 'General Manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_mgr000000000000001', 'MANAGER', 'Department Manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_sup000000000000001', 'SUPERVISOR', 'Supervisor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_lead00000000000001', 'LEAD_TEAM_MEMBER', 'Lead Team Member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmrole_staff0000000000001', 'STAFF', 'Team Member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

COMMIT;
