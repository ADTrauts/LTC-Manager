import { attachmentFileHref, type AttachmentListItem } from "@/lib/attachments";
import { isDisplayableImageMimeType } from "@/lib/photo-attachments";

type Props = {
  photos: AttachmentListItem[];
  emptyLabel?: string;
  testId?: string;
  removeAction?: (formData: FormData) => void | Promise<void>;
  removeHiddenFields?: Record<string, string>;
  canRemove?: boolean;
  size?: "sm" | "md";
};

export function PhotoGallery({
  photos,
  emptyLabel,
  testId = "photo-gallery",
  removeAction,
  removeHiddenFields,
  canRemove = false,
  size = "md",
}: Props) {
  if (photos.length === 0) {
    return emptyLabel ? (
      <p className="text-sm text-zinc-500" data-testid={testId}>
        {emptyLabel}
      </p>
    ) : null;
  }

  const frameClass = size === "sm" ? "h-16 w-16" : "h-28 w-28 sm:h-32 sm:w-32";

  return (
    <ul className="flex flex-wrap gap-3" data-testid={testId}>
      {photos.map((photo) => {
        const href = attachmentFileHref(photo.id);
        const image = isDisplayableImageMimeType(photo.mimeType);
        return (
          <li key={photo.id} className="space-y-1" data-testid="photo-gallery-item">
            {image ? (
              <a href={href} target="_blank" rel="noreferrer" className="block">
                {/* Uploaded facility photos are served from an authenticated same-origin route. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={href}
                  alt={photo.originalFilename}
                  className={`${frameClass} rounded-md border border-zinc-200 object-cover bg-zinc-100`}
                />
              </a>
            ) : (
              <a
                href={href}
                className="block max-w-[8rem] truncate text-sm font-medium underline underline-offset-2"
              >
                {photo.originalFilename}
              </a>
            )}
            {canRemove && removeAction ? (
              <form action={removeAction}>
                {removeHiddenFields
                  ? Object.entries(removeHiddenFields).map(([key, value]) => (
                      <input key={key} type="hidden" name={key} value={value} />
                    ))
                  : null}
                <input type="hidden" name="attachmentId" value={photo.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
                >
                  Remove
                </button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PhotoThumb({
  attachmentId,
  alt,
  className = "h-12 w-12 rounded-md border border-zinc-200 object-cover bg-zinc-100",
}: {
  attachmentId: string;
  alt: string;
  className?: string;
}) {
  const href = attachmentFileHref(attachmentId);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={href} alt={alt} className={className} />
  );
}
