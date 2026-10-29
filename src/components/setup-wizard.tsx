"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { startBillingCheckoutAction, addBillingDepartmentsAction, type BillingActionState } from "@/app/(protected)/admin/billing/actions";
import { SetupDepartmentLead } from "@/components/setup-department-lead";
import { listIanaTimezoneGroups, savedTimezoneGroup } from "@/lib/operational-time/iana-timezones";
import type { SetupWorkspace } from "@/lib/onboarding/workspace";
import {
  applyBuilderReturn,
  canOpenGuideStep,
  guideArrival,
  guideIndex,
  guidePath,
  nextGuideStep,
  previousGuideStep,
  productKeyFromDepartmentStep,
  readSetupDraft,
  setupDraftKey,
  type SetupDraft,
  type SetupGuideStep,
} from "@/lib/onboarding/draft";

type Json<T> = T extends Date ? string : T extends readonly (infer U)[] ? Json<U>[] : T extends object ? { [K in keyof T]: Json<T[K]> } : T;
type Workspace = Json<SetupWorkspace>;
type CatalogProduct = Workspace["catalog"][number];
const initialBilling: BillingActionState = { error: null };
function subscribeTimezoneList() {
  return () => {};
}
const statusCopy: Record<string, string> = {
  NOT_LICENSED: "No licensed Department access yet. You can prepare your Vssyl and return to choose Products later. A saved card grants no license.",
  PAYMENT_PENDING: "Payment is pending. Department access waits for a valid license and installation.",
  PAYMENT_REQUIRED: "Licensed operation is suspended or the subscription has ended. Use Billing to resolve it; your data is preserved.",
  PAYMENT_ATTENTION: "Payment needs attention. Existing installed, licensed Departments retain past-due access; new purchases and installations wait for ACTIVE.",
  INSTALLATION_PENDING: "Licensing synchronized; installation is pending. Open Billing to retry synchronization without another charge.",
  ACCESS_AVAILABLE: "Department access is available. Configuration and publication remain separate actions in each Department's Build tools.",
};
const stepLabels: Record<string, string> = {
  site: "Vssyl",
  products: "Products",
  building: "Building",
  equipment: "Equipment",
  people: "People",
  finish: "Finish",
};

