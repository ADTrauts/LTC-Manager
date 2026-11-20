# Production browser push preparation — November 20, 2026

Status: prepared for review, sending disabled. The owner authorized setup, no tests, and no merge or promotion without approval. Scanning stays disabled.

## Existing delivery and current preparation

This uses the existing Notifications & Attention engine, personal User subscriptions, durable PushDispatch attempts and the `notifications.external-delivery` evaluator on the released five-minute clock. No additional server, scheduler, provider account, schema or queue is introduced. Only existing wired operational triggers participate. This does not add push delivery to Harbor Support notifications.

One Production-only VAPID key pair and the contact subject `https://vssyl.com` were created in the existing Vercel project. The private key is sensitive and was neither printed nor written to a source file. Production `WEB_PUSH_SENDING_ENABLED` is explicitly **false**. Preview/pilot keys, settings and database bindings are unchanged. Saving these settings does not modify the running deployment snapshot. No messages, subscriptions, app requests or manual jobs were generated.

The draft makes the authenticated public-key and registration endpoints respect the existing sending switch. A prepared key alone must not invite a person to enable a feature that is still held off. Disable, release and logout remain available while sending is paused. Existing subscription revocation and User-session authorization remain authoritative.

## Person-facing behavior

After a separately approved release, a person with a full customer User login can choose **Enable alerts on this device** at `/account/notifications`, then grant browser permission. Quick PIN and Harbor staff sessions cannot register personal push. Permission is never requested automatically. The lock-screen message is generic: “Vssyl” / “Operational attention requires review”; private Facility, Department and source titles are excluded. A click opens the existing authorized Attention view and does not acknowledge the item.

Existing quiet hours, snooze, recipient eligibility, exact Facility access and logout protections still apply. A provider acceptance is not proof of a displayed banner. This setup has not exercised device delivery. No historical notification backlog is backfilled when sending turns on; existing dispatch expiry remains effective.

## Release approval

Review the exact candidate, then separately approve merge, loading `WEB_PUSH_SENDING_ENABLED=true` into a Ready Production candidate and promotion. Retain the compatible prior deployment. No hosted migration is needed. Do not rotate or replace the prepared key pair during release: subscriptions bind to that public key.

Under the owner's no-tests instruction, use compilation and provider configuration evidence only. No browser/app smoke, notification fixtures, messages or manual scheduler invocation is authorized. Skipped checks are not passing checks and repository rules must not be changed.

To pause delivery later, load `WEB_PUSH_SENDING_ENABLED=false` into a deployment and release it; editing a setting alone does not change deployed functions. Keep the shared scheduler running for other domains, retain the keys and subscription history, and leave scanning disabled.

Implementation references: [existing protocol sender](../../src/lib/notifications/push-sender.ts), [personal authorization](../../src/lib/notifications/push-authorization.ts), [Web Push library](https://github.com/web-push-libs/web-push).
