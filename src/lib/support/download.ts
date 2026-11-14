import type { PrismaClient } from "@prisma/client";

import { implementationAttachmentScope, readImplementationSource } from "@/lib/implementation/service";
import type { Actor } from "@/lib/implementation/authority";
import { decideSupportAttachmentDownload } from "./attachments";
import { getSupportAttachmentStore, type SupportAttachmentStore } from "./attachment-store";
import { readVerifiedSupportAttachment } from "./scan-pending-attachments";

export async function readConsoleSupportAttachment(
  db: PrismaClient,
  actor: Extract<Actor, { kind: "staff" }>,
  attachmentId: string,
  store: SupportAttachmentStore | null = getSupportAttachmentStore(),
) {
  const attachment = await db.supportTicketAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: {
        select: {
          id: true,
          clientSubmissionId: true,
          ticket: { select: { implementationEngagement: { select: { id: true } } } },
        },
      },
    },
  });
  if (!attachment) return { outcome: "not_found" } as const;

  const scope = await implementationAttachmentScope(db, attachment.message);
  if (scope.kind === "unavailable") return { outcome: "forbidden" } as const;
  if (scope.kind === "implementation") {
    try {
      const file = await readImplementationSource(db, actor, scope.engagementId, attachmentId, store);
      return { outcome: "ok", file } as const;
    } catch {
      return { outcome: "forbidden" } as const;
    }
  }

  const decision = decideSupportAttachmentDownload({ actor: "harbor_staff", attachment });
  if (decision.outcome !== "ok") return decision;
  const bytes = await readVerifiedSupportAttachment(store, attachment);
  if (!bytes) return { outcome: "not_found" } as const;
  return {
    outcome: "ok",
    file: { bytes, filename: attachment.filename, contentType: attachment.contentType },
  } as const;
}
