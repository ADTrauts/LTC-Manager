import { offboardingPlanSchema, PLAN_TOPICS } from "@/lib/customer-offboarding/contract";

export function CustomerOffboardingPlan({ value }: { value: unknown }) {
  const parsed = offboardingPlanSchema.safeParse(value);
  if (!parsed.success) return <p>The plan cannot be displayed. Contact Support before acknowledging it.</p>;
  const plan = parsed.data;
  return <div className="space-y-4">
    <p><strong>Target planning date:</strong> {plan.targetDate}</p>
    {PLAN_TOPICS.map(({ key, label }) => <section key={key} className="space-y-1">
      <h3 className="font-semibold">{label}</h3>
      <p className="text-sm">{plan[key].reviewed ? "OWNER marked this part of the plan reviewed" : "Review still pending"}</p>
      <p className="whitespace-pre-wrap break-words">{plan[key].notes}</p>
    </section>)}
    <p className="text-sm">Review marks record plan coordination. They do not prove billing cancellation, export delivery, access removal or data deletion.</p>
  </div>;
}

export function CustomerOffboardingHistory({ events }: { events: { id: string; revision: number; action: string;
  actorLabel: string; actorKind: string; detail: unknown; createdAt: Date }[] }) {
  const labels: Record<string, string> = { REQUESTED: "Review requested", PLAN_PUBLISHED: "Plan published",
    PLAN_ACKNOWLEDGED: "Plan acknowledged", WITHDRAWN: "Request withdrawn", DECLINED: "Request declined" };
  return <ol className="space-y-4">{events.map((event) => {
    const detail = event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) ? event.detail as Record<string, unknown> : {};
    return <li key={event.id} className="rounded border p-3">
      <p className="font-semibold">{labels[event.action] ?? "Recorded event"} · Revision {event.revision}</p>
      <p className="text-sm">{event.actorLabel} ({event.actorKind === "OWNER" ? "Vssyl OWNER" : "Facility Administrator"}) · {event.createdAt.toISOString()} UTC</p>
      {typeof detail.planVersion === "number" && detail.planVersion > 0 ? <p>Plan version {detail.planVersion}</p> : null}
      {typeof detail.reason === "string" ? <p className="whitespace-pre-wrap break-words">{detail.reason}</p> : null}
      {event.action === "PLAN_PUBLISHED" ? <details><summary>Recorded plan version</summary><CustomerOffboardingPlan value={detail.plan} /></details> : null}
    </li>;
  })}</ol>;
}
