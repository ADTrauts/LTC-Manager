import type { DepartmentOwnerKind } from "./owners";

/**
 * Write manifest (CDA-D12). Every exported server action and write API route, with its class.
 * Department rows name the owner resolver that finds the Department the write changes.
 * Enforce mode as of CDA-04: an unlisted write fails the manifest test.
 */
export type WriteClass =
  | "DEPARTMENT"
  | "GOVERNANCE"
  | "SHARED_FACILITY"
  | "PERSONAL"
  | "AUTH_SYSTEM"
  | "LEGACY";

export type WriteManifestEntry =
  | { class: "DEPARTMENT"; owner: DepartmentOwnerKind }
  | { class: "LEGACY"; owner?: DepartmentOwnerKind }
  | { class: Exclude<WriteClass, "DEPARTMENT" | "LEGACY"> };

/** Source file → export name (server action, or HTTP method for a route) → entry. */
export type WriteManifest = Record<string, Record<string, WriteManifestEntry>>;

export const WRITE_MANIFEST_MODE: "report" | "enforce" = "enforce";

const department = (owner: DepartmentOwnerKind): WriteManifestEntry => ({ class: "DEPARTMENT", owner });
const legacy = (owner?: DepartmentOwnerKind): WriteManifestEntry =>
  owner ? { class: "LEGACY", owner } : { class: "LEGACY" };
const GOVERNANCE: WriteManifestEntry = { class: "GOVERNANCE" };
const SHARED_FACILITY: WriteManifestEntry = { class: "SHARED_FACILITY" };
const PERSONAL: WriteManifestEntry = { class: "PERSONAL" };
const AUTH_SYSTEM: WriteManifestEntry = { class: "AUTH_SYSTEM" };

function each(entry: WriteManifestEntry, names: readonly string[]): Record<string, WriteManifestEntry> {
  return Object.fromEntries(names.map((name) => [name, entry]));
}

const APP = "src/app";
const PROTECTED = `${APP}/(protected)`;
const DEPARTMENT_ADMIN = `${PROTECTED}/admin/departments/[departmentId]`;

