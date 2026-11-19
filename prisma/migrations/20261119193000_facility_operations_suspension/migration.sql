-- Manual Facility operations pause. Forward-only; no existing Facility is suspended.
ALTER TABLE "Facility"
  ADD COLUMN "operationsSuspendedAt" TIMESTAMP(3),
  ADD COLUMN "operationsSuspensionRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Facility_operationsSuspensionRevision_check" CHECK ("operationsSuspensionRevision" >= 0);
ALTER TYPE "HarborAuditAction" ADD VALUE 'FACILITY_SUSPEND';
ALTER TYPE "HarborAuditAction" ADD VALUE 'FACILITY_REACTIVATE';
CREATE TABLE "HarborFacilitySuspensionAuditDetail" (
  "eventId" TEXT PRIMARY KEY REFERENCES "HarborAuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "facilityId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "requestKey" UUID NOT NULL UNIQUE,
  "fingerprint" TEXT NOT NULL,
  "reason" VARCHAR(1000) NOT NULL CHECK (length(btrim("reason")) BETWEEN 1 AND 1000),
  "previousSuspendedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  UNIQUE ("facilityId", "revision"),
  CHECK (("previousSuspendedAt" IS NULL) <> ("suspendedAt" IS NULL))
);

-- Fixed canonical ownership paths, not actor/User home-Facility links. Parent locks
-- keep ownership stable through the write, including old/new parents on moves.
CREATE FUNCTION facility_operations_scope(table_name TEXT, document JSONB)
RETURNS TEXT[] LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE paths JSONB; edge JSONB; parent_row JSONB; ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF document IS NULL THEN RETURN ids; END IF;
  CASE table_name
    WHEN 'AiOperationalBrief' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'Asset' THEN paths := '[["unitId","Unit","id"],["spaceId","UnitSpace","id"],["departmentId","Department","id"]]'::jsonb;
    WHEN 'AssetIssue' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'AssetIssueEvidenceLink' THEN paths := '[["issueId","AssetIssue","id"]]'::jsonb;
    WHEN 'AssetIssueUpdate' THEN paths := '[["issueId","AssetIssue","id"]]'::jsonb;
    WHEN 'AssetMaintainerProposal' THEN paths := '[["assetId","Asset","id"]]'::jsonb;
    WHEN 'AssetPresenceNote' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'AssetStatusHistory' THEN paths := '[["assetId","Asset","id"]]'::jsonb;
    WHEN 'Attachment' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'CatalogLogDefinition' THEN paths := '[["ownerFacilityId","Facility","id"]]'::jsonb;
    WHEN 'CatalogLogField' THEN paths := '[["definitionId","CatalogLogDefinition","id"]]'::jsonb;
    WHEN 'CoverageEpisode' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'CoverageEpisodeTransition' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'Department' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'DepartmentOperationalCycle' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'DepartmentOperationalCycleEvent' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'DepartmentOperationalCycleKeyTimeGroup' THEN paths := '[["cycleId","DepartmentOperationalCycle","id"]]'::jsonb;
    WHEN 'DepartmentOperationalCycleKeyTimeGroupRoom' THEN paths := '[["keyTimeGroupId","DepartmentOperationalCycleKeyTimeGroup","id"]]'::jsonb;
    WHEN 'DepartmentOperationalCycleLocation' THEN paths := '[["cycleId","DepartmentOperationalCycle","id"]]'::jsonb;
    WHEN 'DepartmentOperationalCycleMilestoneTime' THEN paths := '[["cycleId","DepartmentOperationalCycle","id"]]'::jsonb;
    WHEN 'DepartmentOperationalZone' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'DepartmentOperationalZoneLocation' THEN paths := '[["zoneId","DepartmentOperationalZone","id"]]'::jsonb;
    WHEN 'DepartmentOperatorRelationship' THEN paths := '[["departmentId","Department","id"]]'::jsonb;
    WHEN 'DepartmentRequestRoute' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'DepartmentStaffManager' THEN paths := '[["employeeId","Employee","id"]]'::jsonb;
    WHEN 'DepartmentTeam' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'DepartmentTeamRoomMembership' THEN paths := '[["teamId","DepartmentTeam","id"]]'::jsonb;
    WHEN 'DepartmentVendorHeadAssignment' THEN paths := '[["departmentId","Department","id"]]'::jsonb;
    WHEN 'DisciplinePointEntry' THEN paths := '[["employeeId","Employee","id"]]'::jsonb;
    WHEN 'Employee' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'EmployeeDepartment' THEN paths := '[["employeeId","Employee","id"]]'::jsonb;
    WHEN 'EmployeeOperationalRoleQualification' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'EmployeeTeamMembership' THEN paths := '[["teamId","DepartmentTeam","id"]]'::jsonb;
    WHEN 'EmployeeUnitAccess' THEN paths := '[["employeeId","Employee","id"]]'::jsonb;
    WHEN 'EmployeeWorkStation' THEN paths := '[["employeeId","Employee","id"]]'::jsonb;
    WHEN 'FacilityCatalogInstall' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'FacilityOrganization' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'FacilityRoomType' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'JobTitle' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'KnowledgeArticle' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'KnowledgeArticleAsset' THEN paths := '[["articleId","KnowledgeArticle","id"]]'::jsonb;
    WHEN 'KnowledgeArticleCatalogDefinition' THEN paths := '[["articleId","KnowledgeArticle","id"]]'::jsonb;
    WHEN 'KnowledgeArticleUnit' THEN paths := '[["articleId","KnowledgeArticle","id"]]'::jsonb;
    WHEN 'KnowledgeArticleVersion' THEN paths := '[["articleId","KnowledgeArticle","id"]]'::jsonb;
    WHEN 'LogAttachment' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'LogAttachmentCycleSelection' THEN paths := '[["attachmentId","LogAttachment","id"]]'::jsonb;
    WHEN 'LogAttachmentDailyWindow' THEN paths := '[["attachmentId","LogAttachment","id"]]'::jsonb;
    WHEN 'MaintenanceCategory' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'Menu' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'MenuCycleSettings' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'MenuItem' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'MenuLocationApplicability' THEN paths := '[["menuId","Menu","id"]]'::jsonb;
    WHEN 'MenuOperationalCycleApplicability' THEN paths := '[["menuId","Menu","id"]]'::jsonb;
    WHEN 'OperationalAssignment' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalAssignmentEvent' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalAssignmentLocation' THEN paths := '[["assignmentId","OperationalAssignment","id"]]'::jsonb;
    WHEN 'OperationalAssignmentPlan' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalAssignmentTemplate' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalAssignmentTemplateItem' THEN paths := '[["templateId","OperationalAssignmentTemplate","id"]]'::jsonb;
    WHEN 'OperationalCycleDayExpectation' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalCycleKeyPointActual' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalCycleKeyTimeDayExpectation' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalCycleTimingAdjustment' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalEvidenceAttachment' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalEvidenceCorrection' THEN paths := '[["recordId","OperationalEvidenceRecord","id"]]'::jsonb;
    WHEN 'OperationalEvidenceFieldValue' THEN paths := '[["recordId","OperationalEvidenceRecord","id"]]'::jsonb;
    WHEN 'OperationalEvidenceRecord' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalRecordWaiver' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalRequest' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'OperationalRequestEvidenceLink' THEN paths := '[["requestId","OperationalRequest","id"]]'::jsonb;
    WHEN 'OperationalRequestUpdate' THEN paths := '[["requestId","OperationalRequest","id"]]'::jsonb;
    WHEN 'PlaceNameChange' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'PreventiveMaintenanceOccurrence' THEN paths := '[["planVersionId","PreventiveMaintenancePlanVersion","id"]]'::jsonb;
    WHEN 'PreventiveMaintenancePlan' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'PreventiveMaintenancePlanRecordRequirement' THEN paths := '[["planVersionId","PreventiveMaintenancePlanVersion","id"]]'::jsonb;
    WHEN 'PreventiveMaintenancePlanVersion' THEN paths := '[["planId","PreventiveMaintenancePlan","id"]]'::jsonb;
    WHEN 'Repair' THEN paths := '[["assetId","Asset","id"],["unitId","Unit","id"],["spaceId","UnitSpace","id"],["requestingDepartmentId","Department","id"],["responsibleDepartmentId","Department","id"]]'::jsonb;
    WHEN 'RepairEvidenceLink' THEN paths := '[["repairId","Repair","id"]]'::jsonb;
    WHEN 'RepairLaborEntry' THEN paths := '[["repairId","Repair","id"]]'::jsonb;
    WHEN 'RepairPartUsed' THEN paths := '[["repairId","Repair","id"]]'::jsonb;
    WHEN 'RepairRecordRequirement' THEN paths := '[["repairId","Repair","id"]]'::jsonb;
    WHEN 'RepairUpdate' THEN paths := '[["repairId","Repair","id"]]'::jsonb;
    WHEN 'RoomAreaStatus' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'ScheduleEntry' THEN paths := '[["employeeId","Employee","id"]]'::jsonb;
    WHEN 'SetupImportBatch' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'SetupImportResult' THEN paths := '[["batchId","SetupImportBatch","id"]]'::jsonb;
    WHEN 'Unit' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'UnitDepartmentResponsibility' THEN paths := '[["departmentId","Department","id"]]'::jsonb;
    WHEN 'UnitSpace' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'UnitSpaceResponsibility' THEN paths := '[["departmentId","Department","id"]]'::jsonb;
    WHEN 'Vendor' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    WHEN 'WorkOrderResponseHistory' THEN paths := '[["repairId","Repair","id"]]'::jsonb;
    WHEN 'WorkShift' THEN paths := '[["facilityId","Facility","id"]]'::jsonb;
    ELSE RAISE EXCEPTION 'Unclassified Facility operations table' USING ERRCODE = '23514';
  END CASE;
  FOR edge IN SELECT value FROM jsonb_array_elements(paths) LOOP
    IF document ->> (edge ->> 0) IS NULL THEN CONTINUE; END IF;
    IF edge ->> 1 = 'Facility' THEN
      ids := array_append(ids, document ->> (edge ->> 0));
    ELSE
      EXECUTE format('SELECT to_jsonb(parent) FROM public.%I parent WHERE parent.%I = $1 FOR SHARE', edge ->> 1, edge ->> 2)
        INTO parent_row USING document ->> (edge ->> 0);
      IF parent_row IS NOT NULL THEN
        ids := ids || public.facility_operations_scope(edge ->> 1, parent_row);
      END IF;
    END IF;
  END LOOP;
  RETURN ids;
