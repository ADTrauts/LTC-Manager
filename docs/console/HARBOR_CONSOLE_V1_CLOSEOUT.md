# Harbor Console v1 closeout — November 21, 2026

Status: **feature scope closed for the approved sole-OWNER first release**. No additional Harbor v1 features are planned. The future-team and wider customer-workspace vision has explicitly deferred parts; this record does not claim those parts are enabled or comprehensively certified.

## Released baseline

- Repository: `ADTrauts/LTC-Manager`, released main `a454b35eeb2e073e26acd67297cf06eecef0f1ec`, including [PR #48](https://github.com/ADTrauts/LTC-Manager/pull/48).
- Production: [vssyl.com](https://vssyl.com), Ready deployment `dpl_8yLQYoedEANPTv6PnJWhgpLGD66Y`. Read-only Vercel metadata confirmed both public domains map to that deployment; `www.vssyl.com` retains its 308 redirect to the apex.
- Canonical Production and synthetic staging have the 12 released migrations. Durable recovery copies were retained before their latest schema update. Closeout did not access or change hosted databases.

## Live scope

| Area | Released behavior |
| --- | --- |
| Security and OWNER authority | Private attachment/Record boundaries, OWNER Catalog publication, per-login Harbor logout/revocation and attributed actions. Retired legacy staff work sessions cannot grant customer workspace authority. |
| Customer operations | Facility and Organization directory/search/pagination, profiles, matching safeguards, canonical Administrator status, retry-safe provisioning, customer invitations/recovery and onboarding/Implementation handoffs. |
| Daily operations | Support and Operations queues, provider/billing/license diagnostics, Postmark and limited Stripe connections. |
| Scheduled attention | The shared five-minute evaluator handles registered operational time boundaries and notification follow-through. Personal browser push is enabled for eligible customer User sessions, with device opt-in; it is not Harbor staff or QuickPIN push. |
| Customer lifecycle | OWNER manual operational pause/reactivation; narrowly approved, customer-requested CSV/Excel Record exports; Administrator offboarding requests and OWNER shared-plan review/acknowledgment. |

Offboarding planning does not cancel billing, terminate access, delete data or schedule closure actions. Exports are limited self-operated Department Records, downloadable by the still-authorized original requesting Administrator within 24 hours of OWNER approval. No export file is retained or emailed.

## Deferred and disabled

- **Scanning:** disabled pending a separately approved private scanner service and its operations. Quarantined files remain unavailable.
- **Internal staff invitations:** disabled pending actual future hires, eligible addresses, roster approval and deliberate activation. Customer invitations remain separate.
- **Independent staff recovery:** disabled pending a distinct eligible approver and approved proof procedure. The sole OWNER cannot approve their own independent recovery.
- **Customer-workspace assistance and grant issuance:** disabled. Broader future-team roles/permissions and assistance rollout remain outside this release.
- Full-Facility/private/vendor exports, automatic closure/billing cancellation/access termination and irreversible deletion/retention workflows are deferred. They require a new scope decision.

Read-only Production environment metadata at closeout showed `CUSTOMER_OFFBOARDING_ENABLED`, `WEB_PUSH_SENDING_ENABLED` and `SCHEDULED_EVALUATION_ENABLED` true for Production. No hosted staff lifecycle or scanner settings were present. Closeout changed no flags, permissions, bindings, domains or deployment.

## Focused closeout verification

The owner reopened missing tests after earlier releases intentionally skipped them. The closeout adds local regression coverage without application features or schema changes.

- **107 tests passed, zero failed or skipped** across 12 focused files: lifecycle PostgreSQL scenarios, staff activation gating, push logic, scheduler behavior, route authorization and customer session revocation.
- The final focused run used repository-supported Node 24.19.0. Clean application and focused test TypeScript checks passed; no fresh application build or deployment was necessary for these documentation/test-only changes.
- The new PostgreSQL scenarios cover OWNER/password requirements; concurrent pause retries with one transition/audit; operational-write denial while paused; reactivation; export approval, original-requester isolation, CSV formula escaping, Excel literal strings, attachment exclusion, exact approval expiry, revocation and vendor-ownership denial; offboarding retry conflicts, cross-Facility isolation, shared-plan versions, append-only audit/matching-receipt rollback, departed Administrator denial and exact-login logout isolation.
- Staff configuration checks demonstrate default-off behavior, complete explicit policy requirements and canonical Production origin/host restrictions. No staff activation or email delivery occurred.
- Two scheduler tests were stale after the approved release. They now expect the five-minute cron, exercise the enable switch, use the current pending-outbox/health contract and verify the current failure response. No scheduler application behavior was changed.
- Tests used a fresh loopback-only PostgreSQL cluster and synthetic identities. All released migrations applied locally. Synthetic append-only evidence and unexpired receipts were retained instead of bypassing protections for cleanup.

This is focused local assurance, not a new full-platform certification. No live app/Production smoke, payments, messages, scanner requests, real device push delivery or manual hosted jobs ran. Prior intentionally skipped CI remains skipped; these local results do not relabel it as passing CI.

## After closeout

Use the released OWNER workflows and address concrete defects if found. Reopen deferred features only through a separate product decision. Documentation/test-only closeout changes do not require a Production deployment and have not been merged or promoted.

Related scope records: [operational pause](HARBOR_CONSOLE_PHASE_5_OPERATIONAL_SUSPENSION.md), [limited exports](HARBOR_CONSOLE_PHASE_5_CUSTOMER_RECORD_EXPORTS.md), [offboarding coordination](HARBOR_CONSOLE_PHASE_5_OFFBOARDING_SCOPE.md), [staff setup](HARBOR_STAFF_PRODUCTION_SETUP.md), [browser push](../deployment/PRODUCTION_BROWSER_PUSH.md), [five-minute scheduler](../deployment/FIVE_MINUTE_SCHEDULED_EVALUATION.md). Their historical draft/testing statements describe their own checkpoints; this closeout records the later released state and bounded additional verification.
