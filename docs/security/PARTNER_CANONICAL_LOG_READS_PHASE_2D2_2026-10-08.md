# Partner canonical Log reads (Phase 2D2)

Date: 2026-10-08

A partner Facility session may read canonical RUN Logs for the active authorized Department. Submission and correction stay closed.

## Partner canonical Log read

`/partner` remains home. `/partner/logs` and `/partner/logs/records/[recordId]` are partner session routes. They call `loadFacilityRunLogRequirements` and the canonical record presenter. There is no separate partner Log engine. `/staffing/logs` stays internal.

## Current authorization

`logs.read` is required. Viewer, Operator, and Manager all have it. The list uses `PartnerOperationalContext.facilityId` and `activeDepartmentId`. Current Path B is enough to read that Department's existing canonical history. The read does not look up the user's assignment on the day the record was created.

## Facility isolation

List and detail queries include the session Facility id. Another Facility's Food & Nutrition records are not part of this session, even when the same Organization partners there.

## Direct-object protection

Detail loads a record only when its id, Facility id, and active Department id match together. An EVS id, another Facility's id, or an unknown id is not found. The loader does not change the active Department.

## Null-filter protection

Internal Logs may still pass a null Department for All Departments. The partner call sets `partnerRead: true` and requires a Department string. A missing Department throws before the query. The partner result also omits other-Department names and write links.

## Read-only phase

Phase 2D2 omitted write controls. Phase 2D3 adds partner submit and the certified correction. See `PARTNER_CANONICAL_LOG_WRITES_PHASE_2D3_2026-10-08.md`. `submitCanonicalLogSubmission` and `correctEvidenceRecord` still reject a partner session.

Switching Department from Logs returns to `/partner/logs` when that path is proposed. Other return values stay on `/partner`.
