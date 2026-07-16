-- Wave 14B: Department Operational Profiles and Room Archetypes
-- Forward-only. Additive tables only; no existing table or data is modified.

-- Enums
CREATE TYPE "OperationalProfileStatus" AS ENUM ('DRAFT', 'CERTIFIED', 'ACTIVE', 'RETIRED');
CREATE TYPE "RoomExperienceExceptionMode" AS ENUM ('ENABLE', 'DISABLE', 'OVERRIDE');

-- Profile (one authored/versioned operational model per facility department)
CREATE TABLE "DepartmentOperationalProfile" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "OperationalProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "baselineKey" TEXT,
    "createdByUserId" TEXT,
    "certifiedByUserId" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalProfile_departmentId_version_key"
    ON "DepartmentOperationalProfile"("departmentId", "version");
CREATE INDEX "DepartmentOperationalProfile_facilityId_departmentId_status_idx"
    ON "DepartmentOperationalProfile"("facilityId", "departmentId", "status");
CREATE INDEX "DepartmentOperationalProfile_departmentId_status_idx"
    ON "DepartmentOperationalProfile"("departmentId", "status");

-- Constitutional rule: at most one ACTIVE profile per facility department.
CREATE UNIQUE INDEX "DepartmentOperationalProfile_one_active_per_department"
    ON "DepartmentOperationalProfile"("facilityId", "departmentId")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "DepartmentOperationalProfile"
    ADD CONSTRAINT "DepartmentOperationalProfile_facilityId_fkey"
    FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentOperationalProfile"
    ADD CONSTRAINT "DepartmentOperationalProfile_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Operational Areas (profile-specific ordered groupings)
CREATE TABLE "DepartmentOperationalArea" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentOperationalArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentOperationalArea_profileId_key_key"
    ON "DepartmentOperationalArea"("profileId", "key");
CREATE INDEX "DepartmentOperationalArea_profileId_sortOrder_idx"
    ON "DepartmentOperationalArea"("profileId", "sortOrder");

ALTER TABLE "DepartmentOperationalArea"
    ADD CONSTRAINT "DepartmentOperationalArea_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Experience placement (catalog Experience key into one Area)
CREATE TABLE "DepartmentAreaExperience" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "experienceKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configurationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentAreaExperience_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentAreaExperience_areaId_experienceKey_key"
    ON "DepartmentAreaExperience"("areaId", "experienceKey");
CREATE INDEX "DepartmentAreaExperience_areaId_sortOrder_idx"
    ON "DepartmentAreaExperience"("areaId", "sortOrder");

ALTER TABLE "DepartmentAreaExperience"
    ADD CONSTRAINT "DepartmentAreaExperience_areaId_fkey"
    FOREIGN KEY ("areaId") REFERENCES "DepartmentOperationalArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Room Archetypes (operational templates for a category of room)
CREATE TABLE "DepartmentRoomArchetype" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRoomArchetype_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentRoomArchetype_profileId_key_key"
    ON "DepartmentRoomArchetype"("profileId", "key");
CREATE INDEX "DepartmentRoomArchetype_profileId_sortOrder_idx"
    ON "DepartmentRoomArchetype"("profileId", "sortOrder");

ALTER TABLE "DepartmentRoomArchetype"
    ADD CONSTRAINT "DepartmentRoomArchetype_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Archetype Experience selection/tuning
CREATE TABLE "DepartmentArchetypeExperience" (
    "id" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "areaExperienceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configurationJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentArchetypeExperience_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentArchetypeExperience_archetypeId_areaExperienceId_key"
    ON "DepartmentArchetypeExperience"("archetypeId", "areaExperienceId");
CREATE INDEX "DepartmentArchetypeExperience_archetypeId_sortOrder_idx"
    ON "DepartmentArchetypeExperience"("archetypeId", "sortOrder");

ALTER TABLE "DepartmentArchetypeExperience"
    ADD CONSTRAINT "DepartmentArchetypeExperience_archetypeId_fkey"
    FOREIGN KEY ("archetypeId") REFERENCES "DepartmentRoomArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentArchetypeExperience"
    ADD CONSTRAINT "DepartmentArchetypeExperience_areaExperienceId_fkey"
    FOREIGN KEY ("areaExperienceId") REFERENCES "DepartmentAreaExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Room-to-archetype binding (one archetype per room per profile)
CREATE TABLE "DepartmentRoomArchetypeBinding" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "unitSpaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRoomArchetypeBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentRoomArchetypeBinding_profileId_unitSpaceId_key"
    ON "DepartmentRoomArchetypeBinding"("profileId", "unitSpaceId");
CREATE INDEX "DepartmentRoomArchetypeBinding_archetypeId_idx"
    ON "DepartmentRoomArchetypeBinding"("archetypeId");
CREATE INDEX "DepartmentRoomArchetypeBinding_unitSpaceId_idx"
    ON "DepartmentRoomArchetypeBinding"("unitSpaceId");

ALTER TABLE "DepartmentRoomArchetypeBinding"
    ADD CONSTRAINT "DepartmentRoomArchetypeBinding_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentRoomArchetypeBinding"
    ADD CONSTRAINT "DepartmentRoomArchetypeBinding_archetypeId_fkey"
    FOREIGN KEY ("archetypeId") REFERENCES "DepartmentRoomArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentRoomArchetypeBinding"
    ADD CONSTRAINT "DepartmentRoomArchetypeBinding_unitSpaceId_fkey"
    FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sparse room-level Experience exception
CREATE TABLE "DepartmentRoomExperienceException" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "unitSpaceId" TEXT NOT NULL,
    "areaExperienceId" TEXT NOT NULL,
    "mode" "RoomExperienceExceptionMode" NOT NULL,
    "configurationJson" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentRoomExperienceException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentRoomExperienceException_profile_room_experience_key"
    ON "DepartmentRoomExperienceException"("profileId", "unitSpaceId", "areaExperienceId");
CREATE INDEX "DepartmentRoomExperienceException_profileId_unitSpaceId_idx"
    ON "DepartmentRoomExperienceException"("profileId", "unitSpaceId");
CREATE INDEX "DepartmentRoomExperienceException_areaExperienceId_idx"
    ON "DepartmentRoomExperienceException"("areaExperienceId");

ALTER TABLE "DepartmentRoomExperienceException"
    ADD CONSTRAINT "DepartmentRoomExperienceException_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "DepartmentOperationalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentRoomExperienceException"
    ADD CONSTRAINT "DepartmentRoomExperienceException_unitSpaceId_fkey"
    FOREIGN KEY ("unitSpaceId") REFERENCES "UnitSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentRoomExperienceException"
    ADD CONSTRAINT "DepartmentRoomExperienceException_areaExperienceId_fkey"
    FOREIGN KEY ("areaExperienceId") REFERENCES "DepartmentAreaExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
