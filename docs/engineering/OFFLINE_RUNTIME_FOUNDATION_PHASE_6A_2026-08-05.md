# Offline Runtime Foundation — Phase 6A (2026-08-05)

## Scope

Phase 6A delivers the first complete offline Runtime vertical slice for shared-tablet Milestone continuity on the legacy Unit Workspace:

- Installable PWA shell (manifest + native service worker)
- Scoped offline Runtime bundle API
- Protected IndexedDB local store with optional AES-GCM encryption
- Durable Milestone command queue and synchronization API
- Online / offline / synchronizing UX on Servery controls
- Basic conflict review for supervisors
- SQL-backed and hermetic regression tests

## Explicit non-goals

Phase 6A does **not** support:

- Offline cold-start authentication
- Offline Quick PIN verification
- General offline Logs, Assets, or Issues
- Offline Assignments or Operations Engine activation
- Full-day infrastructure outage guarantees
- Native iOS/Android applications
- Projection Unit Workspace meal controls (legacy path only)

## PWA architecture

- `public/manifest.webmanifest` — installable metadata
- `public/sw.js` — versioned app-shell cache (`ltc-offline-shell-v1`)
- `public/offline.html` — neutral offline fallback
- `src/components/pwa-register.tsx` — client registration + update handling

### Service-worker cache policy

**Allowed:** shell assets, `/icons/*`, `/_next/static/*` (network-first with cache fallback)

**Never cached:** `/api/*`, `/login`, protected HTML routes (`/unit/*`, `/admin/*`, etc.)

## Local store

- Database: `ltc-offline-runtime` (IndexedDB v1)
- Collections: device context, active bundle, command queue, conflicts, meta
- Protection: non-extractable AES-GCM key when Web Crypto + IndexedDB available; otherwise origin isolation only (documented in `crypto.ts`)
- Never stores JWTs, cookies, PINs, or passwords

## Offline bundle

- Endpoint: `GET/POST /api/offline/runtime-bundle`
- Requires: valid session + sessionVersion, device facility cookie, Dietary operational authority, matching unit scope
- Lease: 12 hours (`OFFLINE_BUNDLE_LEASE_HOURS`)
- Revision: SHA-256 digest of unit + milestone projection state

## Command and sync protocol

Supported commands:

- `RECORD_SERVERY_READY`
- `RECORD_MEAL_SERVICE_STARTED`

Sync endpoint: `POST /api/offline/runtime-sync`

- Batch limit: 20 commands
- Request body limit: 64 KB
- Results: `ACCEPTED`, `ALREADY_ACCEPTED`, `REJECTED`, `CONFLICT_REVIEW_REQUIRED`, `RETRY_REQUIRED`
- Uses shared `recordServeryMilestone` — no forked business logic

## Conflict handling

Categories include `DUPLICATE_DIFFERENT_COMMAND`, `AUTHORITY_CHANGED`, etc.

Resolution (supervisor+):

- Mark as duplicate
- Reject with reason
- Apply as correction (uses existing correction workflow)

## Sign-out and device change

- Standard sign-out clears active bundle and marks device context signed out
- Unit rebind clears bundle; prior-unit commands remain tied to original unit
- Remote wipe is not claimed when fully offline

## Retention

- Accepted commands purged after 72 hours once authoritative state refreshed
- Pending, rejected, and conflict records retained until resolved

## Operator recovery

See [OFFLINE_RUNTIME_RECOVERY_NOTE.md](./OFFLINE_RUNTIME_RECOVERY_NOTE.md).

## Browser certification closeout

The original Phase 6A tip certified the offline Runtime vertical slice with unit, API, SQL-backed, clean-checkout, and hosted verification, and recorded that the interactive browser network-emulation matrix had not yet been executed.

That remaining finding is closed by:

[OFFLINE_RUNTIME_PHASE_6A_BROWSER_CERTIFICATION_2026-08-05.md](./OFFLINE_RUNTIME_PHASE_6A_BROWSER_CERTIFICATION_2026-08-05.md)

Repository command: `npm run test:offline-browser` (disposable database + production Next server + Chromium).

## Known limitations

- Hosted CI runs the certification-critical browser subset (`OFFLINE_BROWSER_CI_GATE=1`); the full thirty-two-scenario matrix is the repository-owned command
- Background Sync API is optional enhancement only
- Facility Administrator without Dietary operational authority cannot obtain a frontline bundle
- Human PWA install gestures are not claimed from automation; installability criteria are verified instead

## Future Phase 6B boundary

Broader offline surfaces (Logs, Assets, cold-start auth) remain out of scope until a subsequent phase.
