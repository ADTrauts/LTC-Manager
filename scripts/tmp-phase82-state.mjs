import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const defs = await prisma.catalogLogDefinition.findMany({
  where: { stableKey: { in: ["kitchen_sanitation_audit", "sanitizer_reading_log", "opening_checklist", "cooler_temperature_log"] } },
  select: {
    stableKey: true,
    version: true,
    status: true,
    purposeType: true,
    passingScore: true,
    criticalFailureForcesFailure: true,
    sectionsJson: true,
    repeatingGroupsJson: true,
    calculationsJson: true,
    fields: {
      select: {
        fieldKey: true,
        label: true,
        fieldType: true,
        isRequired: true,
        unitLabel: true,
        minNumber: true,
        maxNumber: true,
        scoreWeight: true,
        critical: true,
        sectionKey: true,
        correctiveActionRequired: true,
      },
      orderBy: { displaySequence: "asc" },
    },
  },
});
const records = await prisma.operationalEvidenceRecord.findMany({
  where: { departmentId: "cmu0hzhmb0001xw5kuu6vemum" },
  select: {
    id: true,
    status: true,
    outOfStandard: true,
    followsRecordId: true,
    templateStableKey: true,
    templateName: true,
    operationalDate: true,
    recordedAt: true,
  },
});
console.log(JSON.stringify({ defs, records }, null, 2));
await prisma.$disconnect();
