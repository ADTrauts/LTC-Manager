"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createExportRequest, cancelExportRequest, ExportDenied } from "@/lib/customer-record-exports/service";
export type ExportFormState = {
    message: string;
    ok: boolean;
} | null;
export async function requestRecordExportAction(_previous: ExportFormState, form: FormData): Promise<ExportFormState> {
    const s = await getSession();
    if (!s)
        return {
            ok: false, message: "Sign in as the Facility Administrator."
        };
    let choice;
    try {
        choice = JSON.parse(String(form.get("scope") ?? ""));
        if (!choice || typeof choice !== "object")
            throw new Error("Invalid scope");
    }
    catch {
        return {
            ok: false, message: "Choose a Department and Record."
        };
    }
    try {
        await createExportRequest(prisma, s, {
            id: form.get("id"), departmentId: choice.departmentId, recordKey: choice.recordKey, fromDate: form.get("fromDate"), toDate: form.get("toDate"), format: form.get("format")
        });
        revalidatePath("/admin/exports");
        revalidatePath("/console/exports");
        return {
            ok: true, message: "Request submitted for OWNER review."
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
export async function cancelRecordExportAction(_previous: ExportFormState, form: FormData): Promise<ExportFormState> {
    const s = await getSession();
    if (!s)
        return {
            ok: false, message: "Sign in required."
        };
    try {
        await cancelExportRequest(prisma, s, String(form.get("id") ?? ""));
        revalidatePath("/admin/exports");
        revalidatePath("/console/exports");
        return {
            ok: true, message: "Request cancelled; further downloads are unavailable."
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
