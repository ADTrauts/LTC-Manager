"use client";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { startBillingCheckoutAction, addBillingDepartmentsAction, type BillingActionState } from "@/app/(protected)/admin/billing/actions";
import type { SetupWorkspace } from "@/lib/onboarding/workspace";
import { readSetupDraft, setupDraftKey, SETUP_VIEWS, type SetupView, type SetupDraft } from "@/lib/onboarding/draft";

type Json<T> = T extends Date ? string : T extends readonly (infer U)[] ? Json<U>[] : T extends object ? { [K in keyof T]: Json<T[K]> } : T;
type Workspace = Json<SetupWorkspace>;
const initialBilling: BillingActionState = { error: null };
const viewLabels: Record<SetupView, string> = { site: "Site and administrator", products: "Choose Products", builders: "Prepare in Build", people: "Invite managers" };
const statusCopy: Record<string, string> = {
  NOT_LICENSED: "No licensed Department access yet. You can prepare the site and return to choose Products later. A saved card grants no license.",
  PAYMENT_PENDING: "Payment is pending. Department access waits for a valid license and installation.",
  PAYMENT_REQUIRED: "Licensed operation is suspended or the subscription has ended. Use Billing to resolve it; your data is preserved.",
  PAYMENT_ATTENTION: "Payment needs attention. Existing installed, licensed Departments retain past-due access; new purchases and installations wait for ACTIVE.",
  INSTALLATION_PENDING: "Licensing synchronized; installation is pending. Open Billing to retry synchronization without another charge.",
  ACCESS_AVAILABLE: "Department access is available. Configuration and publication remain separate actions in each Department's Build tools.",
};

