import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

const navLinkClass =
  "text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--foreground)]";

const primaryCtaClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0b3d3a] px-5 text-sm font-semibold text-white hover:bg-[#0a3532]";

const secondaryCtaClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-[#12202c] bg-white px-5 text-sm font-semibold text-[#12202c] hover:bg-[var(--run-surface)]";

const heroSecondaryCtaClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-white/80 bg-transparent px-5 text-sm font-semibold text-white hover:bg-white/10";

export function MarketingLandingPage({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,white)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
          <a href="#top" className="text-sm font-semibold tracking-tight text-[#0b3d3a]">
            LTC Manager
          </a>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Page">
            <a href="#product" className={navLinkClass}>
              Product
            </a>
            <a href="#how-it-works" className={navLinkClass}>
              How it works
            </a>
            <a href="#pricing" className={navLinkClass}>
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={signupEnabled ? `${navLinkClass} px-2 py-2` : primaryCtaClass}
            >
              Sign in
            </Link>
            {signupEnabled ? (
              <Link href="/signup" className={primaryCtaClass}>
                Start free setup
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative min-h-[34rem] overflow-hidden bg-[#0b3d3a] text-white lg:min-h-[40rem]">
          <Image
            src="/marketing/hero-servery-morning.png"
            alt="A quiet servery before breakfast, tablet on the pass"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b3d3a]/95 via-[#0b3d3a]/55 to-[#0b3d3a]/20" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ecac3]">
                Dietary · EVS · Plant Ops
              </p>
              <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
                How is today going?
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-[#d7eeea]">
                See coverage, readiness, logs, and issues for this meal — from the
                manager’s board and the tablet on the floor.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {signupEnabled ? (
                  <Link
                    href="/signup"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-[#0b3d3a] hover:bg-[#e7f7f4]"
                  >
                    Start free setup
                  </Link>
                ) : null}
                <Link
                  href="/login"
                  className={signupEnabled ? heroSecondaryCtaClass : "inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-[#0b3d3a] hover:bg-[#e7f7f4]"}
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-4">
                <a href="#the-day" className="text-sm font-medium text-[#9ecac3] hover:text-white">
                  See how a day runs
                </a>
              </p>
            </div>
            <HeroProductFrame />
          </div>
        </section>

        <section id="the-day" className="border-b border-[var(--border)] bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
              A day on the floor
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
              One picture of the meal — from open to handoff.
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--text-secondary)]">
              Before service, during service, when something breaks, and after. The
              same facts, wherever you are standing.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DayCard
                image="/marketing/day-before-service.png"
                imageAlt="A commercial kitchen before service"
                time="6:10"
                title="Before service"
                label="Coverage"
                body="See who is on, who called down, and which locations are short — before the first tray goes out."
              />
              <DayCard
                image="/marketing/day-during-service.png"
                imageAlt="A tray line during lunch"
                time="7:02"
                title="During service"
                label="Ready"
                body="Each location shows whether it is ready, in progress, or needs attention. You do not assemble the picture from the radio."
              />
              <DayCard
                image="/marketing/day-warmer-service.png"
                imageAlt="A technician working on an empty kitchen warmer"
                time="10:40"
                title="When something breaks"
                label="Issues"
                body="A warmer goes down. The issue lives on that location, with a next step — not in a text thread."
              />
              <DayCard
                image="/marketing/day-after-reset.png"
                imageAlt="A dining room being reset after the meal"
                time="2:15"
                title="After"
                label="Already recorded"
                body="Logs and handoffs are attached to the work that just happened. Survey time is not a scavenger hunt."
              />
            </div>
          </div>
        </section>

        <section id="product" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
            The product
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Three places to stand. One picture of the day.
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <HomeCard
              name="Workspace"
              question="What needs me now?"
              body="The manager’s board. Exceptions first. Ready locations stay quiet."
              frame={<WorkspaceMini />}
            />
            <HomeCard
              name="Today’s Work"
              question="Where should I walk next?"
              body="The supervisor walk: coverage, call-downs, and locations that need attention."
              frame={<TodaysWorkMini />}
            />
            <HomeCard
              name="Unit Workspace"
              question="What do I do here?"
              body="A tablet at this location. PIN in. The next log, the next mark, the next issue — nothing else."
              frame={<UnitMini />}
            />
          </div>
        </section>

        <section className="bg-[#0b3d3a] text-[#e7f7f4]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ecac3]">
              One product
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white">
              Start with dietary. Add EVS and Plant Ops when you are ready.
            </h2>
            <p className="mt-4 max-w-2xl text-[#9ecac3]">
              The same board, licensed by the departments you run. Unlimited people
              at every role.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <DepartmentCard
                name="Dietary"
                body="Meal periods, servery readiness, coverage, and the logs that happen during service."
                image="/marketing/hero-servery-morning.png"
                imageAlt="A servery pass before breakfast"
              />
              <DepartmentCard
                name="EVS"
                body="Zones, rounds, and what still needs a walk before the next service window."
                image="/marketing/dept-evs-cart.png"
                imageAlt="An EVS cart in a quiet corridor"
              />
              <DepartmentCard
                name="Plant Ops"
                body="Assets, repairs, and the issues that keep a location from being ready."
                image="/marketing/dept-plant-ops.png"
                imageAlt="A Plant Ops technician at an air handler"
              />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
              <Image
                src="/marketing/supervisor-tablet-walk.png"
                alt="A supervisor checking a tablet in the dining room"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Built for the people who run the meal.
              </h2>
              <div className="mt-8 space-y-6">
                <PrincipleCard
                  title="Tablet and PIN"
                  body="Staff sign in at the location. They do not hunt for a portal, and they do not carry the whole facility on one screen."
                />
                <PrincipleCard
                  title="During the work, not after"
                  body="Logs and meal marks happen on the floor, while the meal is happening. Documentation is a byproduct of doing the work."
                />
                <PrincipleCard
                  title="Knowledge stays with the work"
                  body="Procedures sit on the unit, the issue, and the asset — not in a separate binder someone has to go find."
                />
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-[var(--border)] bg-[var(--background)]">
          <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
              Pricing
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              One product. Unlimited users.
            </h2>
            <p className="mt-4 text-[var(--text-secondary)]">
              You pay for the first department — not for seats, rooms, or logs.
            </p>
            <div className="mt-10 rounded-2xl border border-[var(--border)] bg-white px-8 py-10">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">First department</p>
              <p className="mt-3 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-semibold tracking-tight">$299</span>
                <span className="text-base text-[var(--text-muted)]">/month</span>
              </p>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Usually Dietary. Facility foundation included.
              </p>
              <p className="mt-3 text-sm font-medium text-[#0b3d3a]">
                Additional departments are $149/month.
              </p>
              {signupEnabled ? (
                <Link href="/signup" className={`${primaryCtaClass} mt-8 w-full`}>
                  Start free setup
                </Link>
              ) : (
                <Link href="/login" className={`${primaryCtaClass} mt-8 w-full`}>
                  Sign in
                </Link>
              )}
            </div>
            <p className="mt-6 text-sm leading-relaxed text-[var(--text-muted)]">
              Annual billing is 10% off. Self-setup is included. Assisted setup is
              optional, about $1,500 for the first department.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            How is today going?
          </h2>
          <p className="mt-4 text-lg text-[var(--text-secondary)]">
            Answer it in fifteen seconds — without leaving the floor.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {signupEnabled ? (
              <Link href="/signup" className={primaryCtaClass}>
                Start free setup
              </Link>
            ) : null}
            <Link href="/login" className={signupEnabled ? secondaryCtaClass : primaryCtaClass}>
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-semibold text-[#0b3d3a]">LTC Manager</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Operations for dietary, EVS, and Plant Ops.
            </p>
          </div>
          <div className="flex gap-4 text-sm text-[var(--text-secondary)]">
            <Link href="/login" className="hover:text-[var(--foreground)]">
              Sign in
            </Link>
            {signupEnabled ? (
              <Link href="/signup" className="hover:text-[var(--foreground)]">
                Start free setup
              </Link>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}

function DayCard({
  image,
  imageAlt,
  time,
  title,
  label,
  body,
}: {
  image: string;
  imageAlt: string;
  time: string;
  title: string;
  label: string;
  body: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]">
      <div className="relative aspect-[4/3]">
        <Image src={image} alt={imageAlt} fill className="object-cover" />
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold tabular-nums text-[#0f766e]">{time}</p>
        <h3 className="mt-2 text-base font-semibold">{title}</h3>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{body}</p>
      </div>
    </article>
  );
}

function HomeCard({
  name,
  question,
  body,
  frame,
}: {
  name: string;
  question: string;
  body: string;
  frame: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      <div className="bg-[#e8eef3] p-4">{frame}</div>
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0f766e]">{name}</p>
        <h3 className="mt-2 text-lg font-semibold">{question}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{body}</p>
      </div>
    </article>
  );
}

function DepartmentCard({
  name,
  body,
  image,
  imageAlt,
}: {
  name: string;
  body: string;
  image: string;
  imageAlt: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#1a5c57] bg-[#0e4844]">
      <div className="relative aspect-[4/3]">
        <Image src={image} alt={imageAlt} fill className="object-cover" />
      </div>
      <div className="p-5">
        <h3 className="text-base font-semibold text-white">{name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#9ecac3]">{body}</p>
      </div>
    </article>
  );
}

function PrincipleCard({ title, body }: { title: string; body: string }) {
  return (
    <article>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{body}</p>
    </article>
  );
}

function HeroProductFrame() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-white/20 bg-white p-3 shadow-[0_24px_60px_-28px_rgba(8,20,24,0.55)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-[#0b3d3a]">Workspace</span>
          <span className="rounded-full bg-[#fff4eb] px-2 py-0.5 text-[10px] font-semibold text-[#9a3412]">
            Lunch · 11:40
          </span>
        </div>
        <WorkspaceMini />
      </div>
      <div className="absolute -bottom-8 right-4 hidden w-[220px] rounded-2xl border border-white/30 bg-white p-3 shadow-[0_18px_40px_-20px_rgba(8,20,24,0.5)] sm:block">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-[#0b3d3a]">2 West · Tablet</span>
          <span className="text-[10px] text-[var(--text-muted)]">PIN</span>
        </div>
        <UnitMini compact />
      </div>
    </div>
  );
}

function WorkspaceMini() {
  return (
    <div className="space-y-2 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-[var(--border)]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[#12202c]">What needs me</span>
        <span className="text-[var(--text-muted)]">Dietary</span>
      </div>
      <MiniRow tone="alert" title="2 West" detail="Warmer down · Needs attention" />
      <MiniRow tone="progress" title="South dining" detail="One call-down · coverage short" />
      <MiniRow tone="ready" title="3 East" detail="Ready for lunch" />
    </div>
  );
}

function TodaysWorkMini() {
  return (
    <div className="space-y-2 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-[var(--border)]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[#12202c]">Walk list</span>
        <span className="text-[var(--text-muted)]">4 locations</span>
      </div>
      <MiniRow tone="alert" title="2 West" detail="Needs attention" />
      <MiniRow tone="progress" title="Kitchen" detail="In progress" />
      <MiniRow tone="ready" title="3 East" detail="Ready" />
    </div>
  );
}

function UnitMini({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-2 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-[var(--border)]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[#12202c]">Next</span>
        <span className="text-[var(--text-muted)]">2 West</span>
      </div>
      <div className="rounded-md bg-[var(--run-surface)] px-3 py-2">
        <p className="text-[11px] font-semibold text-[#0b3d3a]">Opening temperature log</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Due for lunch</p>
      </div>
      {compact ? null : (
        <div className="rounded-md border border-[var(--border)] px-3 py-2">
          <p className="text-[11px] font-semibold">Report an issue</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">This location</p>
        </div>
      )}
    </div>
  );
}

function MiniRow({
  tone,
  title,
  detail,
}: {
  tone: "alert" | "progress" | "ready";
  title: string;
  detail: string;
}) {
  const dot =
    tone === "alert" ? "bg-[#b91c1c]" : tone === "progress" ? "bg-[#b45309]" : "bg-[#047857]";

  return (
    <div className="flex items-start gap-2 rounded-md border border-[var(--border)] px-2.5 py-2">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <div>
        <p className="text-[11px] font-semibold text-[#12202c]">{title}</p>
        <p className="text-[10px] text-[var(--text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}
