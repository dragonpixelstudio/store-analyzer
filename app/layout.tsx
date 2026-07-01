import type { Metadata } from "next";
import { Inter, Orbitron, Sora } from "next/font/google";
import "./globals.css";

// Product UI: Sora for headings/buttons/nav, Inter for body copy.
const sora = Sora({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Scoped to the big score numbers only (className="font-score").
const orbitron = Orbitron({
  variable: "--font-score",
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dragon Pixel Store Analyzer",
  description:
    "Analyze your game icon and store screenshots for conversion before you spend on launch.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${inter.variable} ${orbitron.variable}`}>
        {children}
      </body>
    </html>
  );
}
