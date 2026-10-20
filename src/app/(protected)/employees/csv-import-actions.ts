"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import type { EmployeeCsvActionOutcome, EmployeeCsvPreview, EmployeeCsvResult } from "@/lib/employee-csv-update/types";
import { prisma } from "@/lib/prisma";
import { EmployeeCsvInputError, EMPLOYEE_CSV_MAX_BYTES } from "@/lib/employee-csv-import";
import { confirmEmployeeCsv, previewEmployeeCsv, requireEmployeeCsvAuthority } from "@/lib/employee-csv-update/service";

async function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new EmployeeCsvInputError("Choose a CSV file.");
  if (file.size > EMPLOYEE_CSV_MAX_BYTES) throw new EmployeeCsvInputError("File too large (max 2 MB).");
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > EMPLOYEE_CSV_MAX_BYTES) throw new EmployeeCsvInputError("File too large (max 2 MB).");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new EmployeeCsvInputError("Save this CSV as UTF-8 and upload it again."); }
  const version = formData.get("contractVersion");
  return { text, fileName: file.name, contractVersion: typeof version === "string" ? version : undefined };
}

export async function previewEmployeeCsvAction(formData: FormData): Promise<EmployeeCsvActionOutcome<EmployeeCsvPreview>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again with a password and preview the file." };
  try {
    requireEmployeeCsvAuthority(session);
    return { ok: true, data: await previewEmployeeCsv(prisma, session, await readFile(formData), process.env.AUTH_SECRET ?? "") };
  } catch (error) {
    if (error instanceof EmployeeCsvInputError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function confirmEmployeeCsvAction(formData: FormData): Promise<EmployeeCsvActionOutcome<EmployeeCsvResult>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again with a password and preview the file." };
  try {
    requireEmployeeCsvAuthority(session);
    const token = formData.get("reviewToken");
    if (typeof token !== "string" || !token) throw new EmployeeCsvInputError("Preview the file before confirming updates.");
    const result = await confirmEmployeeCsv(prisma, session, await readFile(formData), token, process.env.AUTH_SECRET ?? "");
    // A cache failure must not hide already committed per-row results or invite an unsafe blind retry.
    if (result.committed) {
      try {
        for (const path of ["/employees", "/employees/points-summary", "/employees/hr-audit", "/employees/separations", "/employees/terminations", "/staffing", "/dashboard", "/employees/import"])
          revalidatePath(path);
      } catch { console.error("employee.csv.cache_revalidation_failed"); }
    }
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof EmployeeCsvInputError) return { ok: false, error: error.message };
    throw error;
  }
}