END;
$$;

CREATE FUNCTION enforce_facility_operations_pause()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE old_row JSONB; new_row JSONB; ids TEXT[]; facility_row RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' AND old_row - ARRAY['updatedAt'] = new_row - ARRAY['updatedAt'] THEN
    RETURN NEW;
  END IF;
  -- Authentication bookkeeping is independent of the operational pause.
  IF TG_TABLE_NAME = 'Employee' AND TG_OP = 'UPDATE' AND
      old_row - ARRAY['updatedAt','sessionVersion','pinDigest','roleType','status','terminationDate'] =
      new_row - ARRAY['updatedAt','sessionVersion','pinDigest','roleType','status','terminationDate'] THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'Facility' THEN
    -- Billing, context locking, onboarding journey metadata and pause transitions
    -- remain available. The separate transition trigger requires atomic Owner audit.
    IF TG_OP = 'UPDATE' AND
       old_row - ARRAY['updatedAt','billingEmail','stripeCustomerId','stripeDefaultPaymentMethodId',
         'onboardingCurrentStep','onboardingStartedAt','onboardingCompletedAt','onboardingEntryConfirmedAt',
         'operationsSuspendedAt','operationsSuspensionRevision'] =
       new_row - ARRAY['updatedAt','billingEmail','stripeCustomerId','stripeDefaultPaymentMethodId',
         'onboardingCurrentStep','onboardingStartedAt','onboardingCompletedAt','onboardingEntryConfirmedAt',
         'operationsSuspendedAt','operationsSuspensionRevision'] THEN RETURN NEW; END IF;
    ids := ARRAY[COALESCE(old_row ->> 'id', new_row ->> 'id')];
  ELSE
    ids := public.facility_operations_scope(TG_TABLE_NAME, old_row) || public.facility_operations_scope(TG_TABLE_NAME, new_row);
  END IF;
  -- Shared row locks survive to commit. A completed suspension excludes a later
  -- operational commit; an earlier operational transaction completes first.
  FOR facility_row IN SELECT "id", "operationsSuspendedAt" FROM public."Facility"
      WHERE "id" = ANY(ids) ORDER BY "id" FOR SHARE LOOP
    IF facility_row."operationsSuspendedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Operational changes are paused for this Facility. Existing data, billing and Support remain available.'
        USING ERRCODE = '23514', CONSTRAINT = 'facility_operations_paused';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Every transition must have its matching reasoned OWNER event in this transaction.
