"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";

import type { LandingDepartment } from "./landing-departments";
import styles from "./landing-page.module.css";

export function DepartmentExplorer({ departments }: { departments: LandingDepartment[] }) {
  const params = useSearchParams();
  const selected = departments.find(department => department.id === params.get("department")) ?? departments[0];
  if (!selected) return null;

  function chooseDepartment(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("department", id);
    url.hash = "departments";
    window.history.replaceState(null, "", url);
  }

  return (
    <section id="departments" tabIndex={-1} className={styles.section} aria-labelledby="departments-title">
      <div className={styles.explorerHeader}>
        <div>
          <h2 id="departments-title">Explore departments</h2>
          <p>For hospitals and long-term care facilities.</p>
        </div>
        <form action="/#departments" method="get" className={styles.departmentForm}>
          <label htmlFor="department-choice">Choose a department</label>
          <div className={styles.selectWrap}>
            <select id="department-choice" name="department" value={selected.id}
              aria-controls="department-profile" onChange={event => chooseDepartment(event.target.value)}>
              {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </div>
          <noscript><button className={styles.primary} type="submit">Show department</button></noscript>
        </form>
      </div>
      <article id="department-profile" className={styles.departmentProfile} aria-labelledby="department-story">
        <div className={styles.departmentPhoto}>
          <Image key={selected.image} src={selected.image} alt={selected.imageAlt} fill
            sizes="(max-width: 799px) calc(100vw - 32px), (max-width: 1499px) 52vw, 735px" />
        </div>
        <div className={styles.departmentCopy} aria-live="polite" aria-atomic="true">
          <h3 id="department-story">{selected.title}</h3>
          <ul>{selected.highlights.map(point => <li key={point}>{point}</li>)}</ul>
          {selected.example && (
            <a id={selected.example.anchor} className={styles.textAction} href={selected.example.href}>
              {selected.example.label} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </article>
    </section>
  );
}
