import { redirect } from "next/navigation";

import { getAuthenticatedUserSession } from "@/lib/user-session";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  INVALID_CONTEXT_KEY: "That workspace could not be opened.",
  CONTEXT_NOT_AVAILABLE: "That workspace is no longer available.",
};

type AccessPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const session = await getAuthenticatedUserSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const error = params.error ? ERROR_COPY[params.error] : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Account</p>
      <h1 className="mt-2 text-2xl font-semibold">My Access</h1>
      <p className="mt-4 text-sm text-zinc-700">You are signed in.</p>
      <p className="mt-2 text-sm text-zinc-700">Your available workspaces will appear here.</p>
      {error ? <p className="mt-6 text-sm text-red-700">{error}</p> : null}
    </main>
  );
}
