# Private support attachment scanner

ONB-D15 selects a dedicated private ClamAV worker. This is a local runtime/reference image, not production hosting or deployment authorization. It exposes only authenticated HTTPS `/scan`; clamd uses an internal Unix socket. Originals stay in canonical private Blob custody. The Vssyl client streams exact bytes over verified TLS to an explicitly allowlisted worker host; no public Blob URLs or sample-sharing services.

The image pins maintained ClamAV 1.4.6 LTS. FreshClam runs unprivileged, verifies official definitions and notifies clamd; definitions persist in a dedicated volume. The worker and client refuse CLEAN if engine policy is unsupported/EOL or loaded signatures are older than 48 hours. Current policy accepts 1.4 patch 6 or newer until August 15, 2027. Review/raise the minimum patch and pinned image with ClamAV security updates; monitoring, signature availability, image refresh and on-call ownership are production prerequisites. Never weaken freshness checks to pass local verification.

## Local setup

Prepare an ephemeral private directory outside the repository containing a trusted local TLS certificate/key and `worker.env` (mode 0600). The certificate needs the loopback hostname/IP SAN. `worker.env` contains a random bearer token of at least 32 characters and:

```
SUPPORT_SCANNER_TLS_CERT=/run/scanner-secrets/cert.pem
SUPPORT_SCANNER_TLS_KEY=/run/scanner-secrets/key.pem
```

Set `SUPPORT_SCANNER_SECRETS_DIR` and run `docker compose up --build` from this folder. The reference binds only `127.0.0.1:55477`, bounds memory/CPU/processes, makes root storage read-only and uses tmpfs for ephemeral scanning copies. Do not publish raw clamd or mount customer originals. Do not delete the canonical originals or definitions volume as routine cleanup. Stop task-owned containers after verification; no production service is started by this repository.

Configure the application/processor with HTTPS `SUPPORT_SCANNER_URL` ending in `/scan`, exact `SUPPORT_SCANNER_ALLOWED_HOSTS` (host:port), matching `SUPPORT_SCANNER_BEARER_TOKEN` and, for a private CA, `SUPPORT_SCANNER_CA_PEM`. TLS verification is mandatory. These values are operator configuration, never customer input. Production host/network, TLS/token custody and deployment remain separately authorized.

Run the support-specific processor separately from inbound email: `npx tsx scripts/support/process-pending-attachments.ts`. It requires a disposable database by default. `--allow-live` is reserved for separately authorized production operation. Production scheduling must invoke this durable PENDING processor; no best-effort webhook tail job or generic job platform is introduced. Repeated processor invocations recover expired claims. Confirm the database URL before any invocation.

## Inspectability and bounds

Uploads retain the 10 MiB cap and blocked types/content. The worker rejects standalone archives and macro-enabled Office extensions. Initial inspectable formats are UTF-8 text/CSV/TSV, bounded valid unencrypted PDFs without embedded/active content, and `.xlsx`/`.docx`/`.pptx` Office containers containing inspectable XML/relationship parts. Embedded media/binaries, unknown formats, encrypted/corrupt containers, external entity declarations and macros are unavailable. Receiving these originals into private custody is still possible; they cannot download as CLEAN. This does not implement a spreadsheet domain reader or evaluate formulas.

Office preflight validates CRCs/XML and bounds total expanded bytes at 50 MiB, each member at 10 MiB, count at 1,000 and compression ratio at 100. It never extracts paths or follows relationships. PDF structural inspection is bounded at five seconds and 500 pages. Clamd independently caps scan time at 20 seconds, expansion at 50 MiB, file size at 10 MiB, recursion at eight and member count at 1,000, with encryption, macro and exceeded-limit alerts enabled. The wrapper's socket deadline is 30 seconds and client total deadline 55 seconds. Errors/skips/uninspectable data never become CLEAN. Temporary copies are mode 0600 within private tmpfs directories and removed after the response; crash copies disappear with the container. Canonical retention is unchanged.

Every response binds attachment, attempt, exact SHA-256 and size, with bounded result code, engine/signature versions and scan time. Only an exact complete no-detection result passes. The application rechecks stored bytes before publishing and on every download. Current metadata, active claim and lease must still match; late/mismatched results are rejected. Worker/provider raw output, secrets and file bytes are not persisted in scan receipts.

The processor serializes durable claims and records immutable attempt bindings/results. Failures retry three times with one-minute then five-minute backoff; exhausted work becomes SCAN_FAILED. An explicit authorized staff rescan starts a new audited three-attempt cycle. BLOCKED never silently resets to PENDING/CLEAN. Only staff can download clean originals, using existing attachment/no-store/nosniff headers. Service customer participants can review source metadata and explicitly shared import receipts.

## Verification

`src/lib/support/attachment-scanner.db.test.ts` contains processor edge cases and opt-in **real engine** proof. Set `ONBOARDING_TEST_DATABASE_URL`, `SUPPORT_SCANNER_TEST_CONFIG_DIR` to the local secrets folder and `SUPPORT_SCANNER_TEST_CONTAINER` to the task-owned container, then run the focused file. Test-only synthetic bytes use the canonical private-store interface in memory, real authenticated TLS and actual ClamAV. Real cases include benign, harmless EICAR, ordinary Office, archive/macro/expansion rejection, exact hash mismatch, duplicate processing, object change, and an actual paused-engine timeout/recovery. Mock response cases alone do not satisfy the delivery gate. No live Blob transfer or production deployment is implied.

The container health probe uses the internal Unix socket and rejects stale signatures, then verifies the local TLS listener against the configured certificate. `SUPPORT_SCANNER_TLS_SERVER_NAME` defaults to `localhost` for this local reference; configure the certificate DNS name for a separately authorized hosted worker. Raw clamd is never needed on a network port.
