import { redirect } from "next/navigation";

import { LoginGate } from "@/components/login-gate";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return <LoginGate />;
}
