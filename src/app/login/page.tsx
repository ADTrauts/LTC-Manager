import { redirect } from "next/navigation";

import { LoginGate } from "@/components/login-gate";
import { getSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind ?? "user",
        role: session.role,
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  return <LoginGate />;
}
