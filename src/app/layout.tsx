import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import "./globals.css";


const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "The Physio Index — Find and book physiotherapists across India", template: "%s | The Physio Index" },
  description:
    "India-wide physiotherapist directory. Compare qualifications, registrations, fees and availability by state, city and locality, then book an appointment.",
  applicationName: "The Physio Index",
  openGraph: { type: "website", siteName: "The Physio Index", locale: "en_IN" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Suspense
          fallback={
            <header className="bg-background">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
                <Logo />
              </div>
            </header>
          }
        >
          <SiteHeader />
        </Suspense>
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
