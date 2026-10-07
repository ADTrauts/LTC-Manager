import { redirect } from "next/navigation";

import { LoginGate } from "@/components/login-gate";
import { getSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { isPublicSignupEnabled } from "@/lib/signup-policy";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    if (session.scopeKind === "organization" && session.organizationId) {
      redirect(`/organization/${session.organizationId}`);
    }
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind ?? "user",
        role: session.role ?? "STAFF",
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  return <LoginGate signupEnabled={isPublicSignupEnabled()} />;
}
