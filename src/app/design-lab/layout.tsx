import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans, Manrope, Plus_Jakarta_Sans } from "next/font/google";

import "@/components/design-lab/design-lab.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-dl-jakarta",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dl-dm",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dl-plex",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-dl-manrope",
});

export const metadata: Metadata = {
  title: "Design lab · LTC Manager",
  description: "Isolated redesign previews for review — production UI unchanged.",
  robots: { index: false, follow: false },
};

export default function DesignLabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${jakarta.variable} ${dmSans.variable} ${plex.variable} ${manrope.variable}`}
    >
      {children}
    </div>
  );
}
