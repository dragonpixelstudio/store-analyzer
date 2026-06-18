import type { Metadata } from "next";
import { Exo_2, Inter } from "next/font/google";
import "./globals.css";

// Matches the marketing site (dragonpixelstudio.com): Exo 2 (display) + Inter (body).
const exo2 = Exo_2({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      <body className={`${exo2.variable} ${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}