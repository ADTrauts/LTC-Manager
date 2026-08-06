# Dietary V1 Environment Variables

**Product:** LTC Manager  
**Phase:** 8A  
**Rule:** Never commit real secrets. Never share `AUTH_SECRET` across unrelated environments. Never point pilot tools at `ltc_manager`.

---

## Matrix

| Variable | Local | CI | Staging | Pilot production | Required? | Secret? | Rotation | Safe default? |
|----------|-------|----|---------|------------------|-----------|---------|----------|---------------|
| `DATABASE_URL` | Dev DB (`ltc_manager` OK for app only) | Disposable `ltc_ci_*` | Staging DB | Pilot DB | Yes | Yes | With DB credentials | No — must be set |
| `DIRECT_URL` | Same as local DB | Disposable | Staging direct | Pilot direct | Yes for migrate | Yes | With DB credentials | No |
| `AUTH_SECRET` | Dev secret | Synthetic CI secret | Unique staging | Unique production ≥32 chars | Yes | Yes | Invalidates sessions + PIN digests + rate-limit HMAC keys — plan re-auth / PIN re-issue | No unsafe default |
| `NODE_ENV` | unset/`development` for `next dev` | set by Next build | `production` | `production` | Yes in deploy | No | N/A | Production for pilot |
| `OPERATIONAL_ASSIGNMENTS_ENABLED` | often true locally | as needed for gates | `true` | `true` | Yes for Dietary V1 | No | Toggle with change control | Default **false** in code — must set true |
| `OPERATION_ENGINE_ENABLED` | false | false | false | **false** | Yes (keep off) | No | N/A | **false** is safe |
| `TODAYS_WORK_ENABLED` | default true | default | default | default unless approved | No | No | Flag change control | true |
| `TASK_SYNC_ENABLED` | false | false | false | false | No | No | — | false |
| `AI_*` / projection experimental | off | off | off | off | No | Some | — | false / unset |
| `STRIPE_SECRET_KEY` | empty | empty | empty unless testing billing | empty unless billing in scope | No | Yes | Stripe dashboard | empty = billing skipped |
| `STRIPE_WEBHOOK_SECRET` | empty | empty | empty | empty unless Stripe | No | Yes | Stripe | empty |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | empty | empty | empty | empty unless Stripe | No | Public | Stripe | empty |
| `SEED_DEMO_PASSWORD` | local seed only | CI seed | **unset** | **unset** | No | Yes | — | Never on pilot prod |
| `ALLOW_DEMO_SEED_PASSWORD` | local only | CI `1` | **unset** | **unset** | No | No | — | Never on pilot prod |
| `BOOTSTRAP_DATABASE_URL` | disposable / staging | N/A | staging | pilot | Bootstrap only | Yes | — | Must not be `ltc_manager` |
| `FACILITY_DISPLAY_NAME` | — | — | synthetic | Terrace View label | Bootstrap | No | — | Required for bootstrap |
| `FACILITY_TIMEZONE` | — | — | America/New_York | America/New_York | Bootstrap | No | — | America/New_York |
| `FA_EMAIL` / `FA_PASSWORD` / `FA_DISPLAY_NAME` | — | — | synthetic | operator-provided | Bootstrap | Yes (password) | Password rotation via Admin | No defaults |
| `BOOTSTRAP_MARK_ONBOARDING_COMPLETE` | — | — | `1` often | `1` when Admin path ready | Optional | No | — | omit leaves onboarding open |
| `BOOTSTRAP_FORCE` | — | — | rare | rare | Optional | No | — | unset (refuse re-bootstrap) |
| `MAINTENANCE_DATABASE_URL` | disposable | disposable | staging | pilot | Maintenance | Yes | — | Disposable unless pilot flags set |
| `MAINTENANCE_ALLOW_PILOT` | unset | unset | `1` when maintaining staging | `1` when maintaining pilot | Pilot maintenance | No | — | unset (disposable only) |
| `MAINTENANCE_CONFIRM_DATABASE_NAME` | — | — | exact name | exact name | With pilot allow | No | — | must match URL |
| `PILOT_BASE_URL` | — | — | https staging | https pilot | Acceptance | No | — | required for `verify:pilot-environment` |
| `PILOT_EXPECT_DEPLOYED_SHA` | — | — | optional | optional | Soft | No | — | unset skips SHA assert |
| `VERIFY_*` | local verify | CI | N/A | N/A | Verify only | Yes | — | disposable only |
| `TZ` | America/New_York recommended | America/New_York | America/New_York | America/New_York | Soft | No | — | Facility TZ is DB field |

---

## Application runtime (minimum pilot production)

```bash
NODE_ENV=production
DATABASE_URL=…          # runtime (pooler allowed)
DIRECT_URL=…            # migrate/deploy identity
AUTH_SECRET=…           # ≥32 chars, unique
OPERATIONAL_ASSIGNMENTS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
```

Omit Stripe and AI keys unless explicitly approved.

---

## Notes

1. `.env.example` documents local shape; it may point at `ltc_manager` for developer convenience. Pilot tools refuse that name.  
2. Changing `AUTH_SECRET` breaks existing sessions and Quick PIN digests — treat as a coordinated security event.  
3. Feature flags are not remotely readable by design; confirm via host configuration review.  
4. Public health endpoints return only booleans / status strings — never URLs or secrets.  
