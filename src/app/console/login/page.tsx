import { redirect } from "next/navigation";

import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { HarborLoginForm } from "@/components/harbor-console/harbor-login-form";
import { getHarborSession } from "@/lib/harbor-console/auth";
import Link from "next/link";
import { productionStaffLifecycleConfig } from "@/lib/harbor-console/lifecycle/gate";

export default async function HarborLoginPage() {
  const session = await getHarborSession();
  if (session) {
    redirect("/console");
  }

  return (
    <HarborAuthFrame
      title="Vssyl Console"
      description="Platform staff desk for customers, setup, and marketplace content. Not a facility workspace."
    >
      <HarborLoginForm />
      {productionStaffLifecycleConfig()?.recoveryEnabled && <Link prefetch={false} href="/console/staff-access" className="mt-4 block text-sm underline">Recover staff access</Link>}
    </HarborAuthFrame>
  );
}
