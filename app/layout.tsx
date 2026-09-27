import type { Metadata } from "next";
import { localFixturesEnabled } from "@/lib/storageScope";
import localFont from "next/font/local";
import "./globals.css";
import "./canvas-studio.css";
import "./product-theme.css";
import "./results-polish.css";
import "./artwork-editor.css";
import { SiteFooter } from "@/app/components/SiteChrome";
import { Analytics } from "@vercel/analytics/next";

// Product UI: Sora for headings/buttons/nav, Inter for body copy.
const sora = localFont({
  src: "../node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2",
  variable: "--font-brand",
  weight: "100 800",
  display: "swap",
});

const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});

// Scoped to the big score numbers only (className="font-score").
const orbitron = localFont({
  src: "../node_modules/@fontsource-variable/orbitron/files/orbitron-latin-wght-normal.woff2",
  variable: "--font-score",
  weight: "400 900",
  display: "swap",
});

export const metadata: Metadata = {
  ...(process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? { robots: { index: false, follow: false } } : {}),
  title: "Dragon Pixel Store Studio - generate and score game store art",
  description:
    "Generate game icons and Steam capsules in one click, frame real gameplay into store screenshots, and score everything before you ship.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${inter.variable} ${orbitron.variable}`}>
        {localFixturesEnabled() && <aside style={{ background: "#332711", color: "#ffcf77", padding: "12px 24px", fontSize: 13, borderBottom: "1px solid #695025" }}><strong>LOCAL TEST MODE</strong> · Sample images & analysis · Test payments · No real charges.</aside>}
        {!localFixturesEnabled() && process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" && <aside style={{ background: "#332711", color: "#ffcf77", padding: "10px 24px", fontSize: 13 }}><strong>TEST SITE</strong> · Test payments only · No real charges.</aside>}
        <div className="flex-1">{children}</div>
        <SiteFooter />
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
