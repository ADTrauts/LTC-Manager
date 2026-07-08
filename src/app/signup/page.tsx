import { redirect } from "next/navigation";

import { SignupForm } from "@/components/signup-form";
import { getSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

export default async function SignupPage() {
  const session = await getSession();
  if (session?.facilityId) {
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind ?? "user",
        role: session.role,
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <SignupForm />
    </main>
  );
}
