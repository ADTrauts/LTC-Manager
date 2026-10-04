import { HarborConsoleShell } from "@/components/harbor-console/harbor-console-shell";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { listSupportStaffNotifications } from "@/lib/support/notifications";

export const dynamic = "force-dynamic";

export default async function HarborStaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireHarborStaff();
  const feed = await listSupportStaffNotifications(prisma, session.uid);
  return (
    <HarborConsoleShell
      staffName={session.name}
      staffRole={session.staffRole}
      notifications={feed.items}
      unreadCount={feed.unreadCount}
    >
      {children}
    </HarborConsoleShell>
  );
}