CREATE FUNCTION enforce_facility_suspension_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."operationsSuspensionRevision" <> 0 OR NEW."operationsSuspendedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'A new Facility must start without a manual pause' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."operationsSuspendedAt" IS NOT DISTINCT FROM OLD."operationsSuspendedAt" AND
     NEW."operationsSuspensionRevision" = OLD."operationsSuspensionRevision" THEN RETURN NEW; END IF;
  IF NEW."operationsSuspensionRevision" <> OLD."operationsSuspensionRevision" + 1 OR
     (NEW."operationsSuspendedAt" IS NULL) = (OLD."operationsSuspendedAt" IS NULL) OR NOT EXISTS (
       SELECT 1 FROM public."HarborFacilitySuspensionAuditDetail" detail
       JOIN public."HarborAuditEvent" event ON event."id" = detail."eventId"
       JOIN public."PlatformStaff" staff ON staff."id" = event."staffId"
       WHERE detail."facilityId" = NEW."id" AND detail."revision" = NEW."operationsSuspensionRevision"
         AND event."facilityId" = NEW."id" AND staff."role"::text = 'OWNER' AND staff."isActive"
         AND detail."previousSuspendedAt" IS NOT DISTINCT FROM OLD."operationsSuspendedAt"
         AND detail."suspendedAt" IS NOT DISTINCT FROM NEW."operationsSuspendedAt"
         AND event."action"::text = CASE WHEN NEW."operationsSuspendedAt" IS NULL THEN 'FACILITY_REACTIVATE' ELSE 'FACILITY_SUSPEND' END
     ) THEN
    RAISE EXCEPTION 'A reasoned OWNER transition is required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER facility_suspension_transition BEFORE UPDATE OF "operationsSuspendedAt", "operationsSuspensionRevision"
 ON "Facility" FOR EACH ROW EXECUTE FUNCTION enforce_facility_suspension_transition();
