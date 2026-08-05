-- Immediate session revocation.
--
-- A signed JWT proves the server issued a session. It does not prove the holder still has the
-- authority the session was issued under, so before this change a termination, role change, or
-- password reset took effect only when the twelve-hour token happened to expire.
--
-- `sessionVersion` is a monotonic counter carried in the token at issuance and compared against
-- the row on every protected request. Incrementing it invalidates every session issued earlier.
--
-- Two counters rather than one table: password sessions are keyed to `User` and PIN sessions to
-- `Employee`, and a PIN identity has no `User` row at all. A separate session table would have to
-- store one row per live session to answer the same question, which means holding session state
-- the product does not otherwise need. A counter on the identity answers it with one integer and
-- one indexed primary-key read that the request already had to perform.
--
-- Additive and safe on existing data: the column defaults to 0 for every existing row, which is
-- also the value a brand-new identity starts at, so nothing has to special-case rows that predate
-- revocation. Tokens minted before this release carry no version claim and are rejected on first
-- use, which is the documented backward-compatibility behavior.
--
-- No index is added. Both columns are only ever read through an existing primary-key lookup and
-- written by primary key, so an index on them would be maintained and never used.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
