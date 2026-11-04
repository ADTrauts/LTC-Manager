# Employee Builder — role architecture audit

**Status:** audit only. November 4, 2026. Not an approved schema.

Read [ROLE_ARCHITECTURE_AUDIT_2026-11-04.md](./ROLE_ARCHITECTURE_AUDIT_2026-11-04.md).

The proposed Department → Team → Role → Employee tree is a view to test, not a database model. Operational roles stay in `OPERATIONAL_ROLE_REGISTRY`. Platform `RoleKey` stays authorization. Do not implement the migration sequence until the open decisions in that audit are accepted.
