# Partner canonical Log writes (Phase 2D3)

Date: 2026-10-08

Partner users can submit and correct canonical RUN Logs only inside the active authorized Department. Review and other operational surfaces stay closed.

## Partner Log submission

`submitPartnerCanonicalLog` requires `logs.submit`. Viewer is denied. Operator and Manager may submit. The attachment is loaded with the session Facility id and the active Department id. Client Facility and Department values are not authority. The write then calls `performCanonicalLogSubmission`, the same evidence writer internal submissions use after their own role check.

## Partner Log correction

`correctPartnerCanonicalLog` requires `logs.correct`. Only Partner Manager may use it. The certified operation is the existing canonical correction: append an `OperationalEvidenceCorrection` with the previous values, status, reason, time, and User actor, then replace the current field values. It does not delete the record, change its Department, edit the Log definition, or waive the requirement.

## Canonical actor

`recordedByUserId` and `correctedByUserId` are the partner User id. `recordedByEmployeeId` and `correctedByEmployeeId` stay null. No Employee row is created. The label is the session display name already used by canonical evidence.

## Acting context

`trackEvent` is console telemetry, not a durable audit record. Canonical Log submit and correction therefore store acting context on the action row itself:

- submission: `OperationalEvidenceRecord.actingAccessKind`, `actingPartnerOrganizationId`, `actingFacilityPartnerOrganizationId`, `actingEffectivePartnerRole`
- correction: the same columns on `OperationalEvidenceCorrection`

A partner action stores `actingAccessKind = partner` plus the Organization, partnership, and effective role that were true when the action ran. Those values are not foreign keys. Ending the assignment or partnership does not rewrite or delete them. A null acting context means an internal action, or a row written before this provenance existed. Internal canonical writes do not receive partner Organization metadata. A later correction does not replace the submission's acting context.

## Data ownership

Partner-created Logs remain Facility operational evidence. The partner Organization is the actor's authority context, not the data tenant.

## Historical truth

An Operator submission keeps `PARTNER_OPERATOR` after that person later corrects as `PARTNER_MANAGER`. The correction row stores `PARTNER_MANAGER`. Current assignment state is not used to reinterpret either row.

## Reauthorization

The partner Log actions call `requirePartnerOperationalContext()` on every submit and correction. That reloads live Path B. A Viewer ceiling, a removed Department, or a missing context denies the write. The internal functions `submitCanonicalLogSubmission` and `correctEvidenceRecord` still reject a partner session.

## Canonical evidence

Partner submissions create `OperationalEvidenceRecord` rows. There is no partner evidence table. The canonical mutation does not emit a separate audit event; the record stores the User, Facility, Department, and evidence. Partner Organization id is not a column on that record.

## Product decisions

Partner Viewer is read only. Partner Operator may read and submit. Partner Manager may read, submit, and use the certified correction. Legacy Logs and Build stay closed. Partner Manager does not inherit internal Manager powers. The target must belong to the active Department.
