import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

type HarborAuthFrameProps = {
  kicker?: string;
  title: string;
  description: string;
  points?: readonly string[];
  actions?: ReactNode;
  children: ReactNode;
};

/** Real product capabilities shown on public Harbor pages. */
export const HARBOR_PRODUCT_POINTS = [
  "Facility Builder — floors, rooms, departments, and how the building actually works",
  "Employee Manager — roster, job roles, and who covers each location",
  "Asset Manager — equipment, vendors, and repair follow-up",
  "Today's Work — walk lists, logs, and issues for the current shift",
] as const;

const FRAME_STYLE: CSSProperties = {
  minHeight: "100vh",
  background: "#e8eef3",
  color: "#12202c",
};

const ASIDE_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  background: "#0b3d3a",
  color: "#e7f7f4",
  padding: "2.5rem 3rem",
};

const MUTED: CSSProperties = { color: "#9ecac3" };

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  minHeight: "2.75rem",
  alignItems: "center",
  borderRadius: "0.5rem",
  background: "#ffffff",
  color: "#0b3d3a",
  padding: "0.75rem 1.25rem",
  fontSize: "0.875rem",
  fontWeight: 600,
};

const SECONDARY_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  minHeight: "2.75rem",
  alignItems: "center",
  borderRadius: "0.5rem",
  border: "1px solid #9ecac3",
  background: "transparent",
  color: "#e7f7f4",
  padding: "0.75rem 1.25rem",
  fontSize: "0.875rem",
  fontWeight: 600,
};

/**
 * Public-page chrome from the Harbor design-lab: deep teal aside + cool canvas.
 * Used on landing, login, and signup so intro/Run surfaces share one look.
 */
export function HarborAuthFrame({
  kicker = "LTC Manager",
  title,
  description,
  points,
  actions,
  children,
}: HarborAuthFrameProps) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2" style={FRAME_STYLE}>
      <style>{`
        .harbor-auth-aside a.harbor-aside-primary,
        .harbor-auth-aside a[href="/signup"] {
          background-color: #ffffff !important;
          color: #0b3d3a !important;
        }
        .harbor-auth-aside a.harbor-aside-secondary,
        .harbor-auth-aside a[href="/login"] {
          background-color: transparent !important;
          color: #e7f7f4 !important;
        }
      `}</style>
      <aside className="harbor-auth-aside" style={ASIDE_STYLE}>
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={MUTED}>
            {kicker}
          </p>
          <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
          <p className="max-w-md text-base leading-relaxed" style={MUTED}>
            {description}
          </p>
          {actions ? <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div> : null}
        </div>
        {points && points.length > 0 ? (
          <ul className="mt-10 list-disc space-y-2 pl-5 text-sm" style={MUTED}>
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        ) : null}
      </aside>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">{children}</div>
    </div>
  );
}

export function HarborAsidePrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="harbor-aside-primary" style={PRIMARY_BUTTON_STYLE}>
      {children}
    </Link>
  );
}

export function HarborAsideSecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="harbor-aside-secondary" style={SECONDARY_BUTTON_STYLE}>
      {children}
    </Link>
  );
}