export function SetupWizard({ initial, checkoutOutcome, checkout }: { initial: Workspace; checkoutOutcome?: string | null; checkout?: string | null }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitationResults, setInvitationResults] = useState<Array<{ email: string; error?: string; deliveryStatus?: string }>>([]);
  const [override, setOverride] = useState<SetupDraft | null>(null);
  const facilityId = initial.facility.id;
  const storageKey = setupDraftKey(initial.administrator.id, facilityId);
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify); window.addEventListener("vssyl.setup.changed", notify);
    return () => { window.removeEventListener("storage", notify); window.removeEventListener("vssyl.setup.changed", notify); };
  }, []);
  const getSnapshot = useCallback(() => { try { return window.sessionStorage.getItem(storageKey); } catch { return null; } }, [storageKey]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const availableKeys = state.catalog.filter((p) => p.releaseStatus === "AVAILABLE").map((p) => p.productKey);
  const draft = override ?? readSetupDraft(raw, facilityId, availableKeys, initial.facility.onboardingEntryConfirmedAt || initial.facility.onboardingCompletedAt ? "builders" : "site");
  const view = draft.view;
  const selected = draft.selectedKeys;
  const [checkoutState, checkoutAction] = useActionState(startBillingCheckoutAction, initialBilling);
  const [addState, addAction] = useActionState(addBillingDepartmentsAction, initialBilling);

  function saveDraft(patch: Partial<Pick<SetupDraft, "view" | "selectedKeys">>) {
    const next = { ...draft, ...patch };
    setOverride(next);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event("vssyl.setup.changed")); }
    catch { setNotice("Browser draft storage is unavailable. Keep this page open to retain your selection."); }
  }
  useEffect(() => {
    const start = Date.now();
    void fetch("/api/onboarding/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedFacilityId: facilityId, event: "step_viewed", step: view }) }).catch(() => {});
    let left = false;
    const leave = () => { if (left) return; left = true; navigator.sendBeacon("/api/onboarding/state", new Blob([JSON.stringify({ expectedFacilityId: facilityId, event: "left", step: view, elapsedMs: Math.min(Date.now()-start, 86_400_000) })], { type: "application/json" })); };
    window.addEventListener("pagehide", leave);
    return () => { leave(); window.removeEventListener("pagehide", leave); };
  }, [facilityId, view]);

  async function request(path: string, body?: unknown) {
    let response: Response;
    try { response = await fetch(path, body ? { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); }
    catch { throw new Error("Setup could not be reached. Check your connection and retry; your entries are still here."); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Setup could not be saved. Retry after refreshing your Facility context.");
    return result;
  }
  async function refresh() {
    const next: Workspace = await request("/api/onboarding/state");
    if (next.facility.id !== facilityId) throw new Error("Your active Facility changed. Reload this page before continuing.");
    setState(next);
  }
  async function withFeedback(work: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Setup could not be completed. Refresh and retry."); }
    finally { setBusy(false); }
  }
  async function confirmSite(data: FormData) {
    await withFeedback(async () => {
      await request("/api/onboarding/state", { expectedFacilityId: facilityId, facilityName: data.get("facilityName"), timezone: data.get("timezone"), ...(data.get("billingEmail") ? { billingEmail: data.get("billingEmail") } : {}), confirmEntry: data.get("confirmTimezone") === "on", step: "departments" });
      await refresh(); saveDraft({ view: "builders" }); setNotice("Site facts confirmed. You can enter Build with zero Departments and choose Products later.");
    });
  }
  async function invite(data: FormData) {
    await sendInvitations(String(data.get("emails") ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean), false);
  }
  async function sendInvitations(emails: string[], retry: boolean) {
    await withFeedback(async () => {
      const res = await fetch("/api/onboarding/managers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedFacilityId: facilityId, emails, retry }) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? "Invitation request failed.");
      setInvitationResults(result.rows); await refresh();
      setNotice("Review each invitation's status below. Sending an invitation does not grant access; the recipient must accept.");
    });
  }
  const newKeys = selected.filter((key) => !state.catalog.find((p) => p.productKey === key)?.licensed);
  const activeSubscription = state.billingStatus === "ACTIVE";
  const suspended = ["PAST_DUE", "UNPAID", "PAUSED", "INCOMPLETE"].includes(state.billingStatus);
  return <section className="mx-auto max-w-5xl space-y-5" data-testid="setup-workspace">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Site setup workspace</h1><div className="flex gap-4"><Link href="/access" className="underline">Switch Facility</Link><form action="/api/auth/logout" method="post"><button type="submit" className="underline">Sign out</button></form></div></div>
      <p className="font-medium">{state.facility.displayName} · {state.facility.organization.displayName || state.facility.organization.name}</p>
      <p className="text-sm text-zinc-600">Prepare the site, choose Products when ready, and configure each Department independently. Setup guidance does not certify operational readiness or publish configuration.</p>
      <p className="text-sm">Administrator: {state.administrator.name} ({state.administrator.email})</p>
    </header>
    <nav aria-label="Setup sections" className="grid grid-cols-2 gap-2 md:grid-cols-4">{SETUP_VIEWS.map((item) => <button key={item} type="button" aria-current={view === item ? "step" : undefined} className={`rounded border px-3 py-3 text-sm ${view === item ? "bg-zinc-900 text-white" : "bg-white"}`} onClick={() => saveDraft({ view: item })}>{viewLabels[item]}</button>)}</nav>
    <aside aria-label="Licensing and installation" className="app-card space-y-2 text-sm"><p>{statusCopy[state.commercialStatus]}</p>
      {checkout === "canceled" ? <p>Checkout was canceled. Check current Billing before starting another checkout.</p> : null}
      {checkoutOutcome ? <p role="status">{["SYNCHRONIZED", "ALREADY_MATCHES"].includes(checkoutOutcome) ? "Subscription checked. Current licensing and installation are shown here." : "Payment or installation needs review. Use Billing to check or retry synchronization without another checkout or charge."}</p> : null}
      <Link href="/admin/billing" className="font-medium underline">Review Billing and retry synchronization</Link>
    </aside>
    {error ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-3">{error}</p> : null}
    {notice ? <p role="status" className="rounded border border-teal-200 bg-teal-50 p-3">{notice}</p> : null}
    <article className="app-card space-y-4">
      {view === "site" ? <form onSubmit={(event) => { event.preventDefault(); void confirmSite(new FormData(event.currentTarget)); }} className="space-y-4">
        <h2 className="text-lg font-semibold">Confirm site and timezone</h2>
        <p className="text-sm">Your existing site, owning Organization and administrator are reused. To change Organization or administrator identity, use the existing account/Organization tools.</p>
        <label className="block">Site name<input className="app-input mt-1 w-full" name="facilityName" required minLength={2} maxLength={200} defaultValue={state.facility.displayName} /></label>
        <label className="block">Timezone (IANA)<input className="app-input mt-1 w-full" name="timezone" required list="setup-timezones" defaultValue={state.facility.timezone} /></label>
        <datalist id="setup-timezones">{["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Vancouver", "UTC"].map((x) => <option key={x} value={x} />)}</datalist>
        <label className="block">Billing email (needed at checkout)<input type="email" name="billingEmail" maxLength={200} className="app-input mt-1 w-full" defaultValue={state.facility.billingEmail ?? ""} /></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="confirmTimezone" required className="mt-1" /><span>I confirm this is the timezone for the site’s local operational dates and times.</span></label>
        <button disabled={busy} className="app-button app-accent-button text-white">{busy ? "Saving…" : "Confirm site and enter setup"}</button>
      </form> : null}
      {view === "products" ? <div className="space-y-4">
        <h2 className="text-lg font-semibold">Choose available Products</h2><p className="text-sm">Choose none, one or several. Selection is a browser draft for this Facility; it does not license or install anything.</p>
        <div className="grid gap-3 md:grid-cols-2">{state.catalog.filter((p) => p.releaseStatus === "AVAILABLE").map((p) => <label key={p.productKey} className="flex items-start gap-3 rounded border p-4"><input type="checkbox" className="mt-1" checked={selected.includes(p.productKey)} onChange={() => saveDraft({ selectedKeys: selected.includes(p.productKey) ? selected.filter((k) => k !== p.productKey) : [...selected, p.productKey] })} /><span><strong>{p.name}</strong><span className="block text-sm">{p.shortDescription}</span><span className="block text-xs text-zinc-600">{p.applicabilitySummary ?? p.industryLabel}</span><span className="block text-sm">{p.installed ? "Installed" : "Not installed"} · {p.licensed ? "Licensed" : "Not licensed"}</span></span></label>)}</div>
        <form action={activeSubscription ? addAction : checkoutAction} className="space-y-3" aria-label="License selected Products">
          <input type="hidden" name="expectedFacilityId" value={facilityId} /><input type="hidden" name="returnTo" value="setup" /><input type="hidden" name="setupPath" value="SELF_SERVE" />
          {(activeSubscription ? newKeys : selected).map((key) => <input key={key} type="hidden" name="departmentKey" value={key} />)}
          {!activeSubscription ? <label className="block">Billing interval<select name="interval" className="app-input ml-2" defaultValue="ANNUAL"><option value="ANNUAL">Annual</option><option value="MONTHLY">Monthly</option></select></label> : null}
          <LicenseSubmit disabled={!state.stripeBillingReady || suspended || (activeSubscription ? !newKeys.length : !selected.length)} label={activeSubscription ? "Add selected Products to subscription" : "License selected Products at checkout"} />
          {!state.stripeBillingReady ? <p>Billing is not configured here. Your selection is retained; no license or installation is implied.</p> : null}
          {suspended ? <p>Resolve the current subscription in Billing before adding Products.</p> : null}
          {checkoutState.error || addState.error ? <p role="alert">{checkoutState.error ?? addState.error}</p> : null}
        </form>
        <button className="app-button" type="button" onClick={() => saveDraft({ view: "builders" })}>Continue without choosing a Product</button>
      </div> : null}
      {view === "builders" ? <div className="space-y-4"><h2 className="text-lg font-semibold">Prepare in the existing Build tools</h2>
        <p className="text-sm">{state.structure.locations} active structure locations · {state.structure.rooms} active rooms. These counts describe saved structure, not operational readiness.</p>
        <div className="grid gap-3 md:grid-cols-2"><div className="rounded border p-4"><h3 className="font-semibold">Facility structure</h3><p className="text-sm">Map buildings, floors and rooms in Facility Builder. Use its Bulk Import button for a Facility structure CSV.</p><Link className="mt-2 block underline" href="/admin/facility/builder?onboarding=workspace">Open Facility Builder / structure CSV</Link></div><div className="rounded border p-4"><h3 className="font-semibold">Assets</h3><p className="text-sm">Use the existing Asset Builder and its CSV intake. Importing does not publish Department configuration.</p><Link className="mt-2 block underline" href="/assets/builder">Open Asset Builder / asset CSV</Link></div></div>
        <h3 className="font-semibold">Prepare each Department independently</h3>
        {state.catalog.filter((p) => p.installed || p.licensed || selected.includes(p.productKey)).map((p) => <div key={p.productKey} className="rounded border p-4"><strong>{p.name}</strong><p className="my-2 text-sm">{p.operable ? "Access available. Continue configuration in this Department's Builder; use its own validation and publication controls." : p.licensed && !p.installed ? "Licensed; installation pending. Retry synchronization in Billing." : p.installed && !p.departmentActive ? "Installed but disabled. Review Department administration." : "Choose and license this Product before Department preparation."}</p>{p.operable && p.departmentId ? <Link className="underline" href={`/build/departments/${p.departmentId}`}>Prepare {p.name}</Link> : <Link className="underline" href={p.installed ? "/admin/departments" : "/admin/billing"}>Review licensing / Department access</Link>}</div>)}
        {!state.catalog.some((p) => p.installed || p.licensed || selected.includes(p.productKey)) ? <p>No Departments chosen. Start with Facility structure, or choose Products later.</p> : null}
        <button type="button" className="app-button" disabled={busy} onClick={() => void withFeedback(refresh)}>Refresh saved configuration and access</button>
      </div> : null}
      {view === "people" ? <div className="space-y-4"><h2 className="text-lg font-semibold">Invite managers</h2><p className="text-sm">Invite a Manager with an email address. Access begins only after acceptance. Existing staff roles, revoked access or employment history must be reviewed in People.</p>
        <form onSubmit={(event) => { event.preventDefault(); void invite(new FormData(event.currentTarget)); }} className="space-y-3"><label className="block">Manager email addresses<textarea required name="emails" className="app-input mt-1 min-h-24 w-full" placeholder="manager@example.com" /></label><button disabled={busy} className="app-button app-accent-button text-white">Send manager invitations</button></form>
        <ul aria-label="Manager invitation results">{invitationResults.map((row) => <li key={row.email}>{row.email}: {row.error ?? row.deliveryStatus}</li>)}</ul>
        <ul aria-label="Manager invitations" className="divide-y">{state.managerInvites.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span>{row.email} — {row.state.replaceAll("_", " ").toLowerCase()}{row.expiresAt ? `; expires ${new Date(row.expiresAt).toLocaleDateString()}` : " (historical notice; no grant inferred)"}</span>{row.state !== "ACCEPTED" ? <button type="button" disabled={busy} className="app-button" onClick={() => void sendInvitations([row.email], true)}>Retry invitation for {row.email}</button> : null}</li>)}</ul>
        <Link href="/employees/bulk-setup" className="block underline">Bulk workforce and relationship setup (CSV)</Link><Link href="/employees/bulk-setup?mode=workbook" className="block underline">Combined onboarding workbook (XLSX)</Link><Link href="/employees" className="underline">Open People to manage existing employees and relationships</Link>
      </div> : null}
    </article>
    <footer className="flex flex-wrap items-center justify-between gap-3"><button type="button" className="app-button" onClick={() => saveDraft({ view: SETUP_VIEWS[Math.max(0, SETUP_VIEWS.indexOf(view)-1)]! })}>Back</button><p className="text-sm">{state.facility.onboardingCompletedAt ? "Guided setup acknowledged. Return here anytime; each Department still owns its configuration and publication." : "You can resume setup at any time."}</p><button type="button" className="app-button" disabled={busy} onClick={() => void withFeedback(async () => { await request("/api/onboarding/state", { expectedFacilityId: facilityId, completeOnboarding: true }); await refresh(); setNotice("Guided setup acknowledged. No license, readiness or publication is implied."); })}>Acknowledge guided setup</button></footer>
  </section>;
}
function LicenseSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={disabled || pending} className="app-button app-accent-button text-white">{pending ? "Opening Billing…" : label}</button>;
}
