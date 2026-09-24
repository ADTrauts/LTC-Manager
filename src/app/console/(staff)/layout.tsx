import { HarborConsoleShell } from "@/components/harbor-console/harbor-console-shell";
import { requireHarborStaff } from "@/lib/harbor-console/auth";

export const dynamic = "force-dynamic";

export default async function HarborStaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireHarborStaff();
  return (
    <HarborConsoleShell staffName={session.name} staffRole={session.staffRole}>
      {children}
    </HarborConsoleShell>
  );
}
