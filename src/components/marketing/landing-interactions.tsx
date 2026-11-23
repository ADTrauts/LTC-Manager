"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";

import styles from "./landing-page.module.css";

export function MobileMenu({ children }: { children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    function dismiss(event: Event) {
      if (!menu.current?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        menu.current.open = false;
        trigger.current?.focus();
      } else if (event.target instanceof Node && !menu.current.contains(event.target)) {
        menu.current.open = false;
      }
    }

    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, []);

  return (
    <details className={styles.mobileMenu} ref={menu}>
      <summary ref={trigger}>Menu <span className={styles.menuIcon} aria-hidden="true" /></summary>
      <nav
        aria-label="Page sections"
        className={styles.mobileLinks}
        onClick={(event) => {
          if (menu.current && event.target instanceof Element && event.target.closest("a")) {
            menu.current.open = false;
          }
        }}
      >
        {children}
      </nav>
    </details>
  );
}

function pauseOtherMedia(video: HTMLVideoElement) {
  video.closest("main")?.querySelectorAll("video").forEach((other) => {
    if (other !== video) other.pause();
  });
}

type FilmPlayerProps = {
  film: "day" | "plan";
  title: string;
  duration: string;
  sizes: string;
};

export function FilmPlayer({ film, title, duration, sizes }: FilmPlayerProps) {
  const [opened, setOpened] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const base = "/marketing/films/" + film;

  useEffect(() => {
    if (opened) video.current?.focus({ preventScroll: true });
  }, [opened]);

  return (
    <div className={styles.player}>
      <div className={styles.playerFrame}>
        {opened ? (
          <video
            ref={video}
            tabIndex={0}
            aria-label={title}
            controls
            autoPlay
            playsInline
            poster={base + "-poster.webp"}
            onPlay={(event) => pauseOtherMedia(event.currentTarget)}
          >
            <source src={base + ".mp4"} type="video/mp4" />
            <track kind="captions" src={base + ".en.vtt"} srcLang="en" label="English" default />
          </video>
        ) : (
          <a
            className={styles.poster}
            href={base + ".mp4"}
            role="button"
            aria-label={"Play " + title + ", " + duration}
            onKeyDown={(event) => {
              if (event.key !== " ") return;
              event.preventDefault();
              setOpened(true);
            }}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setOpened(true);
            }}
          >
            <Image src={base + "-poster.webp"} alt="" fill sizes={sizes} />
            <span className={styles.playPill}>
              <span className={styles.playIcon} aria-hidden="true" />
              Play film <span className={styles.duration}>{duration}</span>
            </span>
          </a>
        )}
      </div>
      <a href={base + "-transcript.txt"} className={styles.transcript} aria-label={"Read the transcript for " + title}>
        Read transcript <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

export function FacilityArtwork() {
  const [moving, setMoving] = useState(false);
  const figure = useRef<HTMLFigureElement>(null);

  useEffect(() => {
    if (!moving || !figure.current) return;
    const preferences = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => setMoving(false);
    const visibility = () => { if (document.hidden) stop(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) stop();
    });
    observer.observe(figure.current);
    preferences.addEventListener("change", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      preferences.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [moving]);

  return (
    <figure className={styles.facility} ref={figure}>
      <picture>
        <source media="(max-width: 480px)" srcSet="/marketing/films/facility-small.webp" />
        <Image
          src="/marketing/films/facility.webp"
          alt="Isometric cutaway of a care facility at sunrise, with a kitchen, dining room and plant room."
          fill
          sizes="(max-width: 799px) calc(100vw - 32px), (max-width: 1399px) 55vw, 752px"
          loading="eager"
          fetchPriority="high"
        />
      </picture>
      {moving ? (
        <video
          src="/marketing/films/facility-loop.mp4"
          muted autoPlay playsInline loop
          aria-hidden="true"
          onPlay={(event) => pauseOtherMedia(event.currentTarget)}
          onPause={() => setMoving(false)}
          onError={() => setMoving(false)}
        />
      ) : null}
      <button
        className={styles.motionButton}
        type="button"
        aria-label={moving ? "Pause facility animation" : "Play silent facility animation"}
        onClick={() => setMoving((active) => !active)}
      >
        <span className={moving ? styles.pauseIcon : styles.playIcon} aria-hidden="true" />
        {moving ? "Pause motion" : "Play motion"}
      </button>
    </figure>
  );
}