export const WRITE_MANIFEST: WriteManifest = {
  [`${APP}/(organization-account)/organization/actions.ts`]: {
    ...each(GOVERNANCE, [
      "inviteOrganizationMemberAction",
      "resendOrganizationMemberInvitationAction",
      "revokeOrganizationMemberInvitationAction",
      "changeOrganizationMemberRoleAction",
      "endOrganizationMemberAction",
    ]),
    switchOrganizationAction: AUTH_SYSTEM,
  },
  [`${APP}/(organization-account)/organization/facility-administrator-actions.ts`]: each(GOVERNANCE, [
    "appointFacilityAdministratorAction",
    "cancelFacilityAdministratorRecoveryAction",
  ]),
  [`${APP}/(organization-account)/organization/vendor-head-actions.ts`]: each(GOVERNANCE, [
    "assignVendorHeadAction",
    "acceptVendorHeadAction",
    "declineVendorHeadAction",
    "moveVendorStaffAction",
  ]),
  [`${APP}/partner/people/actions.ts`]: each(department("workforceRecord"), ["createVendorPinWorkforceAction"]),
  [`${APP}/partner/department/actions.ts`]: each(GOVERNANCE, [
    "createVendorCatalogFormAction",
    "publishVendorCatalogFormAction",
  ]),
  [`${APP}/(organization-account)/organization/client-staffing-actions.ts`]: each(GOVERNANCE, [
    "assignOrganizationClientAction",
    "changeOrganizationClientRoleAction",
    "endOrganizationClientAccessAction",
    "loadOrganizationMemberClientAssignmentsAction",
  ]),

  [`${PROTECTED}/admin/billing/actions.ts`]: each(GOVERNANCE, [
    "startBillingCheckoutAction",
    "addBillingDepartmentsAction",
    "startBillingPortalAction",
  ]),
  [`${PROTECTED}/admin/billing/implementation/actions.ts`]: each(GOVERNANCE, ["implementationCustomerAction"]),
  [`${PROTECTED}/admin/departments/actions.ts`]: {
    createDepartmentAction: GOVERNANCE,
    setDepartmentHeadAction: GOVERNANCE,
    setDepartmentShowInEmployeeAppAction: department("department"),
  },
  [`${PROTECTED}/department/settings/[departmentId]/actions.ts`]: {
    setDepartmentStaffManagerAction: department("department"),
  },
  [`${DEPARTMENT_ADMIN}/operator-actions.ts`]: each(GOVERNANCE, [
    "assignDepartmentOperatorAction",
    "createOrganizationAndAssignOperatorAction",
    "cancelFutureDepartmentOperatorAction",
    "searchOperatorOrganizationsAction",
  ]),
  [`${PROTECTED}/admin/facility/builder/actions.ts`]: each(GOVERNANCE, [
    "createBuilderUnitAction",
    "createBuilderBuildingAction",
    "createBuilderFloorAction",
    "createBuilderNeighborhoodAction",
    "updateBuilderUnitAction",
    "deleteBuilderUnitAction",
    "createBuilderSpaceAction",
    "createBuilderSpacesBulkAction",
    "updateBuilderSpaceAction",
    "deleteBuilderSpaceAction",
    "upsertBuilderUnitResponsibilityAction",
    "deleteBuilderUnitResponsibilityAction",
    "upsertBuilderSpaceResponsibilityAction",
    "deleteBuilderSpaceResponsibilityAction",
    "setBuilderUnitDepartmentsAction",
    "setBuilderSpaceDepartmentsAction",
    "applyBuilderUnitResponsibilitiesToDescendantsAction",
    "applyDepartmentsToActionableDescendantsAction",
    "moveBuilderUnitAction",
    "moveBuilderSpaceAction",
    "reorderBuilderUnitsAction",
    "reorderBuilderSpacesAction",
    "convertBuilderLegacyToFloorAction",
    "renameBuilderUnitAction",
    "renameBuilderSpaceAction",
    "toggleBuilderUnitActiveAction",
    "updateFacilityVocabularyAction",
    "createFacilityRoomTypeAction",
    "updateFacilityRoomTypeAction",
    "archiveFacilityRoomTypeAction",
  ]),
  [`${PROTECTED}/admin/facility/builder/import-actions.ts`]: each(GOVERNANCE, [
    "getFacilityStructureTemplateAction",
    "previewFacilityStructureImportAction",
    "confirmFacilityStructureImportAction",
  ]),
  [`${PROTECTED}/units/actions.ts`]: each(GOVERNANCE, [
    "createUnitAction",
    "updateUnitAction",
    "toggleUnitActiveAction",
    "reorderUnitAction",
    "reorderUnitListAction",
    "upsertUnitDepartmentResponsibilityAction",
    "deleteUnitDepartmentResponsibilityAction",
  ]),
  [`${PROTECTED}/admin/organization/actions.ts`]: each(GOVERNANCE, [
    "updateFacilitySettingsAction",
    "updateOrganizationSettingsAction",
    "uploadUnionHandbookAction",
    "clearUnionHandbookAction",
  ]),
  [`${PROTECTED}/admin/organization/facility-administrator/actions.ts`]: each(GOVERNANCE, [
    "inviteFacilityAdministratorSuccessorAction",
    "cancelFacilityAdministratorTransferAction",
  ]),
  [`${PROTECTED}/admin/organization/facilities/actions.ts`]: each(GOVERNANCE, [
    "grantFacilityAccessAction",
    "revokeFacilityAccessAction",
    "setUserActiveFacilityAction",
  ]),
  [`${PROTECTED}/admin/organization/partners/actions.ts`]: each(GOVERNANCE, [
    "createFacilityPartnerAction",
    "createOrganizationAndPartnerAction",
    "searchPartnerOrganizationsAction",
    "activateFacilityPartnerAction",
    "suspendFacilityPartnerAction",
    "resumeFacilityPartnerAction",
    "endFacilityPartnerAction",
    "addPartnerDepartmentScopeAction",
    "removePartnerDepartmentScopeAction",
  ]),
  [`${PROTECTED}/admin/organization/partners/claim-actions.ts`]: each(GOVERNANCE, [
    "requestOrganizationClaimAction",
  ]),
  [`${PROTECTED}/admin/organization/partners/user-access-actions.ts`]: each(GOVERNANCE, [
    "setPartnerRoleCeilingAction",
    "assignPartnerUserAction",
    "changePartnerUserRoleAction",
    "endPartnerUserAssignmentAction",
    "setPartnerStaffingDelegationAction",
    "blockPartnerUserAction",
    "unblockPartnerUserAction",
  ]),

  [`${DEPARTMENT_ADMIN}/actions.ts`]: {
    ...each(legacy("locationFunctionProfile"), [
      "createBaselineDraftAction",
      "createNextDraftAction",
      "certifyProfileAction",
      "activateProfileAction",
      "retireProfileAction",
      "setExperienceActiveAction",
      "moveExperienceAction",
      "reorderExperiencesAction",
      "createArchetypeAction",
      "updateArchetypeAction",
      "setArchetypeExperiencesAction",
      "upsertRoomExceptionAction",
      "removeRoomExceptionAction",
      "setRoomTypeExperiencesAction",
    ]),
    bindRoomAction: department("roomArchetype"),
    clearRoomBindingAction: department("roomBinding"),
    ...each(department("department"), [
      "createOperationalTypeAction",
      "bindLocationFunctionAction",
      "publishLocationFunctionsAction",
      "ensurePatternDraftAction",
      "bindRoomsToOperationalTypeAction",
      "clearRoomOperationalTypeAction",
      "renameOperationalTypeAction",
      "updateRoomTypeDepartmentUseAction",
      "ensureLocationOperationalTypesAction",
      "assignLocationOperationalTypeAction",
      "clearLocationOperationalTypeAction",
      "createLocationOperationalTypeAction",
    ]),
  },
  [`${DEPARTMENT_ADMIN}/coverage-actions.ts`]: {
    createCoverageExpectationAction: department("department"),
    ...each(department("assignmentTemplate"), [
      "updateCoverageExpectationAction",
      "upsertCoverageExpectationItemAction",
      "removeCoverageExpectationItemAction",
      "publishCoverageExpectationAction",
    ]),
  },
  [`${DEPARTMENT_ADMIN}/cycle-actions.ts`]: {
    ...each(department("department"), [
      "createCycleDraftAction",
      "reorderCycleDraftsAction",
      "scheduleCycleChangesAction",
      "discardAllCycleDraftsAction",
      "applyProductCycleStarterAction",
      "makeOperatingRhythmLiveAction",
      "generateDietaryDefaultsAction",
      "generateEvsDefaultsAction",
      "prepareDietaryMealTimingUpgradeAction",
    ]),
    ...each(department("operationalCycle"), [
      "updateCycleDraftAction",
      "duplicateCycleAction",
      "moveCycleTreeAction",
      "publishCycleAction",
      "deleteCycleDraftAction",
      "retireCycleAction",
    ]),
  },
  [`${DEPARTMENT_ADMIN}/location-room-actions.ts`]: {
    removeRoomLogAction: department("logAttachment"),
    addFacilityTypeLogDefaultAction: department("department"),
    removeFacilityTypeLogDefaultAction: department("logTypeDefault"),
    suppressFacilityTypeLogDefaultAction: department("logTypeDefault"),
    restoreFacilityTypeLogDefaultAction: department("logSuppression"),
  },
  [`${DEPARTMENT_ADMIN}/plant-starter-actions.ts`]: each(department("department"), [
    "loadPlantStarterAction",
    "installPlantStarterAction",
  ]),
  [`${DEPARTMENT_ADMIN}/record-engine-actions.ts`]: each(legacy("department"), ["scheduleRecordEngineAction"]),
  [`${DEPARTMENT_ADMIN}/team-actions.ts`]: {
    createDepartmentTeamAction: department("department"),
    ...each(department("departmentTeam"), [
      "updateDepartmentTeamAction",
      "addRemainingRoomsOfTypeToTeamAction",
      "archiveDepartmentTeamAction",
    ]),
  },
  [`${DEPARTMENT_ADMIN}/team-cycle-actions.ts`]: {
    ...each(department("departmentTeam"), ["createTeamCycleAction", "linkTeamCycleAction"]),
    ...each(department("departmentTeamCycle"), ["unlinkTeamCycleAction", "updateTeamCycleNeedAction"]),
  },
  [`${PROTECTED}/admin/knowledge/actions.ts`]: each(department("knowledgeArticle"), [
    "upsertKnowledgeArticleAction",
    "publishKnowledgeArticleAction",
    "archiveKnowledgeArticleAction",
    "restoreKnowledgeArticleAction",
  ]),

  [`${PROTECTED}/employees/actions.ts`]: {
    createEmployeeAction: department("department"),
    ...each(department("workforceRecord"), [
      "previewEmployeeAccountAction",
      "resendEmployeeActivationAction",
      "updateEmployeeProfileAction",
      "setEmployeePinAction",
      "clearEmployeePinAction",
      "updateEmployeeStatusAction",
      "recordEmployeeSeparationAction",
      "setDefaultAssignmentAction",
      "addDisciplinePointEntryAction",
      "deleteDisciplinePointEntryAction",
    ]),
    revokeEmployeeSessionsAction: GOVERNANCE,
  },
  // Bulk employee setup: each row names its Departments.
  [`${PROTECTED}/employees/bulk-setup/actions.ts`]: each(department("department"), [
    "previewSetupImportAction",
    "confirmSetupImportAction",
    "reconcileSetupImportAction",
    "sendSetupActivationAction",
    "sendPendingSetupActivationsAction",
  ]),
  [`${PROTECTED}/employees/bulk-setup/workbook-actions.ts`]: each(department("department"), [
    "downloadOnboardingWorkbook",
    "previewOnboardingWorkbook",
    "confirmOnboardingWorkbook",
    "reconcileOnboardingWorkbook",
  ]),
  [`${PROTECTED}/employees/csv-import-actions.ts`]: each(department("department"), [
    "previewEmployeeCsvAction",
    "confirmEmployeeCsvAction",
  ]),
  [`${PROTECTED}/employees/job-roles/actions.ts`]: {
    createJobRoleAction: department("department"),
    ...each(department("jobRole"), ["updateJobRoleAction", "archiveJobRoleAction"]),
  },
  [`${PROTECTED}/staffing/schedule/actions.ts`]: {
    createCanonicalShiftAction: department("department"),
    ...each(department("scheduleEntry"), [
      "editCanonicalShiftAction",
      "deleteCanonicalShiftAction",
      "copyCanonicalShiftAction",
    ]),
  },
  [`${PROTECTED}/staffing/assignments/actions.ts`]: {
    createAssignmentAction: department("department"),
    ...each(department("operationalAssignment"), [
      "editAssignmentAction",
      "assignmentLifecycleAction",
      "reassignAction",
    ]),
    ...each(department("assignmentPlan"), ["confirmAssignmentPlanAction", "reopenAssignmentPlanAction"]),
  },
  [`${PROTECTED}/staffing/assignments/template-actions.ts`]: {
    createTemplateAction: department("department"),
    ...each(department("assignmentTemplate"), [
      "editTemplateAction",
      "addTemplateItemAction",
      "removeTemplateItemAction",
      "moveTemplateItemAction",
      "applyTemplateAction",
    ]),
  },
  [`${PROTECTED}/staffing/assignments/zone-actions.ts`]: {
    createDepartmentZoneAction: department("department"),
    ...each(department("departmentZone"), ["updateDepartmentZoneAction", "retireDepartmentZoneAction"]),
  },

  [`${PROTECTED}/staffing/cycles/actions.ts`]: {
    delayMealExpectationAction: department("cycleDayExpectation"),
    ...each(department("keyTimeDayExpectation"), [
      "delayKeyTimeExpectationAction",
      "completeKeyTimeExpectationAction",
    ]),
  },
  [`${PROTECTED}/staffing/work-plans/actions.ts`]: {
    ...each(department("department"), ["createWorkPlanDraftAction", "createWorkPlanPresetDraftAction"]),
    ...each(department("workPlan"), [
      "updateWorkPlanDraftAction",
      "publishWorkPlanAction",
      "retireWorkPlanAction",
      "duplicateWorkPlanAction",
      "createWorkPlanSuccessorAction",
    ]),
  },
  [`${PROTECTED}/staffing/work-plans/work-runtime-actions.ts`]: {
    createOneOffWorkAction: department("department"),
    ...each(department("workOccurrence"), [
      "completeWorkRequirementAction",
      "markWorkNotRequiredAction",
      "reopenWorkOccurrenceAction",
      "cancelOneOffWorkAction",
    ]),
  },
  [`${PROTECTED}/staffing/operations/work-actions.ts`]: {
    createOneOffWorkAction: department("department"),
    ...each(department("workOccurrence"), [
      "completeWorkAction",
      "markWorkNotRequiredAction",
      "reopenWorkAction",
      "reassignWorkAction",
      "cancelOneOffWorkAction",
    ]),
  },
  [`${PROTECTED}/menus/actions.ts`]: {
    createMenuAction: department("department"),
    ...each(department("menu"), [
      "updateMenuAction",
      "saveMenuOverviewAction",
      "saveMenuSettingsAction",
      "saveMenuCategoryItemsAction",
      "saveMenuApplicabilityAction",
    ]),
  },
  [`${PROTECTED}/unit/[unitId]/actions.ts`]: {
    ...each(department("serveryMilestone"), ["recordServeryServiceTimeAction", "correctServeryServiceTimeAction"]),
    ...each(legacy("inspectionDefinition"), ["submitUnitInspectionAction", "updateInspectionFollowUpTaskAction"]),
    createUnitIssueAction: department("department"),
  },

  // Catalog installs are facility-wide today; the Foundation amendment adds Marketplace items inside a Department.
  [`${PROTECTED}/build/logs/actions.ts`]: {
    installCatalogAction: SHARED_FACILITY,
    createCanonicalLogAttachmentAction: department("department"),
    ...each(department("logAttachment"), [
      "updateCanonicalLogAttachmentAction",
      "adoptCanonicalLogAttachmentAction",
      "setCanonicalLogAttachmentStatusAction",
      "assignCanonicalLogToTargetsAction",
    ]),
  },
  [`${PROTECTED}/staffing/logs/actions.ts`]: each(department("logAttachment"), ["submitCanonicalRunLogAction"]),
  [`${PROTECTED}/reports/waiver-action.ts`]: each(department("department"), ["createRecordWaiverAction"]),
  [`${APP}/partner/logs/actions.ts`]: {
    submitPartnerCanonicalLogAction: department("logAttachment"),
    correctPartnerCanonicalLogAction: department("evidenceRecord"),
  },

  // Repair companies and maintainer organizations gain an owning maintainer in CDA-05 (CDA-D18).
  [`${PROTECTED}/assets/actions.ts`]: {
    createVendorAction: SHARED_FACILITY,
    createAssetAction: department("department"),
    ...each(department("asset"), [
      "updateAssetStatusAction",
      "updateAssetIdentityAction",
      "retireAssetAction",
      "updateAssetCriticalityAction",
      "updateAssetDepartmentAction",
      "uploadAssetPhotosAction",
      "removeAssetPhotoAction",
      "acceptMaintainerProposalAction",
    ]),
    createFacilityOrganizationAction: SHARED_FACILITY,
  },
  // Asset import: each row names its using Department.
  [`${PROTECTED}/assets/import-actions.ts`]: each(department("department"), [
    "getAssetImportTemplateAction",
    "previewAssetImportAction",
    "confirmAssetImportAction",
  ]),
  [`${PROTECTED}/asset-issues/actions.ts`]: {
    ...each(department("department"), ["reportAssetIssueAction", "reportDirectIssueAction"]),
    createIssueFromRecordAction: department("evidenceRecord"),
    ...each(department("assetIssue"), [
      "acknowledgeAssetIssueAction",
      "triageAssetIssueAction",
      "markAssetIssueMonitoringAction",
      "resolveAssetIssueAction",
      "closeAssetIssueAction",
      "reopenAssetIssueAction",
      "linkEvidenceToAssetIssueAction",
      "createWorkOrderFromAssetIssueAction",
    ]),
    updateWorkOrderStatusAction: department("repair"),
  },
  [`${PROTECTED}/operational-requests/actions.ts`]: {
    ...each(department("department"), [
      "createOperationalRequestAction",
      "listRequestRoutesAction",
      "upsertRequestRouteAction",
      "searchOpenIssuesForTriageAction",
    ]),
    ...each(department("operationalRequest"), [
      "acknowledgeOperationalRequestAction",
      "triageOperationalRequestAction",
      "acceptRequestCreateIssueAction",
      "acceptRequestCreateIssueAndWorkOrderAction",
      "linkRequestToExistingIssueAction",
      "declineOperationalRequestAction",
      "resolveRequestWithoutWorkAction",
      "createWorkOrderFromRequestAction",
      "loadRequesterStatusAction",
    ]),
    ...each(department("repair"), ["technicianWorkOrderAction", "returnAssetToServiceFromPlantAction"]),
  },
  [`${PROTECTED}/repairs/actions.ts`]: {
    createRepairAction: department("department"),
    ...each(department("repair"), [
      "startWorkOrderAction",
      "holdWorkOrderAction",
      "resumeWorkOrderAction",
      "completeWorkOrderAction",
      "addWorkOrderLaborAction",
      "addWorkOrderPartAction",
      "removeWorkOrderPartAction",
      "removeWorkOrderLaborAction",
      "setWorkOrderExternalCostAction",
      "addWorkOrderRecordRequirementAction",
      "removeWorkOrderRecordRequirementAction",
      "satisfyWorkOrderRecordRequirementAction",
      "waiveWorkOrderRecordRequirementAction",
      "addWorkOrderNoteAction",
      "assignWorkOrderAction",
      "linkEvidenceToWorkOrderAction",
      "addRepairUpdateAction",
      "addRepairPhotosAction",
      "removeRepairPhotoAction",
    ]),
  },
  [`${PROTECTED}/build/departments/[departmentId]/preventive-maintenance/actions.ts`]: {
    ...each(department("department"), ["createPmPlanAction", "createPmPlanAndPublishAction"]),
    ...each(department("pmPlan"), [
      "savePmPlanDraftAction",
      "publishPmPlanAction",
      "createSuccessorDraftAction",
      "retirePmPlanAction",
    ]),
  },
  [`${PROTECTED}/preventive-maintenance/actions.ts`]: each(department("pmOccurrence"), ["skipPmOccurrenceAction"]),

  [`${PROTECTED}/logs/actions.ts`]: each(legacy("legacyLogTemplate"), [
    "createLogTemplateAction",
    "addTemplateFieldAction",
    "createLogAssignmentAction",
    "toggleLogAssignmentAction",
    "submitLogAction",
  ]),
  [`${PROTECTED}/admin/inspections/actions.ts`]: each(legacy("inspectionDefinition"), [
    "upsertInspectionDefinitionAction",
    "setInspectionDefinitionActiveAction",
  ]),
  [`${PROTECTED}/issues/actions.ts`]: each(legacy("repair"), [
    "assignIssueAction",
    "addIssueUpdateAction",
    "startIssueWorkAction",
    "markIssueWaitingAction",
    "closeIssueAction",
    "reopenIssueAction",
  ]),
  [`${PROTECTED}/issues/recovery-actions.ts`]: each(legacy(), [
    "refreshRecoveryAssistantAction",
    "ensureRecoveryAssistantAction",
  ]),
  [`${PROTECTED}/staffing/actions.ts`]: {
    deleteScheduleEntryAction: legacy("scheduleEntry"),
    createScheduleEntryAction: legacy("workforceRecord"),
    createOverrideAction: legacy("workforceRecord"),
  },
  [`${PROTECTED}/staffing/templates/actions.ts`]: {
    ...each(legacy("department"), ["createEvidenceTemplateDraftAction", "createEvidencePresetDraftAction"]),
    ...each(legacy("evidenceTemplate"), [
      "updateEvidenceTemplateDraftAction",
      "publishEvidenceTemplateAction",
      "retireEvidenceTemplateAction",
      "createEvidenceSuccessorDraftAction",
    ]),
  },
  [`${PROTECTED}/unit/[unitId]/evidence-actions.ts`]: each(legacy("evidenceRecord"), ["submitUnitEvidenceAction"]),
  [`${PROTECTED}/today/handoffs/actions.ts`]: each(legacy(), [
    "refreshShiftTransitionAction",
    "ensureShiftTransitionAction",
  ]),

  [`${PROTECTED}/dashboard/actions.ts`]: each(SHARED_FACILITY, [
    "refreshMorningBriefAction",
    "ensureMorningBriefAction",
  ]),
  [`${PROTECTED}/dashboard/settle-action.ts`]: { recordDashboardSettle: AUTH_SYSTEM },
  [`${PROTECTED}/workspace/actions.ts`]: each(PERSONAL, [
    "updateWorkspaceHiddenSectionsAction",
    "toggleWorkspaceSectionCollapsedAction",
    "setWorkspacePreferredLandingAction",
    "setWorkspaceSectionOrderAction",
  ]),
  [`${APP}/account/actions.ts`]: each(PERSONAL, ["updateOwnDisplayNameAction"]),
  [`${APP}/account/facility-administrator/actions.ts`]: each(GOVERNANCE, [
    "acceptFacilityAdministratorInvitationAction",
    "declineFacilityAdministratorInvitationAction",
  ]),
  [`${APP}/account/security/actions.ts`]: each(PERSONAL, ["changeOwnPasswordAction", "signOutEverywhereAction"]),

  // Offline sync replays commands through the same domain modules (CDA ARCHITECTURE §5).
  [`${PROTECTED}/unit/[unitId]/offline-actions.ts`]: each(AUTH_SYSTEM, ["resolveOfflineConflictAction"]),
  [`${APP}/access/actions.ts`]: each(AUTH_SYSTEM, ["enterAccountContextAction", "enterContextAction"]),
  [`${APP}/partner/actions.ts`]: each(AUTH_SYSTEM, [
    "enterPartnerFacilityAction",
    "leavePartnerFacilityAction",
    "switchPartnerDepartmentAction",
  ]),

  // Harbor console: Vssyl staff, outside Department authority (R9).
  [`${APP}/console/(staff)/catalog/actions.ts`]: each(AUTH_SYSTEM, [
    "createHarborCatalogAction",
    "saveHarborCatalogDraftAction",
    "saveAndPublishHarborCatalogAction",
    "publishHarborCatalogAction",
    "retireHarborCatalogAction",
    "successorHarborCatalogAction",
    "deleteHarborCatalogDraftAction",
    "retireHarborCatalogForm",
    "successorHarborCatalogForm",
    "deleteHarborCatalogDraftForm",
  ]),
  [`${APP}/console/(staff)/customers/[facilityId]/implementation/actions.ts`]: each(AUTH_SYSTEM, [
    "implementationStaffAction",
  ]),
  [`${APP}/console/(staff)/customers/actions.ts`]: each(AUTH_SYSTEM, ["syncCustomerBillingFromStripeAction"]),
  [`${APP}/console/(staff)/customers/provision-actions.ts`]: each(AUTH_SYSTEM, [
    "previewHarborProvisionAdministratorAction",
    "provisionFacilityAction",
    "resendHarborProvisionInviteAction",
  ]),
  [`${APP}/console/(staff)/organization-claims/actions.ts`]: each(AUTH_SYSTEM, [
    "approveOrganizationClaimAction",
    "resendOrganizationClaimAction",
    "rejectOrganizationClaimAction",
    "revokeOrganizationClaimAction",
    "createHarborClaimRequestAction",
  ]),
  [`${APP}/console/(staff)/tickets/actions.ts`]: each(AUTH_SYSTEM, [
    "createSupportTicketAction",
    "addSupportTicketNoteAction",
    "replySupportTicketAction",
    "changeSupportTicketStatusAction",
    "updateSupportTicketDetailsAction",
    "assignSupportTicketToMeAction",
    "addSupportTicketTagAction",
    "removeSupportTicketTagAction",
    "createSupportSavedReplyAction",
    "updateSupportSavedReplyAction",
    "setSupportSavedReplyActiveAction",
    "createSupportTagAction",
    "renameSupportTagAction",
    "setSupportTagActiveAction",
    "createSupportMacroAction",
    "updateSupportMacroAction",
    "setSupportMacroActiveAction",
    "applySupportMacroAction",
    "createSupportAutomationRuleAction",
    "updateSupportAutomationRuleAction",
    "setSupportAutomationRuleActiveAction",
    "markSupportNotificationReadAction",
    "markAllSupportNotificationsReadAction",
  ]),

  [`${APP}/access/enter/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/account-invite/confirm/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/active-department/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/active-unit/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/bind-device/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/email-verification/confirm/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/email-verification/resend/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/employee-link/accept/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/login/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/logout-full/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/logout/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/organization-claim/accept/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/organization-member-invitation/accept/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/password-reset/confirm/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/password-reset/request/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/pin-login/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/signup/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/auth/switch-facility/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/billing/payment-method/default/route.ts`]: { POST: GOVERNANCE },
  [`${APP}/api/billing/setup-intent/route.ts`]: { POST: GOVERNANCE },
  [`${APP}/api/billing/webhook/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/console/auth/login/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/console/auth/logout/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/console/work-session/end/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/console/work-session/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/debug/projection-shadow/route.ts`]: { POST: legacy() },
  [`${APP}/api/offline/runtime-bundle/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/offline/runtime-sync/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/onboarding/locations/route.ts`]: { POST: GOVERNANCE },
  [`${APP}/api/onboarding/managers/route.ts`]: { POST: GOVERNANCE },
  [`${APP}/api/onboarding/state/route.ts`]: { PATCH: GOVERNANCE, POST: GOVERNANCE },
  [`${APP}/api/support/email-events/route.ts`]: { POST: AUTH_SYSTEM },
  [`${APP}/api/support/inbound-email/route.ts`]: { POST: AUTH_SYSTEM },
};
