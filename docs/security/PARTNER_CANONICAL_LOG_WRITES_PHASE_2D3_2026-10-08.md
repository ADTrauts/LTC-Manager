# Partner canonical Log writes (Phase 2D3)

Date: 2026-10-08

Partner users can submit and correct canonical RUN Logs only inside the active authorized Department. Review and other operational surfaces stay closed.

## Partner Log submission

`submitPartnerCanonicalLog` requires `logs.submit`. Viewer is denied. Operator and Manager may submit. The attachment is loaded with the session Facility id and the active Department id. Client Facility and Department values are not authority. The write then calls `performCanonicalLogSubmission`, the same evidence writer internal submissions use after their own role check.

## Partner Log correction

`correctPartnerCanonicalLog` requires `logs.correct`. Only Partner Manager may use it. The certified operation is the existing canonical correction: append an `OperationalEvidenceCorrection` with the previous values, status, reason, time, and User actor, then replace the current field values. It does not delete the record, change its Department, edit the Log definition, or waive the requirement.

## Actor identity

`recordedByUserId` and `correctedByUserId` are the partner User id. `recordedByEmployeeId` and `correctedByEmployeeId` stay null. No Employee row is created. The label is the session display name already used by canonical evidence.

## Reauthorization

The partner Log actions call `requirePartnerOperationalContext()` on every submit and correction. That reloads live Path B. A Viewer ceiling, a removed Department, or a missing context denies the write. The internal functions `submitCanonicalLogSubmission` and `correctEvidenceRecord` still reject a partner session.

## Canonical evidence

Partner submissions create `OperationalEvidenceRecord` rows. There is no partner evidence table. The canonical mutation does not emit a separate audit event; the record stores the User, Facility, Department, and evidence. Partner Organization id is not a column on that record.

## Product decisions

Partner Viewer is read only. Partner Operator may read and submit. Partner Manager may read, submit, and use the certified correction. Legacy Logs and Build stay closed. Partner Manager does not inherit internal Manager powers. The target must belong to the active Department.
