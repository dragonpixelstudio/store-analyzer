import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyze | Dragon Pixel Studio",
  description:
    "Score your game icon, Steam capsule, or store screenshots: small-size readability, shelf simulation, benchmarks, and ranked fixes.",
};

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