CREATE TRIGGER facility_suspension_initial_state BEFORE INSERT ON "Facility"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_suspension_transition();
CREATE TRIGGER facility_operations_pause BEFORE UPDATE OR DELETE ON "Facility"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "AiOperationalBrief"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Asset"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "AssetIssue"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "AssetIssueEvidenceLink"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "AssetIssueUpdate"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "AssetMaintainerProposal"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "AssetPresenceNote"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "AssetStatusHistory"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Attachment"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "CatalogLogDefinition"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "CatalogLogField"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "CoverageEpisode"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "CoverageEpisodeTransition"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Department"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalCycle"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalCycleEvent"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalCycleKeyTimeGroup"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalCycleKeyTimeGroupRoom"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalCycleLocation"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalCycleMilestoneTime"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalZone"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperationalZoneLocation"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentOperatorRelationship"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentRequestRoute"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentStaffManager"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentTeam"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentTeamRoomMembership"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DepartmentVendorHeadAssignment"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "DisciplinePointEntry"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Employee"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeDepartment"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeOperationalRoleQualification"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeTeamMembership"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeUnitAccess"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeWorkStation"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "FacilityCatalogInstall"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "FacilityOrganization"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "FacilityRoomType"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "JobTitle"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeArticle"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeArticleAsset"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeArticleCatalogDefinition"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeArticleUnit"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "KnowledgeArticleVersion"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "LogAttachment"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "LogAttachmentCycleSelection"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "LogAttachmentDailyWindow"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "MaintenanceCategory"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Menu"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "MenuCycleSettings"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "MenuItem"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "MenuLocationApplicability"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "MenuOperationalCycleApplicability"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalAssignment"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalAssignmentEvent"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalAssignmentLocation"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalAssignmentPlan"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalAssignmentTemplate"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalAssignmentTemplateItem"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalCycleDayExpectation"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalCycleKeyPointActual"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalCycleKeyTimeDayExpectation"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalCycleTimingAdjustment"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalEvidenceAttachment"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalEvidenceCorrection"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalEvidenceFieldValue"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalEvidenceRecord"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalRecordWaiver"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalRequest"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalRequestEvidenceLink"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "OperationalRequestUpdate"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "PlaceNameChange"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "PreventiveMaintenanceOccurrence"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "PreventiveMaintenancePlan"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "PreventiveMaintenancePlanRecordRequirement"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "PreventiveMaintenancePlanVersion"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Repair"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "RepairEvidenceLink"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "RepairLaborEntry"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "RepairPartUsed"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "RepairRecordRequirement"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "RepairUpdate"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "RoomAreaStatus"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "ScheduleEntry"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "SetupImportBatch"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "SetupImportResult"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Unit"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "UnitDepartmentResponsibility"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "UnitSpace"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "UnitSpaceResponsibility"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "Vendor"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "WorkOrderResponseHistory"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
CREATE TRIGGER facility_operations_pause BEFORE INSERT OR UPDATE OR DELETE ON "WorkShift"
 FOR EACH ROW EXECUTE FUNCTION enforce_facility_operations_pause();
