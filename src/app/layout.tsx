import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vssyl",
  description: "Vssyl — Business Operations Platform. Your operations. All together.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Vssyl",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full bg-[var(--background)] font-sans text-[var(--foreground)]"
      >
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
