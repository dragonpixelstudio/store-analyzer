import StudioHeader from "@/app/components/StudioHeader";

import type { Metadata } from "next";
import WalletShop from "@/app/components/WalletShop";
import "../wallet.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Credits | Dragon Pixel Studio", description: "Create with prepaid credits. One credit per image or AI edit. Free exports and screenshot layouts." };
export default function PricingPage() {
  const checkoutOpen = process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" || process.env.DODO_LIVE_PAYMENTS_ENABLED === "true";
  return <main className="wallet-page"><StudioHeader /><WalletShop checkoutOpen={checkoutOpen} /></main>;
}
