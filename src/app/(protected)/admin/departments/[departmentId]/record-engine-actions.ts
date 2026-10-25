"use server";

import { revalidatePath } from "next/cache";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { scheduleRecordEngineChange } from "@/lib/canonical-logs/record-engine-store";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

export async function scheduleRecordEngineAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.facilityId || !hasAtLeastRole(session.role, "FACILITY_ADMINISTRATOR")) {
    throw new Error("Only a facility administrator can change the Record engine.");
  }
  if (String(formData.get("confirm")) !== "yes") {
    throw new Error("Confirm the change before saving it.");
  }
  const departmentId = String(formData.get("departmentId") ?? "");
  const mode = String(formData.get("mode") ?? "");
  const effectiveFromServiceDate = String(formData.get("effectiveFromServiceDate") ?? "");
  if (mode !== "LEGACY" && mode !== "CANONICAL") {
    throw new Error("Choose canonical Records or the previous Logs.");
  }
  if (!isCanonicalLogsEnabled() && mode === "CANONICAL") {
    throw new Error("This deployment is not capable of canonical Records.");
  }
  const timezone = await loadFacilityTimezone(prisma, session.facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone));
  const activeAttachmentCount = await prisma.logAttachment.count({
    where: { facilityId: session.facilityId, departmentId, status: "ACTIVE" },
  });
  try {
    await scheduleRecordEngineChange({
      facilityId: session.facilityId,
      departmentId,
      mode,
      effectiveFromServiceDate,
      todayKey,
      actorUserId: session.uid,
      actorLabel: session.name,
      activeAttachmentCount,
      attachmentSetupErrorCount: 0,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "record-engine",
        operation: "schedule",
        facilityId: session.facilityId,
        departmentId,
        message: error instanceof Error ? error.message : "schedule failed",
      }),
    );
    throw error;
  }
  revalidatePath(`/admin/departments/${departmentId}`);
}
