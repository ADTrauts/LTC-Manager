"use server";
import { revalidatePath } from "next/cache";
import { customerActor } from "@/lib/implementation/request-actor";
import { performImplementationAction, type ActionResult } from "@/lib/implementation/action";
import { ImplementationError } from "@/lib/implementation/contract";
export async function implementationCustomerAction(data: FormData): Promise<ActionResult> {
  try {
    const result = await performImplementationAction(await customerActor(),data);
    try { revalidatePath("/admin/billing/implementation","layout"); } catch { /* Durable results remain authoritative. */ }
    return result;
  } catch (error) { return { ok: false, error: error instanceof ImplementationError || error instanceof Error && error.name === "ImportError" ? error.message : "Request outcome could not be confirmed. Reload and reconcile before retrying." }; }
}
