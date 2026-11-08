"use client";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { HEADERS, safeCsvCell, type Dataset } from "@/lib/setup-imports/public-contract";
import type { Operation, Outcome, Preview, Results } from "@/lib/setup-imports/contract";
import { previewSetupImportAction, confirmSetupImportAction, reconcileSetupImportAction, sendSetupActivationAction, sendPendingSetupActivationsAction } from "@/app/(protected)/employees/bulk-setup/actions";

const names: Record<Dataset,string> = { locations: "Facility locations", workforce: "Workforce create / reuse", employee_departments: "Employee–Department relationships", department_locations: "Department–location responsibilities", assets: "Asset registry" };
function download(name: string, text: string) { const url = URL.createObjectURL(new Blob([text],{ type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
const unwrap = <T,>(r: Outcome<T>): T => { if (!r.ok) throw new Error(r.error); return r.data; };
export function SetupImportWorkspace({ facilityId, actorKey, datasets, initialDataset, departments, embedded = false }: { facilityId: string; actorKey: string; datasets: Dataset[]; initialDataset: Dataset; departments: Array<{ id: string; key: string; name: string }>; embedded?: boolean }) {
  const [dataset,setDataset] = useState(initialDataset), [scope,setScope] = useState("");
  const [file,setFile] = useState<File | null>(null), [preview,setPreview] = useState<Preview | null>(null), [results,setResults] = useState<Results | null>(null);
  const [accounts,setAccounts] = useState<number[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null), [unknown,setUnknown] = useState(false);
  const key = `vssyl.setup-import/1/${actorKey}/${facilityId}/${dataset}`;
  const subscribe = useCallback((notify: () => void) => { window.addEventListener("vssyl.import.changed",notify); return () => window.removeEventListener("vssyl.import.changed",notify); },[]);
  const snapshot = useCallback(() => { try { return sessionStorage.getItem(key); } catch { return null; } },[key]);
  const raw = useSyncExternalStore(subscribe,snapshot,() => null);
  let saved: { batchId: string; reviewToken: string } | null = null;
  try { const v = raw ? JSON.parse(raw) : null; if (typeof v?.batchId === "string" && typeof v.reviewToken === "string") saved=v; } catch { /* invalid browser hints are not authority */ }
  function remember(p: Preview) { try { sessionStorage.setItem(key,JSON.stringify({ batchId: p.batchId, reviewToken: p.reviewToken })); window.dispatchEvent(new Event("vssyl.import.changed")); } catch { setError(`Browser recovery storage unavailable. Keep this page open and record batch ${p.batchId}.`); } }
  async function run(work: () => Promise<void>, mutation = false) {
    setBusy(true); setError(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed. Reconcile before retrying."); if (mutation) setUnknown(true); }
    finally { setBusy(false); }
  }
  async function doPreview() {
    if (!file) { setError("Choose a CSV file."); return; }
    await run(async () => { const fd = new FormData(); fd.set("file",file); fd.set("dataset",dataset); fd.set("expectedFacilityId",facilityId); fd.set("scopeDepartmentId",scope); const p=unwrap(await previewSetupImportAction(fd)); setPreview(p); setResults(null); setAccounts([]); setUnknown(false); remember(p); });
  }
  async function reconcile() {
    const batchId = preview?.batchId || saved?.batchId;
    if (!batchId) return;
    await run(async () => { setResults(unwrap(await reconcileSetupImportAction(batchId))); setUnknown(false); });
  }
  async function confirm() {
    const token = preview?.reviewToken || saved?.reviewToken;
    if (!token) return;
    await run(async () => {
      if (results) { const latest=unwrap(await reconcileSetupImportAction(results.batchId)); setResults(latest); if (latest.running) throw new Error("Another request is running. Reconcile again before continuing."); }
      const fd = new FormData(); if (file) fd.set("file",file); fd.set("reviewToken",token); fd.set("expectedFacilityId",facilityId); accounts.forEach(r => fd.append("confirmedAccountRow",String(r)));
      setResults(unwrap(await confirmSetupImportAction(fd))); setUnknown(false);
    },true);
  }
  const required = preview ? preview.rows.filter(r => r.action !== "blocked" && r.requiresAccountConfirmation).map(r => r.row) : results?.rows.filter(r => !r.result || !["committed","reused"].includes(r.result.status)).filter(r => r.requiresAccountConfirmation).map(r => r.row) ?? [];
  const reviewedRows = preview?.rows ?? [];
  function describe(op: Operation) {
    const department = departments.find(d => d.id === op.departmentId);
    return [op.roleType && `Platform role: ${op.roleType}`, op.employmentType && `Work arrangement: ${op.employmentType}`, op.departmentId && `Department: ${department?.name || ""} (${op.departmentId})`, op.employeeId && `Employee: ${op.employeeId}`, op.membership && `Membership: ${op.membership}`, op.teamId && `Team: ${op.teamId}`, op.jobRoleId && `Job Role: ${op.jobRoleId}`, op.jobTitleId && `Job Title: ${op.jobTitleId}`, op.locationId && `${op.locationType}: ${op.locationId}`, op.responsibilityKind && `Responsibility: ${op.responsibilityKind}`, op.unitId && `Location: ${op.unitId}`, op.spaceId && `Room: ${op.spaceId}`, op.asset && `Asset: ${op.asset.name}; code ${op.asset.assetCode || "—"}; serial ${op.asset.serialNumber || "—"}; Facility number ${op.asset.facilityAssetNumber || "—"}; status ${op.asset.status}`].filter(Boolean).join(" · ");
  }
  const equipmentOnly = embedded && datasets.length === 1 && dataset === "assets";
  const intro = equipmentOnly
    ? "Each row is one piece of equipment. Name the floor, neighborhood, and room, and the Department that looks after it. Preview checks the file. Nothing is saved until you confirm."
    : dataset === "locations" ? "Canonical Facility structure: optional building, required floor, neighborhood and optional location details. Preserve existing physical identity and settings. Examples are separate from import rows." : dataset === "workforce" ? "New rows require a real email, names, roleType, employmentType and primaryDepartment. Existing people are reused without patches. Account activation and eligible PIN enrollment remain visible pending tasks. No password/PIN columns are accepted." : dataset === "employee_departments" ? "One additive membership per row: PRIMARY or ADDITIONAL. Optional Team and Job Role IDs are scoped to that Department. Blank values preserve other relationships; changing/removing existing primary or role assignments requires People." : dataset === "department_locations" ? "One Department/location pair per row. Use UNIT or ROOM and the canonical ID. UNIT kind is PRIMARY, BACKUP or SUPPORT; ROOM kind stays blank. Shared places remain one physical record." : "Canonical Asset CSV: exact Floor → neighborhood → space, an explicit responsible Department or unambiguous Unit default, and assetCode/serialNumber/facilityAssetNumber. Current Asset Builder authority is required. Import creates registry identity, never operational Work or publication.";
  return <div className="space-y-5" data-testid="setup-import-workspace">
    <div className={equipmentOnly ? "space-y-4" : "app-card space-y-3"}>
      <label className={equipmentOnly ? "sr-only" : "block"}>CSV dataset<select className="app-input ml-2" value={dataset} disabled={busy} onChange={e => { setDataset(e.target.value as Dataset); setPreview(null); setResults(null); setFile(null); setAccounts([]); setUnknown(false); setError(null); }}>{datasets.map(d => <option key={d} value={d}>{names[d]}</option>)}</select></label>
      <p className="text-sm text-zinc-600">{intro}</p>
      <label className={equipmentOnly ? "block text-sm font-medium text-zinc-800" : "block"}>{equipmentOnly ? "Department" : "Department scope"}{equipmentOnly ? <span className="mt-1 block font-normal text-zinc-500">Leave this open unless every row belongs to one Department.</span> : null}<select value={scope} disabled={busy || Boolean(preview || results)} onChange={e => setScope(e.target.value)} className={equipmentOnly ? "app-input mt-2 block w-full font-normal" : "app-input ml-2"}><option value="">{equipmentOnly ? "Every Department you can register" : "Authorized Facility installations"}</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <button type="button" className="app-button" onClick={() => download(`${dataset}-v1.csv`,`${HEADERS[dataset].join(",")}\n`)}>Download CSV template</button>
      <label className={equipmentOnly ? "block text-sm font-medium text-zinc-800" : "block"}>CSV file<input key={dataset} type="file" className={equipmentOnly ? "mt-2 block w-full text-sm font-normal" : "mt-2 block"} accept=".csv,text/csv" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setResults(null); setAccounts([]); setUnknown(false); }} /></label>
      <button type="button" disabled={!file || busy} className="app-button app-accent-button text-white" onClick={() => void doPreview()}>Preview CSV — no mutations</button>
      <p className="text-sm text-zinc-500">{equipmentOnly ? "UTF-8 CSV, up to 2 MB and 2,000 rows. The template has headers only. Extra columns and formulas are rejected." : "UTF-8 CSV only, 2 MB; workforce 500 rows, other datasets 2,000. Templates contain headers only. For a combined XLSX, use the onboarding workbook. Unknown/credential/lifecycle columns and formulas are rejected."}</p>
    </div>
    {error ? <p role="alert" className="rounded border border-red-300 p-3">{error}</p> : null}
    {busy ? <p role="status">Working… results are recorded per row.</p> : null}
    {saved && !preview && !results ? <div className="app-card"><p>Saved review/batch: {saved.batchId}. Reconcile before retrying an interrupted request.</p><button type="button" className="app-button" disabled={busy} onClick={() => void reconcile()}>Recover saved batch</button></div> : null}
    {preview ? <div className="app-card space-y-3"><h2 className="text-lg font-semibold">Review {names[dataset]}</h2><p>Batch {preview.batchId} · expires {new Date(preview.expiresAt).toLocaleString()}</p><p className="text-sm">Preview itself performs no mutations. After confirmation, read the durable receipts below for actual outcomes. Confirmation rechecks authorization, source, identities, licensing and dependencies under transaction locks. Each row commits independently; there is no file-wide rollback.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_th]:p-2 [&_td]:p-2"><thead><tr><th>Source row / reference</th><th>Person / place</th><th>Planned</th><th>Review</th></tr></thead><tbody>{reviewedRows.map(r => <tr key={r.row} className="border-t"><td>{r.row} / {r.ref}</td><td>{r.label}</td><td>{r.action}</td><td>{r.message}{r.operation ? <p className="mt-2 text-sm">{describe(r.operation)}</p> : null}{r.requiresAccountConfirmation && r.action !== "blocked" ? <label className="block py-2"><input type="checkbox" checked={accounts.includes(r.row)} onChange={() => setAccounts(a => a.includes(r.row) ? a.filter(x => x !== r.row) : [...a,r.row])} /> I confirm the existing account for row {r.row}: {r.label} ({r.requiresAccountConfirmation})</label> : null}</td></tr>)}</tbody></table></div>
    </div> : null}
    {unknown ? <p role="alert">Outcome unknown. Do not repeat creates. Reconcile the durable batch before retrying; earlier rows may already be committed.</p> : null}
    {(preview || results) ? <div className="flex flex-wrap gap-3"><button type="button" className="app-button" disabled={busy} onClick={() => void reconcile()}>Reconcile saved results</button><button type="button" className="app-button app-accent-button text-white" disabled={busy || unknown || Boolean(results?.running) || required.some(r => !accounts.includes(r)) || (!results && !reviewedRows.some(r => r.action !== "blocked"))} onClick={() => void confirm()}>{results ? "Continue / retry remaining reviewed rows (up to 25)" : "Confirm reviewed import (up to 25 rows)"}</button><button type="button" disabled={busy} className="app-button" onClick={() => { setPreview(null); setResults(null); setUnknown(false); }}>Back to file / fresh preview</button></div> : null}
    {results ? <div className="app-card space-y-3" data-testid="setup-import-results"><h2 className="text-lg font-semibold">Durable results</h2><p aria-label="Outcome counts">{["committed","reused","blocked","failed","unknown"].map(status => `${status}: ${results.rows.filter(r => (r.result?.status || "unknown") === status).length}`).join(" · ")}</p><p>Batch {results.batchId}</p><p>{results.running ? "Execution still running. Reconcile again before retrying." : results.message || "Each result is independent. A row without a receipt is unknown or not yet attempted; no file-wide rollback is claimed."}</p>
      {!preview ? results.rows.filter(r => r.requiresAccountConfirmation && (!r.result || !["committed","reused"].includes(r.result.status))).map(r => <label key={r.row} className="block"><input type="checkbox" checked={accounts.includes(r.row)} onChange={() => setAccounts(a => a.includes(r.row) ? a.filter(x => x !== r.row) : [...a,r.row])} /> I confirm the existing account for row {r.row}: {r.label} ({r.requiresAccountConfirmation})</label>) : null}
      <button type="button" className="app-button" onClick={() => download(`import-${results.batchId}-results.csv`,[["row","reference","label","outcome","message","targetIds"],...results.rows.map(r => [String(r.row),r.ref,r.label,r.result?.status || "unknown",r.result?.message || "No committed receipt",JSON.stringify(r.result?.targetIds || {})])].map(row => row.map(safeCsvCell).join(",")).join("\n"))}>Download result receipts CSV</button>
      {dataset === "workforce" ? <button className="app-button" type="button" disabled={busy || results.running} onClick={() => void run(async () => { setResults(unwrap(await sendPendingSetupActivationsAction(results.batchId))); },true)}>Send pending activation invitations (up to 25)</button> : null}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_th]:p-2 [&_td]:p-2"><thead><tr><th>Row</th><th>Person / place</th><th>Outcome</th><th>Evidence / next step</th></tr></thead><tbody>{results.rows.map(r => <tr key={r.row} className="border-t"><td>{r.row}</td><td>{r.label}</td><td>{r.result?.status || "unknown / not yet attempted"}</td><td>{r.result?.message || "Reconcile before retrying."}{r.enrollment ? <p>Account: {r.enrollment.account} · PIN: {r.enrollment.pin}</p> : null}{r.result?.targetIds.employeeId ? <Link className="underline" href={`/employees#employee-${r.result.targetIds.employeeId}`}>Open employee / existing enrollment tools</Link> : null}{r.enrollment?.account === "activation_pending" ? <div><p>Activation delivery: {r.delivery?.status || "not sent / unknown"}</p><button type="button" className="app-button" disabled={busy || results.running} onClick={() => void run(async () => { setResults(unwrap(await sendSetupActivationAction({ batchId: results.batchId, row: r.row }))); },true)}>Send / retry activation for row {r.row}</button></div> : null}</td></tr>)}</tbody></table></div>
    </div> : null}
  </div>;
}
