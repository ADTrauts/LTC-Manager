-- One revoked full User credential, identified by the JWT jti. Not the token itself.
CREATE TABLE "RevokedUserSession" (
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedUserSession_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RevokedUserSession_userId_idx" ON "RevokedUserSession"("userId");

CREATE INDEX "RevokedUserSession_expiresAt_idx" ON "RevokedUserSession"("expiresAt");

ALTER TABLE "RevokedUserSession" ADD CONSTRAINT "RevokedUserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
