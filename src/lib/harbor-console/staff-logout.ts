import { currentTime, lockStaff, withHarborAssistanceTransaction } from "./assistance-store";
import { readHarborLogin } from "./login-receipt";

export async function endBrowserHarborLogin(token: string | undefined) {
  const login = await readHarborLogin(token);
  // Already expired or a legacy cookie without a per-login identity.
  if (!login) return;
  await withHarborAssistanceTransaction(async (tx) => {
    const staffExists = await lockStaff(tx, login.claim.uid);
    const now = await currentTime(tx);
    if (now >= login.retainUntil) return;

    // Independent of the staff row and audit events, retained for the full verifier lifetime.
    const receipt = await tx.harborAssistanceLoginReceipt.createMany({
      data: { loginKey: login.key, retainUntil: login.retainUntil },
      skipDuplicates: true,
    });
    if (receipt.count && staffExists && login.assistance) {
      await tx.harborAssistanceSession.updateMany({
        where: { loginKey: login.key, endedAt: null },
        data: { endedAt: now, endReason: "HARBOR_LOGOUT", endedByStaffId: login.claim.uid },
      });
      await tx.harborAuditEvent.create({ data: {
        staffId: login.claim.uid, action: "ASSISTANCE_LOGIN_END", createdAt: now,
      } });
    }
  });
}
