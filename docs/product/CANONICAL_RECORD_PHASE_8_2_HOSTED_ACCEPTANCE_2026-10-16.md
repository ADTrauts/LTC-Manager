# Phase 8.2 isolated hosted acceptance — October 16, 2026

## Status

**PASS — isolated hosted media acceptance.** Hosted capture, canonical persistence, private Blob metadata, authenticated retrieval, anonymous denial, and PDF retrieval/visual inspection pass. Combined with the prior local acceptance, the outstanding Phase 8.2 hosted media gap is closed. This does not authorize or certify a production rollout or a whole-repository verification pass.

## Isolation

- New Vercel project: `ltc-manager-staging`, `prj_cq3byooSr1G9054JukrMx2VyZQS3`.
- Explicit Preview deployment: `dpl_Gww49CaA3PRoh4RwL87DAYVWqyEz`, https://ltc-manager-staging-wuvf2dhw0-adtrauts-projects.vercel.app.
- PDF packaging fix Preview: `dpl_ApbpV5tiHXjCAcYUVXEzWQeQ58SS`, https://ltc-manager-staging-deuhwitim-adtrauts-projects.vercel.app.
- New Neon database: `ltc-manager-staging-db`, `store_xlPMFUDhmPTHp4Js`, free plan, iad1.
- New private Blob store: `ltc-manager-staging-private`, `store_jvHtHn9zhCiwi9Wo`, iad1.
- Database and Blob resources are connected only to the new project's Preview and Development environments. Their credential entry identities differ from the real application's production entries.
- New authentication and cron secrets; no production email, billing, or database secrets copied.
- Public signup and background synchronization disabled. Canonical Logs enabled only in this separate project.
- Vercel deployment authentication remains enabled. The browser reaches Vercel login; hosted HTTP checks use the existing authenticated Vercel CLI connection.
- Original workspace Vercel link remains on `ltc-manager`. Real production resources, flags, data, and deployment were not changed.

Vercel automatically assigned the first deployment of the new project to that project's production slot (`dpl_8t9QESNXMsMvVaijhspCMEDcFtxG`). It is not the real application's production project, has no production application credentials, and is not the acceptance target. The explicit Preview above uses the isolated resources.

## Database preparation

An empty-schema check passed before all 140 existing migrations were applied with `prisma migrate deploy` to the new staging database. Migration integrity verification passed with the repository's one documented historical checksum exception. No existing migrations were edited and no database was reset.

The general seed script stopped at its outdated `Unit` composite unique selector after creating synthetic facility, administrator, departments, roles, and permissions. A focused create-only fixture completed the acceptance setup without resetting data or changing the general seed script.

Synthetic fixture:

- Facility: `LTC Manager Staging — synthetic data`, `cmfacseed0000000000000001`, America/New_York.
- Dietary department: `cmvabrqjm0001xwks1qhxbcyh`.
- Room: `Media Acceptance Room`, `cmvabvdq00003xw146sa64yup`, within `Staging Kitchen`.
- Published inspection: `Staging Media Acceptance Audit`, stable key `staging_media_acceptance_audit`.
- Attachment: `c0ae24cf8f248b4d5a73f8bbf`, daily 00:00–23:59, effective October 15.
- Required compliance answer, notes, photo, and signature. Passing score 80; critical failure forces failure.
- Separate random-password synthetic facility administrator, email verified. Credentials remain in ignored local files outside the deployment source.
- Focused setup supplies the current `UserFacilityAccess` and `UserFacilityRolePeriod` required by normal facility sign-in; the general seed's old `User.facilityId` assignment alone did not confer access.

## Hosted results

The first explicit Preview reached READY and normal password sign-in routed the synthetic administrator to `/workspace`. Its authenticated `/staffing/logs` page exposed the current scheduled requirement for October 16. The deployed public JavaScript identified the application's normal capture Server Action; an authenticated HTTP request submitted the synthetic photo and signature through that action. This is hosted HTTP acceptance, not a claim of hosted browser clicks or a newly drawn browser signature. Actual browser capture was tested locally in the clean-day acceptance.

- Action result: `ok: true`, Record `c3635ae2d5eec2afa3959dcd6`, `exception: false`.
- Database: one canonical Record, `COMPLETED`, operational date October 16; zero legacy Log submissions and zero separate Inspection submissions.
- Photo attachment: `emat_445bf726e7b78e102318923c`, PNG, 14,402 bytes.
- Synthetic signature attachment: `emat_260f9b6f129f35748ae95ab0`, PNG, 1,488 bytes; recorded signer `Terrace View Admin`, saved `2026-10-16T09:45:12.821Z`.
- Both attachment storage keys are scoped to the staging facility and Record. Blob `head` confirmed the exact key and size on a private Blob origin.
- Authenticated application retrieval returned HTTP 200 and exact uploaded bytes for both files. SHA-256 photo `8cbf2b896796a2b75830a9c0f23bd841d039ee2b60cb49e6c8c8ea1428358155`; signature `37460ad053f3f174805737af935c5d334857757db0cc701cdb932665277d4c8e`.
- Without application session cookies, the attachment endpoint returned HTTP 401. Direct anonymous access to each private Blob object returned HTTP 403.

## PDF packaging defect and repair

The hosted PDF endpoint initially returned HTTP 500. Scoped staging runtime logs identified `Cannot find module '#standard-fonts/Helvetica'` from bundled PDFKit 0.20.2. Local PDF rendering had not exposed this deployment packaging issue.

`next.config.ts` now externalizes the Node PDFKit package and explicitly includes its standard-font CommonJS modules in the `/reports/export` trace. The isolated staging redeploy reached READY with build and TypeScript verification passing. Configuration ESLint and `git diff --check` pass.

The fixed hosted endpoint returned HTTP 200, `application/pdf`, 23,114 bytes. The downloaded PDF opens as one Letter-sized page. Text/image assertions confirm one expected audit, one completed audit, score 100%, two embedded images, signer `Terrace View Admin`, and saved time `2026-10-16T09:45:12.821Z`. Poppler rendering and visual inspection confirm that the photo, synthetic signature, signer, saved time, summary, and footer are visible without clipping. This PDF fetched both private evidence objects from the hosted store; it is not a locally regenerated report.

Proof artifacts are in ignored `tmp/phase82-hosted/`: action response, database metadata, Blob metadata/anonymous checks, uploaded/downloaded files, and response headers. Authentication files are private local files and are not included in source deployment or completion reports.

Local browser acceptance and the 399-test focused suite are recorded in `CANONICAL_RECORD_PHASE_8_2_CLEAN_DAY_ACCEPTANCE_2026-10-15.md`. The 53 broad-suite failures were also present in the unchanged baseline and remain a separate release concern.

## Next step

Review the broad-suite baseline failures for production impact and prepare a scoped controlled-production-pilot release. Production needs an explicit capability release and a saved facility/department/service-date rollout decision; later feature phases will not restore Build → Logs automatically. Keep the global default off until that release is reviewed and authorized. No defined Phase 8.3 was found in the supplied conversation; a controlled pilot is a proposed next scope, not an existing phase specification.
