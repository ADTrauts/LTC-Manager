import { redirect } from "next/navigation";

import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { HarborLoginForm } from "@/components/harbor-console/harbor-login-form";
import { getHarborSession } from "@/lib/harbor-console/auth";

export default async function HarborLoginPage() {
  const session = await getHarborSession();
  if (session) {
    redirect("/console");
  }

  return (
    <HarborAuthFrame
      kicker="LTC Corp"
      title="Harbor Console"
      description="Staff desk for customers, setup, and platform content. Not a facility workspace."
    >
      <HarborLoginForm />
    </HarborAuthFrame>
  );
}
