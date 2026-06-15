import type { Metadata } from "next";
import { Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";

// Matches the marketing site: Orbitron (display) + Rajdhani (body).
const orbitron = Orbitron({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  display: "swap",
});

const rajdhani = Rajdhani({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      <body className={`${orbitron.variable} ${rajdhani.variable}`}>
        {children}
      </body>
    </html>
  );
}