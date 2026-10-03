import type { SupportAttachmentRejectionReason, SupportAttachmentScanStatus } from "@prisma/client";

import { describeSupportAttachmentType, formatSupportAttachmentSize } from "./attachment-limits";
import type { SupportTimelineAttachment } from "./timeline";

export type SupportAttachmentView = {
  id: string;
  filename: string;
  detail: string;
  statusLabel: string;
  downloadHref: string | null;
};

export function presentSupportAttachment(attachment: SupportTimelineAttachment): SupportAttachmentView {
  const typeLabel = describeSupportAttachmentType(attachment.contentType);
  const sizeLabel = formatSupportAttachmentSize(attachment.sizeBytes);
  const detail = attachment.sizeBytes > 0 ? `${sizeLabel} · ${typeLabel}` : typeLabel;
  return {
    id: attachment.id,
    filename: attachment.filename,
    detail,
    statusLabel: statusLabel(attachment.scanStatus, attachment.rejectionReason),
    downloadHref:
      attachment.scanStatus === "CLEAN" ? `/api/console/support-attachments/${attachment.id}` : null,
  };
}

function statusLabel(
  status: SupportAttachmentScanStatus,
  reason: SupportAttachmentRejectionReason | null,
): string {
  if (status === "CLEAN") return "Download";
  if (status === "PENDING") return "Security scan pending";
  if (status === "SCAN_FAILED") return "Unavailable — scan failed";
  if (reason === "OVERSIZE") return "Blocked · too large";
  if (reason === "BLOCKED_TYPE") return "Blocked";
  if (reason === "INVALID_BASE64") return "Blocked · file could not be read";
  if (reason === "STORAGE_UNAVAILABLE" || reason === "STORAGE_FAILED") return "Unavailable — storage failed";
  return "Blocked";
}
