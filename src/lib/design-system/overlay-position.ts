/** Keep a measured floating surface inside even a short or zoomed viewport. */
export function constrainOverlayPosition({
  x,
  y,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin = 8,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}) {
  const maxWidth = Math.max(0, viewportWidth - margin * 2);
  const maxHeight = Math.max(0, viewportHeight - margin * 2);
  const visibleWidth = Math.min(width, maxWidth);
  const visibleHeight = Math.min(height, maxHeight);
  return {
    left: Math.max(margin, Math.min(x, viewportWidth - visibleWidth - margin)),
    top: Math.max(margin, Math.min(y, viewportHeight - visibleHeight - margin)),
    maxWidth,
    maxHeight,
  };
}
