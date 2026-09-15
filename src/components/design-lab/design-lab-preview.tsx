"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import {
  DESIGN_SCREENS,
  MOCK_ADMIN,
  MOCK_BRIEF,
  MOCK_FACILITY,
  MOCK_METRICS,
  MOCK_NAV,
  MOCK_TIME,
  MOCK_UNITS,
  MOCK_USER,
  MOCK_WORK,
  type DesignDirectionId,
  type DesignScreenId,
} from "@/components/design-lab/mock-data";

const ICON_MAP = {
  operationsCenter: LayoutDashboard,
  todaysWork: CalendarClock,
  locations: MapPin,
  review: FileBarChart,
  employees: Users,
  logs: ClipboardList,
  menus: UtensilsCrossed,
  assets: Package,
  kitchen: ChefHat,
  servery: ConciergeBell,
  retail: ShoppingBag,
  storage: Warehouse,
} satisfies Record<string, LucideIcon>;

function Icon({ name, className }: { name: keyof typeof ICON_MAP; className?: string }) {
  const Cmp = ICON_MAP[name];
  return <Cmp className={className ?? "h-3.5 w-3.5"} aria-hidden />;
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "alert" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span className="dl-badge" data-tone={tone}>
      {children}
    </span>
  );
}

function PreviewChrome({
  direction,
  screen,
}: {
  direction: DesignDirectionId;
  screen: DesignScreenId;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        borderBottom: "1px solid #e4e4e7",
        background: "#fff",
        padding: "0.55rem 0.85rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
        <Link
          href="/design-lab"
          style={{
            fontSize: "0.75rem",
            fontWeight: 650,
            color: "#52525b",
            textDecoration: "none",
          }}
        >
          ← Design lab
        </Link>
        <span style={{ color: "#d4d4d8" }}>·</span>
        <span style={{ fontSize: "0.75rem", color: "#71717a" }}>
          Preview only — production UI unchanged
        </span>
      </div>
      <div className="dl-tabs" style={{ marginTop: 0 }}>
        {DESIGN_SCREENS.map((item) => (
          <Link
            key={item.id}
            href={`/design-lab/${direction}?screen=${item.id}`}
            className="dl-tab"
            data-active={item.id === screen}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ShellHeader({ active }: { active?: string }) {
  return (
    <header className="dl-header">
      <div className="dl-brand">
        <div className="dl-brand-mark">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="dl-brand-kicker">LTC Manager</p>
          <p className="dl-brand-title">{MOCK_FACILITY}</p>
        </div>
      </div>
      <nav className="dl-nav" aria-label="Primary">
        {MOCK_NAV.map((item) => (
          <span
            key={item.label}
            className="dl-nav-item"
            data-active={active === item.label}
          >
            <Icon name={item.icon} />
            {item.label}
          </span>
        ))}
        <span className="dl-nav-item">
          Administration
        </span>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--dl-muted)" }}>{MOCK_USER}</span>
        <button type="button" className="dl-btn dl-btn-secondary" style={{ minHeight: "2rem" }}>
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      </div>
    </header>
  );
}

function LocationsRail({ activeUnitId }: { activeUnitId?: string }) {
  return (
    <aside className="dl-rail" aria-label="Locations">
      <div className="dl-rail-section">
        <p className="dl-rail-label">Operations</p>
        <div
          className="dl-rail-item"
          data-active={!activeUnitId}
        >
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
          Operations Center
        </div>
      </div>
      <div className="dl-rail-section">
        <p className="dl-rail-label">Locations</p>
        {MOCK_UNITS.map((unit) => (
          <div
            key={unit.id}
            className="dl-rail-item"
            data-active={activeUnitId === unit.id}
          >
            <Icon name={unit.kind} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {unit.name}
            </span>
            <StatusBadge
              tone={
                unit.state === "ready"
                  ? "ok"
                  : unit.state === "blocked"
                    ? "alert"
                    : unit.state === "warning"
                      ? "warn"
                      : "muted"
              }
            >
              {unit.state === "inProgress" ? "Live" : unit.state}
            </StatusBadge>
          </div>
        ))}
      </div>
      <div className="dl-rail-section">
        <p className="dl-rail-label">Admin</p>
        {MOCK_ADMIN.map((item) => (
          <div key={item.label} className="dl-rail-item">
            <Icon name={item.icon} />
            {item.label}
          </div>
        ))}
      </div>
    </aside>
  );
}

function LoginScreen() {
  return (
    <div className="dl-login">
      <aside className="dl-login-aside">
        <div>
          <p className="dl-brand-kicker" style={{ color: "var(--dl-login-aside-muted)" }}>
            LTC Manager
          </p>
          <h1
            style={{
              marginTop: "0.85rem",
              maxWidth: "18rem",
              fontSize: "2rem",
              fontWeight: 650,
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
            }}
          >
            Facility operations, without the noise.
          </h1>
          <p
            style={{
              marginTop: "0.85rem",
              maxWidth: "22rem",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              color: "var(--dl-login-aside-muted)",
            }}
          >
            Sign in to run today’s work, locations, staffing, and follow-ups from one calm workspace.
          </p>
        </div>
        <ul
          style={{
            display: "grid",
            gap: "0.65rem",
            margin: 0,
            padding: 0,
            listStyle: "none",
            fontSize: "0.875rem",
            color: "var(--dl-login-aside-muted)",
          }}
        >
          <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Clear readiness by location
          </li>
          <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Shift work without spreadsheet chase
          </li>
          <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Icons and structure over decoration
          </li>
        </ul>
      </aside>
      <div className="dl-login-panel">
        <div className="dl-login-card">
          <h2 style={{ fontSize: "1.15rem", fontWeight: 650 }}>Sign in</h2>
          <p style={{ marginTop: "0.35rem", fontSize: "0.875rem", color: "var(--dl-muted)" }}>
            Email and password for managers. Staff can use PIN at a unit device.
          </p>
          <div className="dl-field">
            <label htmlFor="dl-email">Email</label>
            <input id="dl-email" defaultValue="admin@terraceview.local" readOnly />
          </div>
          <div className="dl-field">
            <label htmlFor="dl-password">Password</label>
            <input id="dl-password" type="password" defaultValue="password" readOnly />
          </div>
          <button type="button" className="dl-btn dl-btn-primary" style={{ width: "100%", marginTop: "1.1rem" }}>
            Continue
          </button>
          <button type="button" className="dl-btn dl-btn-secondary" style={{ width: "100%", marginTop: "0.55rem" }}>
            Use staff PIN instead
          </button>
        </div>
      </div>
    </div>
  );
}

function OperationsScreen() {
  return (
    <div className="dl-shell">
      <ShellHeader active="Workspace" />
      <div className="dl-body">
        <LocationsRail />
        <main className="dl-main">
          <p className="dl-page-kicker">Operations Center</p>
          <h1 className="dl-page-title">Morning brief</h1>
          <p className="dl-page-sub">
            {MOCK_TIME}. Site pulse across locations, open work, and follow-ups that need a decision.
          </p>

          <div className="dl-grid-metrics">
            {MOCK_METRICS.map((metric) => (
              <article key={metric.label} className="dl-card">
                <p className="dl-metric-label">{metric.label}</p>
                <p className="dl-metric-value">{metric.value}</p>
                <p className="dl-metric-hint">{metric.hint}</p>
              </article>
            ))}
          </div>

          <section className="dl-panel">
            <div className="dl-panel-head">
              <h2 className="dl-panel-title">Needs attention</h2>
              <button type="button" className="dl-btn dl-btn-secondary">
                View all issues
              </button>
            </div>
            {MOCK_BRIEF.map((item) => (
              <div key={item.title} className="dl-row">
                <div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>{item.title}</p>
                  <p style={{ marginTop: "0.2rem", fontSize: "0.8125rem", color: "var(--dl-muted)" }}>
                    {item.detail}
                  </p>
                </div>
                <StatusBadge
                  tone={item.tone === "ok" ? "ok" : item.tone === "warn" ? "warn" : "alert"}
                >
                  {item.tone === "ok" ? "Clear" : item.tone === "warn" ? "Watch" : "Action"}
                </StatusBadge>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

function UnitScreen() {
  return (
    <div className="dl-shell">
      <ShellHeader active="Locations" />
      <div className="dl-body">
        <LocationsRail activeUnitId="servery-b" />
        <main className="dl-main">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <p className="dl-page-kicker">Unit workspace</p>
              <h1 className="dl-page-title">Servery B</h1>
              <p className="dl-page-sub">
                Live operation context for this location — readiness, queue, and quick issue capture.
              </p>
            </div>
            <StatusBadge tone="alert">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Blocked
            </StatusBadge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "0.85rem", marginTop: "1.15rem" }}>
            <section className="dl-panel" style={{ marginTop: 0 }}>
              <div className="dl-panel-head">
                <h2 className="dl-panel-title">Work queue</h2>
                <button type="button" className="dl-btn dl-btn-primary">
                  Start next
                </button>
              </div>
              {MOCK_WORK.slice(0, 4).map((item) => (
                <div key={item.title} className="dl-row">
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>{item.title}</p>
                    <p style={{ marginTop: "0.2rem", fontSize: "0.8125rem", color: "var(--dl-muted)" }}>
                      {item.meta}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      item.status === "Done"
                        ? "ok"
                        : item.status === "Blocked"
                          ? "alert"
                          : item.status === "In progress"
                            ? "warn"
                            : "muted"
                    }
                  >
                    {item.status}
                  </StatusBadge>
                </div>
              ))}
            </section>

            <section className="dl-panel" style={{ marginTop: 0 }}>
              <div className="dl-panel-head">
                <h2 className="dl-panel-title">Quick issue</h2>
              </div>
              <div style={{ padding: "1rem" }}>
                <div className="dl-field" style={{ marginTop: 0 }}>
                  <label htmlFor="dl-issue">What happened?</label>
                  <input id="dl-issue" defaultValue="Cold-hold probe reading out of range" readOnly />
                </div>
                <div className="dl-field">
                  <label htmlFor="dl-severity">Severity</label>
                  <input id="dl-severity" defaultValue="High — service impact" readOnly />
                </div>
                <button type="button" className="dl-btn dl-btn-primary" style={{ width: "100%", marginTop: "1rem" }}>
                  File issue
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function TodayScreen() {
  return (
    <div className="dl-shell">
      <ShellHeader active="Today's Work" />
      <div className="dl-body">
        <LocationsRail />
        <main className="dl-main">
          <p className="dl-page-kicker">Today&apos;s Work</p>
          <h1 className="dl-page-title">Walk list</h1>
          <p className="dl-page-sub">
            Ordered operational sequence for the shift — status signals stay quiet until something needs you.
          </p>

          <section className="dl-panel">
            <div className="dl-panel-head">
              <h2 className="dl-panel-title">AM sequence</h2>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button type="button" className="dl-btn dl-btn-secondary">
                  Coverage
                </button>
                <button type="button" className="dl-btn dl-btn-primary">
                  Open handoff
                </button>
              </div>
            </div>
            {MOCK_WORK.map((item) => (
              <div key={item.title} className="dl-row">
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <span
                    style={{
                      marginTop: "0.15rem",
                      display: "inline-flex",
                      height: "1.35rem",
                      width: "1.35rem",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "0.35rem",
                      background: "var(--dl-accent-soft)",
                      color: "var(--dl-fg)",
                    }}
                  >
                    <ClipboardList className="h-3 w-3" aria-hidden />
                  </span>
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>{item.title}</p>
                    <p style={{ marginTop: "0.2rem", fontSize: "0.8125rem", color: "var(--dl-muted)" }}>
                      {item.meta}
                    </p>
                  </div>
                </div>
                <StatusBadge
                  tone={
                    item.status === "Done"
                      ? "ok"
                      : item.status === "Blocked"
                        ? "alert"
                        : item.status === "In progress"
                          ? "warn"
                          : "muted"
                  }
                >
                  {item.status}
                </StatusBadge>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

export function DesignLabPreview({
  direction,
  screen,
}: {
  direction: DesignDirectionId;
  screen: DesignScreenId;
}) {
  return (
    <div className="dl-root" data-direction={direction}>
      <PreviewChrome direction={direction} screen={screen} />
      {screen === "login" ? <LoginScreen /> : null}
      {screen === "operations" ? <OperationsScreen /> : null}
      {screen === "unit" ? <UnitScreen /> : null}
      {screen === "today" ? <TodayScreen /> : null}
    </div>
  );
}
