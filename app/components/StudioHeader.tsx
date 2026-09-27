"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Question } from "@phosphor-icons/react";

export default function StudioHeader({ creditLabel = "Credits" }: { creditLabel?: string }) {
  const pathname = usePathname();
  return <header className="studio-topbar">
    <Link href="/" aria-label="Dragon Pixel Studio home" className="studio-brand"><Image src="/logo-pixel-studio.png" alt="Dragon Pixel Studio" width={640} height={260} unoptimized priority /></Link>
    <nav aria-label="Main navigation"><Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Studio</Link><Link href="/analyze" aria-current={pathname === "/analyze" || pathname.startsWith("/report/") ? "page" : undefined}>Analyze</Link><Link href="/jobs" aria-current={pathname.startsWith("/jobs") ? "page" : undefined}>Recent jobs</Link></nav>
    <div className="studio-top-actions"><Link href="/pricing" className="studio-credits" aria-current={pathname === "/pricing" ? "page" : undefined}><Coins size={23} weight="fill" /><span>{creditLabel}</span></Link><Link href="/contact" className="studio-help" aria-label="Help and contact"><Question size={25} /></Link></div>
  </header>;
}
