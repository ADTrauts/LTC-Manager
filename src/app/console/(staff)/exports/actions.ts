"use server";
import { revalidatePath } from "next/cache";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { decideExportRequest, ExportDenied } from "@/lib/customer-record-exports/service";
import type { ExportFormState } from "@/app/(protected)/admin/exports/actions";
export async function reviewRecordExportAction(_previous: ExportFormState, form: FormData): Promise<ExportFormState> {
    const s = await requireHarborOwner();
    const decision = String(form.get("decision"));
    if (decision !== "APPROVED" && decision !== "DENIED" && decision !== "REVOKED")
        return {
            ok: false, message: "Choose an available decision."
        };
    if (form.get("reviewed") !== "yes")
        return {
            ok: false, message: "Confirm you reviewed the data list and dates."
        };
    try {
        await decideExportRequest(prisma, s, String(form.get("id") ?? ""), Number(form.get("revision")), decision);
        revalidatePath("/console/exports");
        revalidatePath("/admin/exports");
        return {
            ok: true, message: "Export decision recorded."
        };
    }
    catch (e) {
        if (e instanceof ExportDenied)
            return {
                ok: false, message: e.message
            };
        throw e;
    }
}
