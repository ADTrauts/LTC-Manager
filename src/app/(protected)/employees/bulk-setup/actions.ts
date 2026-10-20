"use server";
import { revalidatePath } from "next/cache";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { resolveRequestOrigin } from "@/lib/billing/request-origin";
import { DATASETS, ImportError, type Dataset, type Outcome, type Preview, type Results } from "@/lib/setup-imports/contract";
import { liveActor } from "@/lib/setup-imports/authority";
import { previewImport, confirmImport, getImportResults } from "@/lib/setup-imports/service";
import { deliverImportActivation } from "@/lib/setup-imports/activation";

async function readFile(data: FormData, optional = false) {
  const file = data.get("file");
  if (!(file instanceof File)) {
    if (optional && file === null) return {};
    throw new ImportError("Choose this dataset's CSV file.");
  }
  if (!file.size) throw new ImportError("The supplied CSV file is empty. Choose the reviewed file or omit it to resume stored intent.");
  if (!file.name.toLowerCase().endsWith(".csv") || file.size > 2_000_000) throw new ImportError("Use a CSV file no larger than 2 MB here. Use Combined onboarding workbook for XLSX.");
  let text: string;
  try { text = new TextDecoder("utf-8",{ fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); }
  catch { throw new ImportError("CSV must be valid UTF-8 text."); }
  return { text, fileName: file.name };
}
function message(error: unknown) { return error instanceof ImportError ? error.message : "Request could not be completed. Reconcile durable results before retrying."; }
export async function previewSetupImportAction(data: FormData): Promise<Outcome<Preview>> {
  try {
    const session = await requireFacilitySession();
    const dataset = String(data.get("dataset")) as Dataset;
    if (!(DATASETS as readonly string[]).includes(dataset)) throw new ImportError("Choose a supported dataset.");
    await liveActor(prisma,session,String(data.get("expectedFacilityId")),dataset);
    const file = await readFile(data);
    return { ok: true, data: await previewImport(prisma,session,{ dataset, text: file.text!, fileName: file.fileName!, expectedFacilityId: String(data.get("expectedFacilityId")), scopeDepartmentId: String(data.get("scopeDepartmentId") || "") || null }) };
  } catch (error) { return { ok: false, error: message(error) }; }
}
export async function confirmSetupImportAction(data: FormData): Promise<Outcome<Results>> {
  try {
    const session = await requireFacilitySession();
    const file = await readFile(data,true);
    const results = await confirmImport(prisma,session,{ reviewToken: String(data.get("reviewToken")), expectedFacilityId: String(data.get("expectedFacilityId")), ...file, confirmedAccountRows: data.getAll("confirmedAccountRow").map(Number) });
    for (const path of ["/employees","/assets","/assets/builder","/admin/facility/builder"]) { try { revalidatePath(path); } catch { /* A cache error never obscures committed receipts. */ } }
    return { ok: true, data: results };
  } catch (error) { return { ok: false, error: message(error) }; }
}
export async function reconcileSetupImportAction(batchId: string): Promise<Outcome<Results>> {
  try { return { ok: true, data: await getImportResults(prisma,await requireFacilitySession(),batchId) }; }
  catch (error) { return { ok: false, error: message(error) }; }
}
export async function sendSetupActivationAction(input: { batchId: string; row: number }): Promise<Outcome<Results>> {
  try {
    const session = await requireFacilitySession();
    await deliverImportActivation(prisma,session,{ ...input, origin: await resolveRequestOrigin() });
    return { ok: true, data: await getImportResults(prisma,session,input.batchId) };
  } catch (error) { return { ok: false, error: message(error) }; }
}
export async function sendPendingSetupActivationsAction(batchId: string): Promise<Outcome<Results>> {
  try {
    const session = await requireFacilitySession();
    const before = await getImportResults(prisma,session,batchId);
    if (before.running) throw new ImportError("Execution is running. Reconcile before sending activation invitations.");
    const origin = await resolveRequestOrigin();
    const pending = before.rows.filter(r => r.result?.status === "committed" && r.enrollment?.account === "activation_pending" && r.delivery?.status !== "sent").slice(0,25);
    for (const row of pending) await deliverImportActivation(prisma,session,{ batchId, row: row.row, origin });
    return { ok: true, data: await getImportResults(prisma,session,batchId) };
  } catch (error) { return { ok: false, error: message(error) }; }
}
