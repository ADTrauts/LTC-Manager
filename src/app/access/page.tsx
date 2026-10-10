import { redirect } from "next/navigation";

import { ContextCard } from "@/components/access/context-card";
import {
  AvailableContextError,
  currentContextKeyFromSession,
  groupAvailableContextPresentations,
  listAvailableContextsForRequest,
  presentAvailableContexts,
} from "@/lib/available-contexts";
import { getAppSession } from "@/lib/auth";
import { typeClasses } from "@/lib/design-system";
import { getAuthenticatedUserSession } from "@/lib/user-session";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, { title: string; detail?: string }> = {
  CONTEXT_NOT_AVAILABLE: {
    title: "That access is no longer available.",
    detail: "Your access list has been refreshed.",
  },
  INVALID_CONTEXT_KEY: {
    title: "That request was invalid.",
  },
};

type AccessPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const session = await getAuthenticatedUserSession();
  if (!session) {
    redirect("/login");
  }

  let records;
  try {
    records = await listAvailableContextsForRequest(session.uid);
  } catch (error) {
    if (error instanceof AvailableContextError) {
      redirect("/login");
    }
    throw error;
  }

  const presentations = presentAvailableContexts(records);
  const groups = groupAvailableContextPresentations(presentations);
  const appSession = await getAppSession();
  const currentContextKey = appSession ? currentContextKeyFromSession(appSession) : null;
  const params = await searchParams;
  const error = params.error ? ERROR_COPY[params.error] : null;
  const showChooserHint = session.scopeKind === "account" && presentations.length > 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className={typeClasses.pageTitle}>My Access</h1>
      <div className="mt-4">
        <p className="text-sm font-semibold text-zinc-900">{session.name}</p>
        <p className={typeClasses.meta}>{session.email}</p>
      </div>
      {showChooserHint ? (
        <p className="mt-4 text-sm text-zinc-700">Choose where you would like to work.</p>
      ) : null}
      {error ? (
        <div
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"
          role="status"
        >
          <p className="font-medium">{error.title}</p>
          {error.detail ? <p className="mt-1">{error.detail}</p> : null}
        </div>
      ) : null}

      {presentations.length === 0 ? (
        <div className="mt-8 space-y-3 text-sm text-zinc-700">
          <p>You do not currently have access to any organizations or facilities.</p>
          <p>Your account is still active.</p>
          <p>If you believe you should have access, contact your administrator.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((entry) => (
            <section key={entry.group} aria-labelledby={`access-group-${entry.group}`}>
              <h2 id={`access-group-${entry.group}`} className={typeClasses.sectionTitle}>
                {entry.group}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {entry.items.map((item) => (
                  <ContextCard
                    key={item.contextKey}
                    title={item.title}
                    subtitle={item.subtitle}
                    contextKey={item.contextKey}
                    departmentSummary={item.departmentSummary}
                    isHome={item.isHome}
                    isCurrent={item.contextKey === currentContextKey}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
