"use server";
import { revalidatePath } from "next/cache";
import { consoleActor } from "@/lib/implementation/request-actor";
import { performImplementationAction, type ActionResult } from "@/lib/implementation/action";
import { ImplementationError } from "@/lib/implementation/contract";
export async function implementationStaffAction(data: FormData): Promise<ActionResult> {
  try {
    const result = await performImplementationAction(await consoleActor(),data);
    try {
      const facilityId = String(data.get("expectedFacilityId"));
      revalidatePath(`/console/customers/${facilityId}/implementation`);
      revalidatePath(`/console/customers/${facilityId}/lifecycle`);
      revalidatePath(`/console/customers/${facilityId}`);
      revalidatePath("/console");
      revalidatePath("/console/customers");
      revalidatePath("/console/operations");
      if (data.get("command") === "rescan") {
        const attachmentId = data.get("attachmentId");
        if (typeof attachmentId === "string" && attachmentId) {
          revalidatePath(`/console/operations/scans/${encodeURIComponent(attachmentId)}`);
        }
      }
    } catch { /* Durable results remain authoritative. */ }
    return result;
  } catch (error) { return { ok: false, error: error instanceof ImplementationError ? error.message : "Request outcome could not be confirmed. Reload and reconcile before retrying." }; }
}
