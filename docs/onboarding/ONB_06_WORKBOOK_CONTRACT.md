# Combined onboarding workbook

Version: `vssyl.onboarding.xlsx/1`. Current completion/evidence belongs to [the phase tracker](./PHASE_TRACKER.md); the workbook is implemented under [D16](./DECISIONS.md#onb-d16--combined-xlsx-canonical-execution-and-receipt-bound-references--october-18-2026). ONB-07, rollout and deployment are outside this phase.

Open **People → Bulk setup → Combined XLSX workbook**, or the People link in guided setup. Console uses its actual **Open facility** work session and the same page. Internal Facility Administrator password authority is required for the combined package. Existing authorized operators retain individual Asset CSV through **Import one list instead**.

## Download and complete

Download a fresh Facility workbook. Keep Start Here and Departments. Site, timezone and Department facts are reference metadata; edit site facts in guided setup and purchase/license/install Products through their existing owners. Editing workbook metadata grants no authority or publication.

| Sheet | Purpose and required data |
|---|---|
| Start Here / Site | Required version and Facility ID; prefilled site/timezone, instructions, required/optional field guidance and limits. No mutation dataset. |
| Departments | Required reference sheet of currently authorized installations. No purchase/install/license or configuration writer. |
| Locations | Optional canonical Facility hierarchy: floor; optionally neighborhood, then locationName/locationType. Optional building, roomNumber, code, description, Department responsibility. Same Facility Builder definitions/writer. |
| People | Optional create/reuse: real email, names, explicit roleType/employmentType/primaryDepartment for new people. Existing employeeId or exact email requires account-match confirmation; no patches. |
| Department Locations | Optional additive responsibility: Department, UNIT/ROOM and canonical locationId or local reference. UNIT kind PRIMARY/BACKUP/SUPPORT; ROOM kind blank. |
| Department Memberships | Optional additive membership: employeeId/email, Department and PRIMARY/ADDITIONAL. Team/Job Role fields remain optional and scoped. |
| Assets | Optional, omitted unless current canonical Asset authority permits it. Existing Asset schema, exact hierarchy or scoped IDs, stable assetCode/serialNumber/facilityAssetNumber, explicit Department or unambiguous Unit default. No operational Work/evidence. |
| Reference Values | Canonical values and up to 800 current identity/place/organization references. This is a bounded convenience; live Builders/People and on-page references remain authoritative. |
| Examples | Explanatory strings only. Never importable data. Blank import sheets have headers only. |

Data sections may be omitted or left empty. Unknown/duplicate sheets, changed headers and unsupported parts fail explicitly; do not add future Product/dataset sheets. All import columns remain present even when optional values are blank. Supported individual CSV templates still use the same definitions; Facility structure CSV remains in Facility Builder. Ordinary employee updates/clears remain ONB-01.

Keep all input cells **text**, including codes such as `0012`, phone/room numbers and IDs. Format before entering/pasting; converting a number to text after Excel discarded zeros cannot recover the original identifier. Numeric/date/error cells are rejected rather than guessed. No formulas or cached results, passwords, PINs or lifecycle/credential fields.

## Local references and preview

Give a new person/place a unique `rowRef`, for example `p001` or `room001`. In Department Memberships, `employeeId=ref:p001` refers to People. In Department Locations, `locationId=ref:room001` refers to Locations, with matching ROOM/UNIT type. Asset floor/neighborhood/space can use a Locations reference; it resolves to the corresponding exact canonical path IDs, including buildings with repeated Floor names. Aliases are file-local, case-sensitive text, not new database identities.

Preview validates the complete package without writing a person, place, batch, receipt or invitation. It shows source sheet/row/column values, proposed canonical operations, resolved account identities and dependencies, including missing/blocked references. Symbolic `file:` nodes describe future dependencies only; committed receipts provide actual IDs. New people remain email-backed and account matches stay explicit. Revoked/historical/ambiguous identities require canonical lifecycle review.

Inspect every create/add/reuse/blocked row and the transaction explanation before confirming. Initial execution priority is Locations, People, Department Locations, Department Memberships, Assets. Dependencies always precede dependants. Each row uses the existing canonical executor and an independent transaction; there is **no workbook-wide rollback**.

## Confirmation and recovery

First confirmation requires the same workbook bytes and signed review, within 30 minutes. Server-authenticated actor/Facility context remains authoritative. Authority, source intent, relevant catalog facts and committed reference mappings are revalidated under existing transaction locks. The immutable reviewed intent and last expected checkpoint are separate: successful workbook commits update the checkpoint atomically with their canonical child and parent receipts/mappings; external relevant changes do not. External drift requires renewed preview. The check conservatively covers relevant Facility location/organization catalogs, so a change elsewhere in those catalogs can require new review.

Each request attempts at most 25 ready rows. Ready unattempted work precedes repeated failures, preserving dependencies so failed rows cannot starve later independent work. Pending prerequisites remain unknown/unattempted. Read actual committed/reused/blocked/failed/unknown outcomes and the canonical dataset receipt IDs. Account activation and eligible PIN enrollment remain separate, visible canonical People tasks; no credential is generated or overwritten.

After interruption, reload in the same actor/Facility and **Reconcile workbook results** before retrying. Browser hints contain only batch/review identifiers. Domain outcomes, references and execution leases live in the database. A running child also keeps recovery marked running; do not duplicate a request while its lease is active. Resume uses normalized reviewed intent; raw workbook bytes are not needed after the first durable confirmation. Expired reviews require fresh preview for remaining intent; existing commits remain valid and can be reused with explicit matching.

Where an earlier failed child review becomes stale solely because other reviewed workbook rows committed, the parent checkpoint may authorize a new canonical child review. Keep prior child receipts/attempt history and record that refresh. Never refresh an unknown/running outcome or use this mechanism to accept external drift.

Assisted engagement participants receive explicitly shared, authorized **canonical dataset child receipts**, preserving the original executor. The workbook aggregate cannot bypass service scope/receipt-sharing rules.

## File safety and custody

Only supported `.xlsx` packages are accepted. No XLS/XLSM, encryption, macros, external links/connections, embedded binaries, formulas/shared formulas/cached formula values, DTD/entities, defined names, nested archives or unknown package parts. The installed ExcelJS dependency generates templates; untrusted input is read by bounded ZIP/XML parsing, without an unbounded ExcelJS load.

| Resource | Limit |
|---|---:|
| Compressed file | 5 MiB |
| Actual expanded archive total / entry | 20 MiB / 4 MiB |
| Entries / sheets | 128 / 9 |
| Data rows total / People | 1,000 / 500 |
| Cell positions per sheet | Row 1,001, column 24 maximum |
| Populated cells / decoded logical cell text | 50,000 / 2,000,000 UTF-8 bytes |
| Cell/shared-string length | 2,000 characters |
| XML depth / archive nesting | 32 / 0 |
| Parse processing budget | 5 seconds, checked during bounded operations |

Central directory sizes are preliminary checks. Actual inflation is allocation-bounded before/during expansion, followed by actual size/CRC checks. Shared-string reuse is counted again at each decoded cell to prevent small XML from amplifying the review payload. Unsupported Excel features fail closed; use a clean supported template or individual CSV lists.

This importer retains no raw original and uses no instance-local production file store. The database retains bounded normalized reviewed intent and receipts for recovery. Separately retained customer originals must use ONB-05/D15 private Blob, quarantine, real scanning and staff-only downloads. Migration review/tracking/integrity and production scanner operation remain separate release prerequisites. Local synthetic tests do not certify production Blob, native Excel behavior or a pilot.

### ONB-07 confirmed rollback recovery

D17 uses the shared CSV transaction helper for a maximum of five attempts after a known P2034 serialization/deadlock rollback, with bounded backoff. Authority, immutable intent, expected checkpoint and committed mappings are checked again on every attempt. Unknown COMMIT/network outcomes remain on the receipt reconciliation path; expected earlier commits never authorize external material changes. Exhausted contention stays visible. No workbook-wide rollback or new domain executor is introduced.

## R07-01A child-claim recovery addendum — October 19, 2026

D22 distinguishes pending coordination from authoritative outcomes. The existing stored child has an optional attempt token; a request updates it under the parent lease before invoking the same canonical child identity. An uncertain response stays unknown and reconciles that identity. A positively rolled-back claim exhaustion is recorded as a failed WORKBOOK_ATTEMPT under existing SetupImportResult after locked receipt/lease reconciliation, then other ready rows may proceed within the 25-attempt bound. These records never create reference mappings. Domain effects, child IMPORT results, parent WORKBOOK results and reference mappings remain atomic in the original canonical row transaction.

Current canonical outcomes override earlier attempt errors. Unknown/running work cannot be refreshed into a new identity. When only expected sibling commits changed the parent checkpoint, retain an unclaimed child review if its canonical plan digest is still identical; otherwise refresh only with the existing protected checkpoint and proof of a terminal prior attempt. Prior history stays visible. Coordination-only claim checks do not replace the full mutation guard. No retry increase, workbook-wide rollback, credential/lifecycle exception, catalog-scope relaxation or XLSX version change is authorized.

### D23: checkpoint version 2 and completed People

New reviews bind internal checkpoint version 2 into signed intent and the existing parent receipt. A completed/reused People row may leave subsequent identity reads/locks only when no remaining row consumes it: local references, literal Employee IDs, exact case-normalized emails and resolved canonical matches all count. Unresolved aliases remain conservative. Pending/failed/unknown/blocked consumers retain protection; live actor checks and full Facility location/organization catalogs never retire. The same pure projection controls dependency locks and checkpoint reads. Retirement and the updated checkpoint commit atomically with the canonical effect, receipt and mapping. Reference mappings still derive from committed receipts.

An external edit to a completed, unused person does not invalidate unrelated remaining intent or rewrite historical results. Relevant pending lifecycle, credential, authority or dependency changes still block execution and require review. Legacy reviews/parents without a checkpoint version retain full protection; no historical upgrade. Reject unsupported versions and parent/review version mismatches, even when there are no eligible rows. Public workbook version and CSV execution remain unchanged. D23 is an approved bounded review-scope change, not a guarantee that all integrated contention is resolved or a release waiver.