export function SetupWizard({ initial, checkoutOutcome, checkout, returned, files, forceChoice = false }: { initial: Workspace; checkoutOutcome?: string | null; checkout?: string | null; returned?: string | null; files: { facility: string; employees: string; assets: string }; forceChoice?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitationResults, setInvitationResults] = useState<Array<{ email: string; error?: string; deliveryStatus?: string }>>([]);
  const [override, setOverride] = useState<SetupDraft | null>(null);
  const [ignoreQuery, setIgnoreQuery] = useState(false);
  const facilityId = initial.facility.id;
  const storageKey = setupDraftKey(initial.administrator.id, facilityId);
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener("vssyl.setup.changed", notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener("vssyl.setup.changed", notify);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    try { return window.sessionStorage.getItem(storageKey); } catch { return null; }
  }, [storageKey]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const availableKeys = state.catalog.filter((product) => product.releaseStatus === "AVAILABLE").map((product) => product.productKey);
  const fallback: SetupGuideStep = initial.facility.onboardingCompletedAt ? "finish" : initial.facility.onboardingEntryConfirmedAt ? "products" : "site";
  const stored = override ?? readSetupDraft(raw, facilityId, availableKeys, fallback);
  const licensedKeys = state.catalog.filter((product) => product.licensed || product.installed).map((product) => product.productKey);
  const path = guidePath(stored.selectedKeys, licensedKeys);
  const arrived = guideArrival(stored, path, ignoreQuery ? null : checkout ?? null);
  const position = ignoreQuery ? arrived : applyBuilderReturn(arrived, path, returned ?? null);
  const step = position.step;
  const reached = position.reached;
  const selected = stored.selectedKeys;
  const [checkoutState, checkoutAction] = useActionState(startBillingCheckoutAction, initialBilling);
  const [addState, addAction] = useActionState(addBillingDepartmentsAction, initialBilling);

  function saveDraft(patch: Partial<Pick<SetupDraft, "step" | "reached" | "selectedKeys" | "approach">>) {
    const next: SetupDraft = { ...stored, step, reached, ...patch, version: 5, facilityId };
    setOverride(next);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("vssyl.setup.changed"));
    } catch {
      setNotice("Browser draft storage is unavailable. Keep this page open to retain your selection.");
    }
  }
  function advance(target = nextGuideStep(path, step)) {
    const further = guideIndex(path, target) > guideIndex(path, reached) ? target : reached;
    saveDraft({ step: target, reached: further });
  }
  function openReached(target: SetupGuideStep) {
    if (canOpenGuideStep(path, reached, target)) saveDraft({ step: target });
  }
  useEffect(() => {
    if (ignoreQuery || (!checkout && !returned)) return;
    saveDraft({ step: position.step, reached: position.reached });
    setIgnoreQuery(true);
    router.replace("/setup");
    // Apply checkout or a builder return once, then drop the query so Back can revisit earlier questions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout, returned]);
  const serverApproach =
    !stored.approach && !checkout && step === "site" && reached === "site" && selected.length === 0
      ? initial.setupPath === "ASSISTED"
        ? "vssyl"
        : initial.setupPath === "SELF_SERVE"
          ? "self"
          : null
      : null;
  const approach = stored.approach ?? serverApproach;
  const showChoice = (forceChoice && approach == null) || (approach == null && !initial.facility.onboardingCompletedAt && !checkout && step === "site" && reached === "site" && selected.length === 0);
  const showHandoff = approach === "vssyl" && !checkout && (forceChoice || !initial.facility.onboardingCompletedAt);
  useEffect(() => {
    if (showChoice || showHandoff) return;
    const start = Date.now();
    void fetch("/api/onboarding/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedFacilityId: facilityId, event: "step_viewed", step }) }).catch(() => {});
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      navigator.sendBeacon("/api/onboarding/state", new Blob([JSON.stringify({ expectedFacilityId: facilityId, event: "left", step, elapsedMs: Math.min(Date.now() - start, 86_400_000) })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", leave);
    return () => { leave(); window.removeEventListener("pagehide", leave); };
  }, [facilityId, showChoice, showHandoff, step]);
  async function chooseApproach(nextApproach: "self" | "vssyl") {
    await withFeedback(async () => {
      await request("/api/onboarding/state", { expectedFacilityId: facilityId, setupPath: nextApproach === "vssyl" ? "ASSISTED" : "SELF_SERVE" });
      saveDraft({ approach: nextApproach });
    });
  }

  async function request(pathName: string, body?: unknown) {
    let response: Response;
    try { response = await fetch(pathName, body ? { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); }
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
    try { await work(); } catch (exception) { setError(exception instanceof Error ? exception.message : "Setup could not be completed. Refresh and retry."); }
    finally { setBusy(false); }
  }
  async function confirmSite(data: FormData) {
    await withFeedback(async () => {
      await request("/api/onboarding/state", { expectedFacilityId: facilityId, facilityName: data.get("facilityName"), timezone: data.get("timezone"), ...(data.get("billingEmail") ? { billingEmail: data.get("billingEmail") } : {}), confirmEntry: data.get("confirmTimezone") === "on", step: "facility" });
      await refresh();
      advance("products");
    });
  }
  async function invite(data: FormData) {
    await sendInvitations(String(data.get("emails") ?? "").split(/[,;\n]/).map((value) => value.trim()).filter(Boolean), false);
  }
  async function sendInvitations(emails: string[], retry: boolean) {
    await withFeedback(async () => {
      const res = await fetch("/api/onboarding/managers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedFacilityId: facilityId, emails, retry }) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? "Invitation request failed.");
      setInvitationResults(result.rows);
      await refresh();
      setNotice("Review each invitation's status below. Sending an invitation does not grant access; the recipient must accept.");
    });
  }
  async function acknowledge() {
    await withFeedback(async () => {
      await request("/api/onboarding/state", { expectedFacilityId: facilityId, completeOnboarding: true });
      await refresh();
      router.push("/dashboard");
    });
  }
  const timezoneGroups = useSyncExternalStore(
    subscribeTimezoneList,
    () => listIanaTimezoneGroups(state.facility.timezone),
    () => savedTimezoneGroup(state.facility.timezone),
  );
  const newKeys = selected.filter((key) => !state.catalog.find((product) => product.productKey === key)?.licensed);
  const activeSubscription = state.billingStatus === "ACTIVE";
  const suspended = ["PAST_DUE", "UNPAID", "PAUSED", "INCOMPLETE"].includes(state.billingStatus);
  const canLicense = selected.length > 0 && state.stripeBillingReady && !suspended && (!activeSubscription || newKeys.length > 0);
  const departmentKey = productKeyFromDepartmentStep(step);
  const department = departmentKey ? state.catalog.find((product) => product.productKey === departmentKey) ?? null : null;
  const question = guideIndex(path, step) + 1;

  return <section className="mx-auto max-w-3xl space-y-5" data-testid="setup-workspace">
    <header className="space-y-4 border-b border-zinc-200 pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 space-y-1">
          {showChoice || showHandoff ? null : <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">Question {question} of {path.length}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Set up your Vssyl</h1>
        </div>
        <div className="flex items-center gap-3 pt-1 text-sm text-zinc-500">
          <Link href="/access" className="hover:text-zinc-900">Switch Facility</Link>
          <span aria-hidden="true" className="text-zinc-300">·</span>
          <form action="/api/auth/logout" method="post"><button type="submit" className="hover:text-zinc-900">Sign out</button></form>
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-zinc-800">{state.facility.displayName}</p>
        <p className="text-sm text-zinc-500">{state.facility.organization.displayName || state.facility.organization.name}</p>
      </div>
      <div className="space-y-0.5 text-sm text-zinc-500">
        {showChoice || showHandoff ? null : <p>Each answer opens the next question.</p>}
        <p>Administrator: {state.administrator.name} ({state.administrator.email})</p>
      </div>
    </header>
    {showChoice || showHandoff ? null : <ol aria-label="Setup progress" className="flex flex-wrap items-center gap-2 text-sm">
      {path.map((item) => {
        const label = stepLabels[item] ?? state.catalog.find((product) => product.productKey === productKeyFromDepartmentStep(item))?.name ?? "Department";
        const chip = "inline-flex items-center rounded border px-3 py-2 leading-5";
        if (item === step) return <li key={item} className="flex"><span aria-current="step" className={`${chip} border-zinc-900 bg-zinc-900 text-white`}>{label}</span></li>;
        if (!canOpenGuideStep(path, reached, item)) return <li key={item} className="flex"><span className={`${chip} border-zinc-200 text-zinc-400`}>{label}</span></li>;
        return <li key={item} className="flex"><button type="button" className={`${chip} border-zinc-300 bg-white`} onClick={() => openReached(item)}>{label}</button></li>;
      })}
    </ol>}
    {error ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-3">{error}</p> : null}
    {notice ? <p role="status" className="rounded border border-teal-200 bg-teal-50 p-3">{notice}</p> : null}
    {showChoice ? <article className="app-card space-y-4">
      <h2 className="text-lg font-semibold">How do you want to set up?</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy} className="rounded border border-zinc-200 bg-white p-4 text-left hover:border-zinc-900" onClick={() => void chooseApproach("self")}>
          <span className="block font-semibold text-zinc-950">Self setup</span>
          <span className="mt-1 block text-sm text-zinc-600">You set up the facility. The next questions cover the site, products, building, equipment, and people.</span>
        </button>
        <button type="button" disabled={busy} className="rounded border border-zinc-200 bg-white p-4 text-left hover:border-zinc-900" onClick={() => void chooseApproach("vssyl")}>
          <span className="block font-semibold text-zinc-950">Vssyl setup</span>
          <span className="mt-1 block text-sm text-zinc-600">Open the facility now. Download the lists and start filling them out. A Vssyl representative will be in contact shortly.</span>
        </button>
      </div>
    </article> : null}
    {showHandoff ? <article className="app-card space-y-4">
      <h2 className="text-lg font-semibold">Start the lists</h2>
      <p className="text-sm">Download these files and begin filling them out. A Vssyl representative will be in contact shortly. The facility is open now.</p>
      <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
        {([
          ["Facility Builder", "facility-builder.csv", files.facility, "Buildings, floors, and rooms."],
          ["Employee Builder", "employee-builder.csv", files.employees, "People who work at the facility."],
          ["Assets", "assets.csv", files.assets, "Equipment."],
        ] as const).map(([label, name, text, detail]) => (
          <li key={name} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <span>
              <span className="block font-medium text-zinc-950">{label}</span>
              <span className="block text-sm text-zinc-600">{detail}</span>
            </span>
            <button type="button" className="app-button" onClick={() => downloadCsv(name, text)}>Download CSV</button>
          </li>
        ))}
      </ul>
      <Link href="/dashboard" className="app-button app-accent-button inline-block text-white">Open the facility</Link>
      <button type="button" className="app-button" disabled={busy} onClick={() => void chooseApproach("self")}>I&apos;ll set it up myself</button>
    </article> : null}
    {showChoice || showHandoff ? null : <article className="app-card space-y-4">
      {step === "site" ? <form onSubmit={(event) => { event.preventDefault(); void confirmSite(new FormData(event.currentTarget)); }} className="space-y-4">
        <h2 className="text-lg font-semibold">Confirm your Vssyl</h2>
        <label className="block">Vssyl name<input className="app-input mt-1 w-full" name="facilityName" required minLength={2} maxLength={200} defaultValue={state.facility.displayName} /></label>
        <label className="block">Timezone<select className="app-input mt-1 w-full" name="timezone" required defaultValue={state.facility.timezone}>{timezoneGroups.map((group) => <optgroup key={group.region} label={group.region}>{group.zones.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</optgroup>)}</select></label>
        <label className="block">Billing email (needed at checkout)<input type="email" name="billingEmail" maxLength={200} className="app-input mt-1 w-full" defaultValue={state.facility.billingEmail ?? ""} /></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="confirmTimezone" required className="mt-1" /><span>I confirm this is the timezone for your Vssyl’s local operational dates and times.</span></label>
        <button disabled={busy} className="app-button app-accent-button text-white">{busy ? "Saving…" : "Continue"}</button>
      </form> : null}
      {step === "products" ? <div className="space-y-4">
        <h2 className="text-lg font-semibold">Which Products should this facility run?</h2>
        <p className="text-sm">Choose none, one, or several. A choice does not license or install anything.</p>
        <p role="status" className={selected.length === 0 ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950" : "text-sm font-medium text-zinc-800"}>
          {selected.length === 0 ? "No Products selected." : `${selected.length} ${selected.length === 1 ? "Product" : "Products"} selected.`}
        </p>
        <aside aria-label="Licensing and installation" className="space-y-2 text-sm">
          <p>{statusCopy[state.commercialStatus]}</p>
          {checkout === "canceled" ? <p>Checkout was canceled. Check current Billing before starting another checkout.</p> : null}
          {checkoutOutcome ? <p role="status">{["SYNCHRONIZED", "ALREADY_MATCHES"].includes(checkoutOutcome) ? "Subscription checked. Current licensing and installation are shown here." : "Payment or installation needs review. Use Billing to check or retry synchronization without another checkout or charge."}</p> : null}
        </aside>
        <div className="grid gap-3">{state.catalog.filter((product) => product.releaseStatus === "AVAILABLE").map((product) => {
          const checked = selected.includes(product.productKey);
          const settled = product.installed && product.licensed;
          const body = <span><strong className={settled ? "font-semibold text-zinc-600" : undefined}>{product.name}</strong><span className="block text-sm">{product.shortDescription}</span><span className={`block text-xs ${settled ? "text-zinc-500" : "text-zinc-600"}`}>{product.applicabilitySummary ?? product.industryLabel}</span><span className="block text-sm">{product.installed ? "Installed" : "Not installed"} · {product.licensed ? "Licensed" : "Not licensed"}</span></span>;
          if (settled) return <div key={product.productKey} className="rounded border border-zinc-200 bg-zinc-100 p-4 text-zinc-500" data-testid={`setup-product-settled-${product.productKey}`}>{body}</div>;
          return <label key={product.productKey} className={`flex items-start gap-3 rounded border p-4 ${checked ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"}`}><input type="checkbox" className="mt-1 h-5 w-5" checked={checked} onChange={() => saveDraft({ selectedKeys: checked ? selected.filter((key) => key !== product.productKey) : [...selected, product.productKey] })} />{body}</label>;
        })}</div>
        {canLicense ? <form action={activeSubscription ? addAction : checkoutAction} className="space-y-3" aria-label="License selected Products">
          <input type="hidden" name="expectedFacilityId" value={facilityId} /><input type="hidden" name="returnTo" value="setup" /><input type="hidden" name="setupPath" value="SELF_SERVE" />
          {(activeSubscription ? newKeys : selected).map((key) => <input key={key} type="hidden" name="departmentKey" value={key} />)}
          {!activeSubscription ? <label className="block">Billing interval<select name="interval" className="app-input ml-2" defaultValue="ANNUAL"><option value="ANNUAL">Annual</option><option value="MONTHLY">Monthly</option></select></label> : null}
          <LicenseSubmit label={activeSubscription ? "Add these Products to the subscription" : "License at checkout"} />
          {checkoutState.error || addState.error ? <p role="alert">{checkoutState.error ?? addState.error}</p> : null}
        </form> : null}
        {!state.stripeBillingReady && selected.length > 0 ? <p>Billing is not configured here. This choice is saved. Nothing is licensed.</p> : null}
        {suspended && selected.length > 0 ? <p>Resolve the current subscription in Billing before adding Products. This choice is saved. Nothing new is licensed.</p> : null}
        <button className={selected.length === 0 ? "app-button app-accent-button text-white" : "app-button"} type="button" onClick={() => advance("building")}>{selected.length > 0 ? "Not now" : "Continue with no Products"}</button>
      </div> : null}
      {step === "building" ? <div className="space-y-4">
        <h2 className="text-lg font-semibold">Map the building now?</h2>
        <p className="text-sm">{state.structure.locations} active structure locations · {state.structure.rooms} active rooms. These counts describe saved structure, not operational readiness.</p>
        <p className="text-sm">Facility Builder maps buildings, floors, and rooms. Its Bulk Import button takes a Facility structure CSV.</p>
        <Link className="app-button app-accent-button inline-block text-white" href="/admin/facility/builder?onboarding=workspace">Map the building</Link>
        <button className="app-button" type="button" onClick={() => advance()}>Not now</button>
      </div> : null}
      {step === "equipment" ? <div className="space-y-4">
        <h2 className="text-lg font-semibold">Add equipment now?</h2>
        <p className="text-sm">Asset Builder records equipment and its CSV intake. Importing does not publish Department configuration.</p>
        <Link className="app-button app-accent-button inline-block text-white" href="/assets/builder?onboarding=workspace">Add equipment</Link>
        <button className="app-button" type="button" onClick={() => advance()}>Not now</button>
      </div> : null}
      {department ? <DepartmentQuestion product={department} lead={state.leadership.find((row) => row.departmentId === department.departmentId) ?? null} facilityId={facilityId} facilityOrganizationId={state.facility.organization.id} facilityOrganizationLabel={state.facility.organization.displayName || state.facility.organization.name} serviceDateKey={state.serviceDateKey} busy={busy} onContinue={() => advance()} onRefresh={() => void withFeedback(refresh)} /> : null}
      {step === "people" ? <div className="space-y-4">
        <h2 className="text-lg font-semibold">Invite a manager now?</h2>
        <p className="text-sm">Access begins only after acceptance. Existing staff roles, revoked access, or employment history must be reviewed in People.</p>
        <form onSubmit={(event) => { event.preventDefault(); void invite(new FormData(event.currentTarget)); }} className="space-y-3">
          <label className="block">Manager email addresses<textarea required name="emails" className="app-input mt-1 min-h-24 w-full" placeholder="manager@example.com" /></label>
          <button disabled={busy} className="app-button app-accent-button text-white">Send manager invitations</button>
        </form>
        <ul aria-label="Manager invitation results">{invitationResults.map((row) => <li key={row.email}>{row.email}: {row.error ?? row.deliveryStatus}</li>)}</ul>
        <ul aria-label="Manager invitations" className="divide-y">{state.managerInvites.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span>{row.email} — {row.state.replaceAll("_", " ").toLowerCase()}{row.expiresAt ? `; expires ${new Date(row.expiresAt).toLocaleDateString()}` : " (historical notice; no grant inferred)"}</span>{row.state !== "ACCEPTED" ? <button type="button" disabled={busy} className="app-button" onClick={() => void sendInvitations([row.email], true)}>Retry invitation for {row.email}</button> : null}</li>)}</ul>
        <Link href="/employees/bulk-setup" className="block underline">Bulk workforce and relationship setup (CSV)</Link>
        <Link href="/employees/bulk-setup?mode=workbook" className="block underline">Combined onboarding workbook (XLSX)</Link>
        <Link href="/employees" className="underline">Open People to manage existing employees and relationships</Link>
        <button className="app-button" type="button" onClick={() => advance("finish")}>{invitationResults.length > 0 || state.managerInvites.length > 0 ? "Continue" : "Not now"}</button>
      </div> : null}
      {step === "finish" ? <div className="space-y-4">
        <h2 className="text-lg font-semibold">Acknowledge setup</h2>
        <p className="text-sm">Acknowledging setup does not license a Product, install a Department, or mark the facility ready.</p>
        {state.facility.onboardingCompletedAt ? <p>Guided setup acknowledged. You can return here anytime. Each Department still owns its configuration and publication.</p> : <button type="button" className="app-button app-accent-button text-white" disabled={busy} onClick={() => void acknowledge()}>{busy ? "Saving…" : "Acknowledge guided setup"}</button>}
        <Link href="/dashboard" className="block underline">Go to the Dashboard</Link>
      </div> : null}
    </article>}
    {showChoice || showHandoff ? null : <footer>
      <button type="button" className="app-button" disabled={step === "site"} onClick={() => saveDraft({ step: previousGuideStep(path, step) })}>Back</button>
    </footer>}
  </section>;
}

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function DepartmentQuestion({ product, lead, facilityId, facilityOrganizationId, facilityOrganizationLabel, serviceDateKey, busy, onContinue, onRefresh }: { product: CatalogProduct; lead: Workspace["leadership"][number] | null; facilityId: string; facilityOrganizationId: string; facilityOrganizationLabel: string; serviceDateKey: string; busy: boolean; onContinue: () => void; onRefresh: () => void }) {
  const ready = Boolean(product.operable && product.departmentId && lead);
  return <div className="space-y-4">
    <h2 className="text-lg font-semibold">Who runs {product.name}?</h2>
    <p className="text-sm">They know this Department best. They set it up after you finish.</p>
    {ready && lead && product.departmentId ? <SetupDepartmentLead lead={lead} facilityId={facilityId} facilityOrganizationId={facilityOrganizationId} facilityOrganizationLabel={facilityOrganizationLabel} serviceDateKey={serviceDateKey} busy={busy} onSaved={onRefresh} /> : <p className="text-sm">{product.licensed && !product.installed ? "This Product is licensed and installation is pending. Retry synchronization in Billing, then come back." : product.installed && !product.departmentActive ? "This Department is installed and disabled. Review Department administration before naming a head." : "This Product is not licensed yet. Open Billing when you are ready. The choice stays saved."}</p>}
    {!ready ? <Link className="underline" href={product.installed ? "/admin/departments" : "/admin/billing"}>{product.installed ? "Review Department access" : "Review Billing"}</Link> : null}
    <button type="button" className="app-button" disabled={busy} onClick={onRefresh}>Refresh saved configuration and access</button>
    <button type="button" className="app-button" onClick={onContinue}>Continue</button>
  </div>;
}

function LicenseSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="app-button app-accent-button text-white">{pending ? "Opening Billing…" : label}</button>;
}
