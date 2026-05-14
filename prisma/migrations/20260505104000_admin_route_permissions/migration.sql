-- Add role activation and database-managed route permissions.
ALTER TABLE "Role"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AppRoute" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "pathPrefix" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "navVisible" BOOLEAN NOT NULL DEFAULT true,
    "navOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoleRoutePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "appRouteId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleRoutePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppRoute_key_key" ON "AppRoute"("key");
CREATE UNIQUE INDEX "AppRoute_pathPrefix_key" ON "AppRoute"("pathPrefix");
CREATE UNIQUE INDEX "RoleRoutePermission_roleId_appRouteId_key" ON "RoleRoutePermission"("roleId", "appRouteId");
CREATE INDEX "RoleRoutePermission_roleId_idx" ON "RoleRoutePermission"("roleId");
CREATE INDEX "RoleRoutePermission_appRouteId_idx" ON "RoleRoutePermission"("appRouteId");

ALTER TABLE "RoleRoutePermission"
ADD CONSTRAINT "RoleRoutePermission_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleRoutePermission"
ADD CONSTRAINT "RoleRoutePermission_appRouteId_fkey"
FOREIGN KEY ("appRouteId") REFERENCES "AppRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
