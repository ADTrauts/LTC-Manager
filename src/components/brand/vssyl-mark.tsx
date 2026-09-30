import type { SVGProps } from "react";

type VssylMarkTone = "brand" | "inverse";

type VssylMarkProps = SVGProps<SVGSVGElement> & {
  /** brand = teal family on light; inverse = light family on a teal tile. */
  tone?: VssylMarkTone;
  title?: string;
};

/**
 * Application V-mark: segmented left stroke, solid right stroke.
 * Geometry is a restrained approximation — not a locked production lockup.
 */
export function VssylMark({
  tone = "brand",
  title = "Vssyl",
  className = "",
  ...rest
}: VssylMarkProps) {
  const left =
    tone === "inverse"
      ? ["#c5e6e1", "#9ecac3", "#6fb3aa", "#e7f7f4"]
      : ["#148f85", "#0f766e", "#0c5f58", "#0b3d3a"];
  const right = tone === "inverse" ? "#e7f7f4" : "#0b3d3a";

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      {...rest}
    >
      <title>{title}</title>
      <polygon fill={left[0]} points="8,8 24,8 26.5,20 12.5,20" />
      <polygon fill={left[1]} points="12.5,20 26.5,20 29,32 15,32" />
      <polygon fill={left[2]} points="15,32 29,32 31.5,44 17.5,44" />
      <polygon fill={left[3]} points="17.5,44 31.5,44 34,56 22,56" />
      <polygon fill={right} points="40,8 56,8 36,56 26,56" />
    </svg>
  );
}
