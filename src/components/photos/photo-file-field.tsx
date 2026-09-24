import { IMAGE_ACCEPT } from "@/lib/photo-attachments";

type Props = {
  name?: string;
  multiple?: boolean;
  maxCount: number;
  label?: string;
  helper?: string;
  testId?: string;
  className?: string;
};

export function PhotoFileField({
  name = "photos",
  multiple = false,
  maxCount,
  label = "Photos",
  helper,
  testId,
  className = "",
}: Props) {
  const defaultHelper = multiple
    ? `JPEG, PNG, WebP, or GIF · up to ${maxCount} photos · 8 MB each`
    : "JPEG, PNG, WebP, or GIF · 8 MB max";
  return (
    <label className={`flex flex-col gap-1 text-sm text-zinc-700 ${className}`.trim()}>
      <span className="font-medium text-zinc-900">{label}</span>
      <input
        type="file"
        name={name}
        accept={IMAGE_ACCEPT}
        multiple={multiple}
        className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-50"
        data-testid={testId}
      />
      <span className="text-xs text-zinc-500">{helper ?? defaultHelper}</span>
    </label>
  );
}
