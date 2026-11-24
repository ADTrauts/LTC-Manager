import Image from "next/image";
import Link from "next/link";

import { VssylLockup } from "@/components/brand/vssyl-lockup";
import { FacilityArtwork, FilmPlayer, MobileMenu } from "./landing-interactions";
import styles from "./landing-page.module.css";

const sectionLinks = [
  { href: "#the-day", label: "A day on the floor" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#product", label: "Product" },
  { href: "#departments", label: "Departments" },
  { href: "#pricing", label: "Pricing" },
];

function PageLinks() {
  return sectionLinks.map(({ href, label }) => <a key={href} href={href}>{label}</a>);
}

function Arrow() {
  return <span className={styles.arrow} aria-hidden="true">↗</span>;
}

type ScreenProps = {
  name: "dashboard" | "rhythm" | "rounds" | "floor" | "plant";
  label: string;
  alt: string;
  sizes: string;
};

const screenDimensions = {
  dashboard: [410, 468],
  rhythm: [346, 332],
  rounds: [744, 638],
  floor: [836, 670],
  plant: [744, 640],
} as const;

function Screen({ name, label, alt, sizes }: ScreenProps) {
  const src = "/marketing/screens/" + name + ".webp";
  const dimensions = screenDimensions[name];
  return (
    <a className={styles.screen} href={src} aria-label={"Enlarge " + label}>
      <Image className={styles.screenImage} src={src} alt={alt}
        width={dimensions[0]} height={dimensions[1]} sizes={sizes} />
      <span className={styles.screenCaption}>Enlarge {label} <Arrow /></span>
    </a>
  );
}

export function MarketingLandingPage({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <div className={styles.page}>
      <link rel="preload" as="image" href="/marketing/films/facility-small.webp"
        media="(max-width: 480px)" fetchPriority="high" />
      <a className={styles.skip} href="#top">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href="#top" aria-label="Vssyl home"><VssylLockup tone="brand" size="marketing" /></a>
          <nav className={styles.desktopLinks} aria-label="Page sections"><PageLinks /></nav>
          <div className={styles.headerActions}>
            <Link href="/login" className={styles.signIn}>Sign in <Arrow /></Link>
            {signupEnabled ? <Link className={styles.desktopSignup} href="/signup">Start free setup</Link> : null}
            <MobileMenu>
              <PageLinks />
              {signupEnabled ? <Link href="/signup">Start free setup</Link> : null}
            </MobileMenu>
          </div>
        </div>
      </header>

      <main id="top" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Business Operations Platform</p>
            <h1 id="hero-title">Your operations. All together.</h1>
            <p className={styles.heroDescription}>
              Plan the work for Food &amp; Nutrition and Plant Operations. See today’s coverage,
              records and maintenance requests in Vssyl.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#the-day">
                <span className={styles.playIcon} aria-hidden="true" /> See a day at Vssyl
              </a>
              <a className={styles.textAction} href="#departments">Explore departments <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <FacilityArtwork />
        </section>

        <section id="the-day" tabIndex={-1} className={styles.day} aria-labelledby="day-title">
          <div className={styles.dayInner}>
            <div className={styles.storyCopy}>
              <p className={styles.eyebrow}>A day on the floor</p>
              <h2 id="day-title">The Day Doesn’t Wait</h2>
              <p>Breakfast starts at 7:30. A call-off leaves a servery short, and a walk-in cooler is warming up.</p>
              <div className={styles.handoff}>
                <Image src="/marketing/films/kitchen.webp" width={160} height={90}
                  alt="" sizes="(max-width: 799px) 80px, 100px" />
                <p>The kitchen moves food to an approved backup. Plant reviews the request and opens a repair work order.</p>
              </div>
            </div>
            <FilmPlayer film="day" title="The Day Doesn’t Wait" duration="2:22"
              sizes="(max-width: 799px) calc(100vw - 32px), (max-width: 1399px) 58vw, 750px" />
          </div>
        </section>

        <section id="how-it-works" tabIndex={-1} className={styles.section} aria-labelledby="plan-title">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 id="plan-title">Build the plan. Run the day.</h2>
          </div>
          <div className={styles.planGrid}>
            <FilmPlayer film="plan" title="Build the Plan. Run the Day" duration="2:02"
              sizes="(max-width: 799px) calc(100vw - 32px), (max-width: 1399px) 58vw, 750px" />
            <div className={styles.modeList}>
              <article className={styles.buildMode}>
                <p className={styles.modeLabel}>Build</p>
                <h3>Before service</h3>
                <p>Set the meal period, coverage needs and records for the rooms where the work happens.</p>
                <a href="#breakfast-plan" className={styles.textAction}>See the breakfast plan <span aria-hidden="true">↓</span></a>
              </article>
              <article className={styles.runMode}>
                <p className={styles.modeLabel}>Run</p>
                <h3>During the shift</h3>
                <p>Review coverage, record a reading and follow up on equipment that needs attention.</p>
                <a href="#product" className={styles.textAction}>See the Dashboard <span aria-hidden="true">↓</span></a>
              </article>
            </div>
          </div>
        </section>

        <section id="product" tabIndex={-1} className={styles.product} aria-labelledby="product-title">
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Inside Vssyl</p>
              <h2 id="product-title">The view from each role.</h2>
              <p>Explore three views from the same sample facility.</p>
            </div>
            <div className={styles.roleGrid}>
              <article>
                <p className={styles.roleName}>Manager · Dashboard</p>
                <h3>What needs me now?</h3>
                <p>Find the servery cooler under Needs attention.</p>
                <Screen name="dashboard" label="Dashboard" alt="A Food & Nutrition Dashboard with the servery cooler under Needs attention."
                  sizes="(max-width: 799px) calc(100vw - 56px), (max-width: 1399px) 30vw, 410px" />
              </article>
              <article>
                <p className={styles.roleName}>Supervisor · Rounds</p>
                <h3>Where should I walk next?</h3>
                <p>Compare coverage and service status for Garden and Willow on the routine walk.</p>
                <Screen name="rounds" label="Rounds" alt="The Routine walk lists service and coverage for Garden and Willow neighborhoods."
                  sizes="(max-width: 799px) calc(100vw - 56px), (max-width: 1399px) 30vw, 410px" />
              </article>
              <article>
                <p className={styles.roleName}>Floor team · Location</p>
                <h3>What do I do here?</h3>
                <p>At Garden Servery, a server signs in by PIN on the bound device to see their assignment and the next point in service.</p>
                <Screen name="floor" label="floor view" alt="A server’s Garden Servery workspace shows their responsibility and when dinner ends."
                  sizes="(max-width: 799px) calc(100vw - 56px), (max-width: 1399px) 30vw, 410px" />
              </article>
            </div>
          </div>
        </section>

        <section id="departments" tabIndex={-1} className={styles.section} aria-labelledby="departments-title">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Available departments</p>
            <h2 id="departments-title">Two teams, one facility.</h2>
            <p>Available for hospitals and long-term care facilities.</p>
          </div>
          <div className={styles.departmentGrid}>
            <article id="breakfast-plan" tabIndex={-1}>
              <h3>Food &amp; Nutrition</h3>
              <p>Plan meals and coverage, set the rhythm of service and keep records where the work happens.</p>
              <Screen name="rhythm" label="Operating Rhythm" alt="Breakfast service and readiness entries in the sample Food & Nutrition Operating Rhythm."
                sizes="(max-width: 799px) calc(100vw - 56px), (max-width: 1399px) 45vw, 590px" />
            </article>
            <article>
              <h3>Plant Operations</h3>
              <p>Review maintenance requests, manage work orders, track asset history and schedule preventive maintenance.</p>
              <Screen name="plant" label="Plant Operations" alt="A Plant Operations work order to inspect a leak at the Garden Servery sink."
                sizes="(max-width: 799px) calc(100vw - 56px), (max-width: 1399px) 45vw, 590px" />
            </article>
          </div>
        </section>

        <section id="pricing" tabIndex={-1} className={styles.pricing} aria-labelledby="price-title">
          <div className={styles.pricingInner}>
            <div>
              <p className={styles.eyebrow}>Pricing</p>
              <h2 id="price-title">License the departments you run.</h2>
              <p>One facility foundation. Unlimited users across your licensed departments.</p>
              {signupEnabled ? <Link className={styles.primary} href="/signup">Start free setup <Arrow /></Link> : null}
            </div>
            <div className={styles.priceDetails}>
              <div className={styles.priceRow}><h3>First department</h3><p><strong>$299</strong> / month</p></div>
              <div className={styles.priceRow}><h3>Each additional department</h3><p><strong>$149</strong> / month</p></div>
              <p>Prices in USD. Save 10% with annual prepayment. Self-setup is included.</p>
              <details className={styles.feeDetails}>
                <summary>Optional assisted setup</summary>
                <p>Each separately approved engagement costs $1,500 for its first department and $500 for each additional department in that engagement.</p>
              </details>
            </div>
          </div>
        </section>

        <section className={styles.close} aria-labelledby="close-title">
          <h2 id="close-title">How is today going?</h2>
          <div className={styles.actions}>
            <a href="#product" className={styles.lightButton}>Explore the product <span aria-hidden="true">↑</span></a>
            {signupEnabled ? <Link className={styles.lightLink} href="/signup">Start free setup <Arrow /></Link> : null}
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <VssylLockup tone="brand" size="marketing" />
        <p>Your operations. All together.</p>
        <Link href="/login" className={styles.textAction}>Sign in <Arrow /></Link>
      </footer>
    </div>
  );
}
