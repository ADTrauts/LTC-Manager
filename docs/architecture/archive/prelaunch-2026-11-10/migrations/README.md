# Historical parallel-branch migrations

The parallel People & Coverage migration was not applied to the retained production database. It adds Coverage `spaceId` before the already applied November 9 migration and drops Team room membership contrary to the November 10 product-owner workflow contract. It is archived byte-for-byte, not used as an active migration on either the 189-migration production database or the transitional local test chain.

The consolidation will replace the entire old chain with a verified empty-database baseline after canonical ownership/retirement is settled. This archive does not mark a baseline as applied, edit production receipts, or claim the transitional 189-file chain is the final clean schema.
