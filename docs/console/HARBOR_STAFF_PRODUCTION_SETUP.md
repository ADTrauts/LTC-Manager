# Internal staff invitations and independent recovery — November 20, 2026

Status: Production implementation draft, activation pending. The owner clarified that this work prepares **Vssyl's internal staff** for future hires. The existing sole OWNER remains unchanged. There are no staff recipients or independent recovery approvers designated yet. Customer Facility Administrator/employee invitations and recovery remain separate existing workflows.

The owner authorized implementation without tests, retaining scanning disabled and requiring approval before merge or promotion. No staff identity, roster entry, passkey, recovery case, application session or customer record was created by preparation. No email or push was sent. No hosted lifecycle mode, allowlist, invitation/recovery switch or database setting was changed. The new paths are unavailable on the currently released source.

## Production boundary and initial OWNER enrollment

The existing synthetic slice stays restricted to disposable loopback operation. The new Production configuration requires `HARBOR_STAFF_LIFECYCLE_MODE=production`, Vercel Production, and the exact configured origin `https://vssyl.com`. Command POSTs require the exact Origin and Host; Preview/pilot deployments never accept this mode. There is no Production synthetic mailbox or test-domain bypass.

`/console/staff` composes a read-only, paginated staff/invitation projection for designated OWNER administrators and a separate pending-recovery projection for designated reviewers. It exposes no tokens, private keys, passwords, credential material or raw proof documents. Live staff authority is revalidated after the read. Ordinary Members see their own passkey status only unless explicitly designated as recovery reviewers. The service worker does not intercept Console requests.

The existing sole OWNER can enroll a **first** passkey using the current signed login, current password and verified authenticator registration. The configured OWNER ID must be both roster approver and administrator. The transaction refuses existing passkeys, multiple active owners, stale/revoked sessions, a mismatched login/challenge or an expired/used challenge. It adds the initial OWNER's roster entry, stores the passkey, audits enrollment and increments the session version atomically; the person signs in again. This is initial enrollment, not credential replacement, bootstrap recovery or a self-approved recovery exception. Production bootstrap ticket consumption and OWNER authority/succession changes remain unavailable.

Once an identity has an enrolled passkey, both sign-in and all shared live session readers require password-plus-passkey authority. Pausing invitations/recovery does not restore password-only access. A missing/misconfigured lifecycle origin fails closed for enrolled identities. Preserve the Production lifecycle mode/origin during a pause; use the separate invitation/recovery switches instead. Any future rollback to an older password-only verifier requires separate review.

## Invitations

The Production switch `HARBOR_STAFF_INVITATIONS_ENABLED` defaults false. Every address must be listed exactly in `HARBOR_STAFF_LIFECYCLE_ALLOWED_EMAILS`; there is no broad domain/wildcard permission. A designated OWNER roster approver must then approve the address using a fresh, login-bound passkey ceremony. A designated OWNER administrator separately sends the invitation using another action-bound ceremony.

Invitations expire in 24 hours. Only token hashes persist. A new invitation supersedes earlier unused invitations. Activation checks current allowlist/roster, live issuer authority and issuer session version, unused/unexpired intent and verified new passkey. It creates a MEMBER with a password and passkey in one transaction. No OWNER role is selectable. Failed email delivery closes the undelivered intent and records a failure; a fresh invitation can be issued. Removing an address from the allowlist blocks its outstanding enrollment intents.

The existing Postmark transactional sender delivers plain-text messages only after an explicit future command. Tokens are URL fragments, removed from the address bar after client hydration and kept only in component memory. They never enter server request URLs, access logs or server-rendered HTML. Opening the page performs no verification, consumes no token and sends no email. `/console/staff-access` performs enrollment/recovery only through explicit same-origin POSTs. Provider error bodies are not exposed or persisted. Messages link to the canonical Production origin only.

## Independent recovery

`HARBOR_STAFF_RECOVERY_ENABLED` defaults false. Activation additionally requires an explicit independent-approver ID set, an approved procedure reference in `HARBOR_STAFF_LIFECYCLE_RECOVERY_PROOF_POLICY`, eligible addresses and configured transactional email. An approver must have a separate active, roster-backed, passkey-enrolled staff identity; MEMBER authority is sufficient and does not grant OWNER/customer-account ownership.

Recovery requests return a uniform acceptance and are account-rate-limited. The 30-minute mailbox token verifies the address, not independent identity proof. Routine recovery may use an existing passkey, with enrollment bound to the same browser and rechecked within five minutes. Sole-OWNER recovery always requires independent approval, even if an existing passkey is available. A fresh passkey assertion from a configured reviewer approves a specific case with a `CASE-…` evidence reference; the audit records requester/approver attribution and the approved procedure reference. The requester cannot approve their own recovery. Approval is rechecked against the reviewer's active identity, enrolled factor, configured authority and session version at credential replacement.

Replacement consumes the intent, replaces credentials, invalidates earlier staff logins and records the completion atomically. A token-free credential-change notice is sent afterward; notice failure is recorded without undoing a completed recovery. Logout receipts and their expiry-based retention protections remain independent and unchanged. Existing customer sessions remain separate.

## Activation decisions retained

No actual staff is required to continue unrelated work. Leave allowlists empty, both issuance switches false and hosted lifecycle mode unset for this draft. Before later activation:

1. Approve exact roster approver/administrator identities and complete the current OWNER's deliberate first enrollment without removing existing access prematurely.
2. Name eligible internal staff addresses. Configure only those addresses, approve their roster entries, and enable invitations only for the separately approved release.
3. Name the independent reviewer, enroll that separate identity, and approve the proof-verification/case-custody procedure. Keep independent recovery off until then. The sole OWNER is never substituted as their own independent approver.

No new schema/migration is introduced: this reuses the existing staff roster, passkey, intent, challenge and lifecycle audit tables already in the canonical schema. No hosted database operation is part of this preparation. Merge and promotion need the exact candidate's approval. No repository rules are changed; `[skip ci]` is used when publishing, and skipped checks are not passing checks.

Source compilation and code inspection are the only validation authorized in this batch. **No tests, browser/app smoke, synthetic messages, live enrollment, recovery operation or manual job invocation.** Runtime behavior remains unverified. [WebAuthn browser API](https://simplewebauthn.dev/docs/13.3.x/packages/browser).
