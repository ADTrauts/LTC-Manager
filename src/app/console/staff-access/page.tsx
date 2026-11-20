import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { StaffAccessForm } from "@/components/harbor-console/staff-access-form";
import { productionStaffLifecycleConfig } from "@/lib/harbor-console/lifecycle/gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function StaffAccessPage() {
  const config = productionStaffLifecycleConfig();
  if (!config) notFound();
  return <HarborAuthFrame title="Vssyl staff access" description="Invitation activation and credential recovery for internal Vssyl staff.">
    <StaffAccessForm recoveryEnabled={config.recoveryEnabled === true} />
  </HarborAuthFrame>;
}
