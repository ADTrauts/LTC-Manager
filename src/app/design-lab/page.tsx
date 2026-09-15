import Link from "next/link";

import { DESIGN_DIRECTIONS, DESIGN_SCREENS } from "@/components/design-lab/mock-data";

const SWATCHES: Record<string, string[]> = {
  graphite: ["#0b1220", "#2563eb", "#eef0f3", "#ffffff", "#059669"],
  harbor: ["#0f766e", "#e8eef3", "#ffffff", "#12202c", "#b45309"],
  ink: ["#111111", "#f6f6f6", "#ffffff", "#0e7a3c", "#c1121f"],
  field: ["#172033", "#1d4ed8", "#eceae6", "#fbfaf8", "#b45309"],
};

export default function DesignLabIndexPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #fafafa 0%, #f4f4f5 100%)",
        color: "#18181b",
      }}
    >
      <div className="dl-gallery">
        <p
          style={{
            display: "inline-flex",
            border: "1px solid #d4d4d8",
            borderRadius: "0.375rem",
            padding: "0.25rem 0.55rem",
            fontSize: "0.6875rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#52525b",
            background: "#fff",
          }}
        >
          Design lab · not live
        </p>
        <h1
          style={{
            marginTop: "0.85rem",
            fontSize: "2rem",
            fontWeight: 650,
            letterSpacing: "-0.03em",
          }}
        >
          Redesign directions for review
        </h1>
        <p
          style={{
            marginTop: "0.55rem",
            maxWidth: "42rem",
            fontSize: "1rem",
            lineHeight: 1.55,
            color: "#52525b",
          }}
        >
          Four sleek, professional directions for LTC Manager. Production screens are untouched —
          open a direction, flip between sample screens, and approve or reject from screenshots.
          Each direction uses Lucide icons (no decorative imagery).
        </p>

        <div className="dl-gallery-grid">
          {DESIGN_DIRECTIONS.map((direction) => (
            <article key={direction.id} className="dl-gallery-card" style={{ cursor: "default" }}>
              <p
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#71717a",
                }}
              >
                {direction.tagline}
              </p>
              <h2 style={{ marginTop: "0.35rem", fontSize: "1.2rem", fontWeight: 650 }}>
                {direction.name}
              </h2>
              <p style={{ marginTop: "0.45rem", fontSize: "0.875rem", color: "#52525b", lineHeight: 1.5 }}>
                {direction.summary}
              </p>
              <p style={{ marginTop: "0.45rem", fontSize: "0.75rem", color: "#71717a" }}>
                References: {direction.references}
              </p>
              <div className="dl-swatch-row" aria-hidden>
                {(SWATCHES[direction.id] ?? []).map((color) => (
                  <span key={color} className="dl-swatch" style={{ background: color }} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {DESIGN_SCREENS.map((screen) => (
                  <Link
                    key={screen.id}
                    href={`/design-lab/${direction.id}?screen=${screen.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      minHeight: "2rem",
                      border: "1px solid #d4d4d8",
                      borderRadius: "0.375rem",
                      padding: "0.3rem 0.65rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#18181b",
                      textDecoration: "none",
                      background: "#fafafa",
                    }}
                  >
                    {screen.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>

        <section
          style={{
            marginTop: "1.75rem",
            border: "1px solid #e4e4e7",
            borderRadius: "0.75rem",
            background: "#fff",
            padding: "1.1rem 1.15rem",
          }}
        >
          <h2 style={{ fontSize: "1.05rem", fontWeight: 650 }}>Run vs Build (separate question)</h2>
          <p style={{ marginTop: "0.4rem", fontSize: "0.875rem", color: "#52525b", lineHeight: 1.5 }}>
            Product modes are different from Harbor colors. Run = operate today. Build = configure how
            the operation works. Preview the current subtle signal vs a clearer Build signal.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.75rem" }}>
            <Link
              href="/design-lab/run-build?mode=run&strength=current"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "2rem",
                border: "1px solid #d4d4d8",
                borderRadius: "0.375rem",
                padding: "0.3rem 0.65rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#18181b",
                textDecoration: "none",
                background: "#fafafa",
              }}
            >
              Run · as today
            </Link>
            <Link
              href="/design-lab/run-build?mode=build&strength=current"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "2rem",
                border: "1px solid #d4d4d8",
                borderRadius: "0.375rem",
                padding: "0.3rem 0.65rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#18181b",
                textDecoration: "none",
                background: "#fafafa",
              }}
            >
              Build · as today
            </Link>
            <Link
              href="/design-lab/run-build?mode=build&strength=bold"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "2rem",
                border: "1px solid #d4d4d8",
                borderRadius: "0.375rem",
                padding: "0.3rem 0.65rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#18181b",
                textDecoration: "none",
                background: "#fafafa",
              }}
            >
              Build · bolder
            </Link>
          </div>
        </section>

        <p style={{ marginTop: "1.75rem", fontSize: "0.8125rem", color: "#71717a" }}>
          Prefer a hybrid? Tell me which direction wins for shell chrome vs. content density, and we
          can compose a fifth option before touching production.
        </p>
      </div>
    </main>
  );
}
