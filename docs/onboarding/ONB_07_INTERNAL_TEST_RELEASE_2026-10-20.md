# Onboarding internal test release — October 20, 2026

**Authorized internal test release only; ONB-07 remains incomplete. Real customer pilot acceptance is pending.** The user explicitly authorized reconciling/pushing the reviewed integration to ADTrauts/LTC-Manager `main`, its automatic deployment to the linked Vercel `ltc-manager` project, required forward migrations and mandatory GitHub CI. This supersedes the earlier CI-only/no-deployment restriction for this target. No feature-branch deployment exclusion is added.

## Candidate and environment

Reviewed integration: `0d611fd9b8bc7bde774b7eab6facaafba3bf5ed3`, 355 frozen paths, parent `3b5556e2ece0271a5bf7148ab61486537b61fbba`. Fetch confirmed remote main at the reviewed parent and no branch protection requirement. Preserve history and use a normal fast-forward push; no force. The release follow-up adds the configuration guard below and this record. Exact final main/deployment/check SHAs belong in the release execution evidence and GitHub/Vercel run metadata.

Vercel production target (because its Git production branch is main): project `prj_O3x1tS8yS1rFQEmd73rofZboIDCK`, team `team_djeRA5ZpmVTjCf6opbxfj6SS`. Node24, automatic Git deployment enabled, existing ignored-build command builds application changes. No hosting, domain, deployment exclusion, paid resource or environment-value change is authorized or performed by this record.

## Database prerequisite completed before runtime push

The actual Vercel runtime connection points to Neon `ep-plain-salad-avjht24p-pooler.c-11.us-east-1.aws.neon.tech`, database `neondb`, role `neondb_owner`, PostgreSQL18.6. A direct TLS connection to the **same endpoint** without `-pooler` verified that database/role and matching migration history. The configured DIRECT_URL is non-exportable; it was not changed. Existing runtime credentials were kept in ignored mode-600 files and never printed or committed.

Initial history:140 completed migrations, ten pending, no unknown/unfinished migrations, one previously documented historical checksum exception `20260423105656`. The existing checksum owner accepted that exception; no new exception or history repair. `prisma migrate deploy` applied all ten reviewed forward migrations. Post-check: **150 completed / zero pending / zero unfinished**, prior140 names/checksums preserved. No applied SQL edit, reset, reseed, domain-row cleanup, account creation or destructive operation. Full local execution logs/metadata remain under ignored `tmp/onb07-internal-release`; do not publish credential files.

## Essential configuration and bounded correction

The production target has no SUPPORT_SCANNER_URL/token/allowlist and no OFFLINE_RECOVERY_KEYS/active key. Offline preparation/recovery already fails closed without its managed keyring; no default key is introduced. Scanner processing remains unavailable and originals quarantined. The two Console original-file download routes now additionally reject with503 when the canonical scanner factory is absent/invalid, even for historical CLEAN status, before reading bytes. Both reuse one canonical configuration helper; authentication/attribution, scan verdict/hash checks, private storage and existing authorization remain. No fake scan, new scan model or fallback is added.

Focused configuration regression: **1 passed / 0 failed**, covering absent URL/token, short token, insecure scheme, unapproved host, malformed URL and valid configuration admission. This is configuration proof, not real ClamAV hosting or scanning proof. Focused four-file lint passed. Existing unchanged database/scanner/browser evidence is reused within its recorded limits; no unchanged local full-suite or build replay merely for deployment.

Current configuration limits:

- Private Blob token is present; approved scanner worker/TLS/secrets/updates/scheduling/ownership remain unprovisioned. Original downloads stay unavailable.
- Managed offline keyring/active key are absent; secure SPACE offline preparation/recovery stay unavailable. No insecure fallback or automatic provisioning.
- Stripe server key is absent; purchases/service-fee collection are unavailable. No live charge or checkout operation is exercised.
- Public signup remains default-disabled in production; no enablement.
- Department Operational Profiles, Operational Assignments and Dietary job-flow flags are unset; their gated journeys remain unavailable unless separately configured. No silent flag change.
- Auth, mail and cron secrets are configured but non-exportable. No email, invite, support submission, job scheduling change or cron invocation is part of verification.

## Release verification and acceptance

The release execution must confirm Vercel's exact Git SHA/READY status and run all five existing GitHub Verify jobs on the same final candidate: static/hermetic, PostgreSQL16 integration, offline browser, assignment browser and synthetic Dietary journeys, using Node20. Main pushes are excluded by the current workflow push trigger, so dispatch the existing workflow explicitly on main and verify its resolved SHA. Preserve failed attempts and diagnose with focused checks/follow-up commits; do not waive jobs. Actual run/job/artifact links and deployment status are execution evidence, not claimed as passing in this pre-push record. Supplementary onboarding Playwright configurations and real scanner checks are not implied remote coverage.

Check deployed loading and safe non-charge/non-email routes; do not use real customer workflows or invent internal account credentials. Record authentication/configuration limits honestly. No live charge, customer message, new paid infrastructure, destructive data operation or pilot activation is authorized. Existing intermittent Partner membership-end, PM replacement and intermediate recovery findings are not retrospectively claimed fixed. Scanner/key infrastructure and actual customer pilot Facility/workflow/owners/window/effort/acceptance remain pending.
