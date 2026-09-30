import { VssylMark } from "@/components/brand/vssyl-mark";

type VssylLockupTone = "brand" | "inverse";
type VssylLockupSize = "header" | "auth" | "console" | "marketing";

type VssylLockupProps = {
  /** brand = dark mark + wordmark on light; inverse = light family on deep teal. */
  tone?: VssylLockupTone;
  size?: VssylLockupSize;
  className?: string;
};

const SIZE: Record<
  VssylLockupSize,
  { mark: string; wordmark: string; gap: string }
> = {
  header: {
    mark: "h-7 w-7",
    wordmark: "text-[15px] font-semibold tracking-[0.04em] sm:text-base",
    gap: "gap-1.5",
  },
  auth: {
    mark: "h-10 w-10 sm:h-11 sm:w-11",
    wordmark: "text-2xl font-semibold tracking-[0.06em] sm:text-3xl",
    gap: "gap-2.5",
  },
  console: {
    mark: "h-8 w-8",
    wordmark: "text-lg font-semibold tracking-[0.05em]",
    gap: "gap-2",
  },
  marketing: {
    mark: "h-8 w-8",
    wordmark: "text-lg font-semibold tracking-[0.05em]",
    gap: "gap-2",
  },
};

/**
 * Canonical Vssyl mark + wordmark. Use instead of a lone tile or text kicker.
 */
export function VssylLockup({
  tone = "brand",
  size = "header",
  className = "",
}: VssylLockupProps) {
  const spec = SIZE[size];
  const toneClass = tone === "inverse" ? "text-[#e7f7f4]" : "text-[#0b3d3a]";

  return (
    <span
      className={`inline-flex min-w-0 items-center ${spec.gap} ${toneClass} ${className}`.trim()}
      role="img"
      aria-label="Vssyl"
    >
      <VssylMark tone={tone} aria-hidden className={`shrink-0 ${spec.mark}`} />
      <span className={`whitespace-nowrap leading-none ${spec.wordmark}`}>VSSYL</span>
    </span>
  );
}
