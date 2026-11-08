import { AttentionBell } from "@/components/notifications/attention-bell";
import { getActiveAttentionCountForUser } from "@/lib/notifications/queries";
import { prisma } from "@/lib/prisma";

export async function AttentionBellSlot({ userId, facilityId }: { userId: string; facilityId: string }) {
  let count: number | null = null;
  try {
    count = await getActiveAttentionCountForUser(prisma, { userId, facilityId });
  } catch {
    count = null;
  }
  return <AttentionBell count={count} />;
}
