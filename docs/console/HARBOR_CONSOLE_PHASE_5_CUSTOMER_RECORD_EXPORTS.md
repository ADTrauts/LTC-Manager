# Phase 5 — customer-requested Record exports

Status: implementation draft, not released. On November 19, 2026 the owner approved the first limited export scope below. Tests are explicitly excluded. Hosted migration, merge and Production promotion each still need approval; previous one-time administrator exceptions do not authorize this draft.

## Approved scope and entry points

The current Facility Administrator requests recorded responses from one self-operated Department and Record over an explicit service-date range. The OWNER reviews the data list, dates, recipient and CSV/Excel format. Only the same requesting Administrator, while still the current authorized Administrator, can generate/download for 24 hours from approval. A successor does not inherit a predecessor's requests. OWNER approval confers no staff permission to read responses or download the customer's file.

Customer entry: Administration → Requested Record exports (`/admin/exports`). OWNER entry: Console → Export requests (`/console/exports`). Requests, available Library entries and OWNER reviews are paginated in groups of 25. Exact request retries reuse the UUID reference; conflicting reuse fails. An Administrator may have up to 25 pending requests.

The field manifest includes Record reference, service date, location label, recording time and actor label, status, outside-standard flag, field/group/row, response, unit and operational corrective action. Each request pins a metadata-only list of the actual historical Catalog versions, typed field keys and labels present in its existing Records. The OWNER can review that list without receiving response data. A changed/new definition or field list requires a new customer request. Reports contain the current persisted responses at generation, not an immutable backup or expected/missed-work calculation. Empty ranges cannot be requested in this initial release.

Vendor-owned/private data, employee HR, attachments (including signatures/photos/files), credentials and internal staff notes are excluded. No Employee/HR, Harbor notes, private object store or credentials reader is used. Operational recording attribution and corrective action are part of the explicitly disclosed report data. A vendor or unknown/overlapping operator period anywhere in the requested dates refuses the whole report; the system never silently delivers a partial report. Current Department read authority and platform/own-Facility Catalog ownership are required, including for historical Records. Missing ownership provenance or snapshot identity fails closed.

## Canonical ownership and persistence

Reports read the existing `OperationalEvidenceRecord` and nonattachment `OperationalEvidenceFieldValue` rows, their pinned Catalog snapshots, and canonical Department/operator authority. Existing filename sanitization, content disposition and ExcelJS are reused. There is no second Records store, generic history engine, reporting warehouse or independently calculated requirement state.

`CustomerRecordExportRequest` owns only the immutable requested scope/field manifest and its permission lifecycle. `CustomerRecordExportEvent` records requested, approved, denied, cancelled, revoked and generated events with actor identity/type and time. Generated receipts contain only SHA-256, byte count and Record count. Neither table stores response values, export bytes, bearer download links or passwords. Scope and manifest cannot be edited; changed scope/renewal needs a fresh request. Expiry is fixed at approval plus 24 hours. Expired approvals remain historical approvals but cannot authorize a download.

A forward migration, `20261119210000_customer_record_exports`, adds these two governance tables, their constraints/indexes and scope-protection trigger. It is intentionally not part of the operational-pause table guard: existing authorized data remains available during suspension. Export writes change only request/governance receipts, never customer operational facts. No database migration or privilege change is implied by publishing this draft.

## Download, concurrency and delivery

The download endpoint accepts same-origin POST only; links and prefetch do not generate files. It authenticates the independent customer session, locks Facility/User/access/request rows, rechecks the current canonical Administrator seat, login revocation/expiry and Department read authority, and validates all dates, operator attribution, Catalog ownership and the pinned field list before returning bytes. Facility locks serialize with existing operating/seat changes and operational-write guards. User locks serialize with authority updates and exact-login logout receipt insertion. Request locks serialize approval cancellation/revocation with generation. Completed conflicting changes prevent subsequent generation; an already delivered copy cannot be recalled. Rendering is inside a bounded transaction and expiry/authority are checked again before its generation receipt commits.

Files are generated in memory on demand, returned privately with `no-store`, and never saved to disk/Blob or sent by email. The generation event commits before the handler returns bytes. It proves generation, not successful browser receipt or retention. Repeated downloads during the approval window each revalidate and create a generation receipt. Cancel/revoke stops future downloads, not a file previously retained by the customer.

Limits: 93 inclusive service days, 2,000 Records, 50,000 nonattachment responses, 50 Catalog versions/500 distinct fields and a 4,000,000-byte final file. Oversized or unverifiable content is refused, never truncated. Excel's per-cell limit is also enforced. CSV escapes cells and neutralizes spreadsheet formula prefixes; XLSX responses are literal strings. The manifest and approved field list accompany the responses.

## Release and remaining Phase 5 scope

Implementation is published with `[skip ci]` and hooks disabled to honor the no-tests instruction. Required skipped checks are not described as passing. Compilation/client generation is not runtime evidence. No app/browser run, fixtures, synthetic provider event, mail, job, live export or database exercise is authorized in this work.

The next database decision is a durable recovery copy and this one forward migration on synthetic staging `br-aged-river-b8b7c2a1` only. Production remains at the released suspension/reactivation version until separately approved. Preserve the prior compatible deployment and database recovery pair. Do not roll back the database, drop export accountability, remove operational guards or weaken logout receipts.

Phase 5 now has released manual suspension/reactivation and this export draft. Full-Facility backup, broader/vendor exports, export file delivery/storage, automatic purge/retention policy, and offboarding/deletion remain future decisions. Scanning, staff invitations, independent recovery and assistance/grant issuance remain disabled.
