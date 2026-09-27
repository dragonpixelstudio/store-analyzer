import Link from "next/link";
import type { ReactNode } from "react";
import StudioHeader from "./StudioHeader";
export const CONTACT_EMAIL = "contact@dragonpixelstudio.com";
export function SiteNav() { return <nav className="support-inline-nav" aria-label="Product navigation"><Link href="/">Studio</Link><Link href="/analyze">Analyze</Link><Link href="/pricing">Credits</Link></nav>; }
export function SiteFooter({ className = "" }: { className?: string }) {
  return <footer className={`product-footer ${className}`}><div className="footer-grid">
    <nav aria-label="Product links"><h2>Product</h2><Link href="/">Studio</Link><Link href="/analyze">Analyze artwork</Link><Link href="/pricing">Credits & pricing</Link><Link href="/contact">Contact & support</Link></nav>
    <nav aria-label="Policy links"><h2>Legal</h2><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms of service</Link><Link href="/refund-policy">Refund policy</Link></nav>
    <nav aria-label="Social links"><h2>Social</h2><a href="https://www.youtube.com/@dragonpixelstudio" target="_blank" rel="noopener noreferrer">YouTube ↗</a><a href="https://www.instagram.com/dragonpixelstudio" target="_blank" rel="noopener noreferrer">Instagram ↗</a><a href="https://www.linkedin.com/company/dragonpixelstudio" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></nav>
  </div><div className="footer-bottom"><span>© 2026 Dragon Pixel Studio. All rights reserved.</span></div></footer>;
}
export function PageShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <><StudioHeader /><main className="support-page"><header className="support-heading"><p className="product-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{intro}</p></header><div className="support-layout"><aside className="support-rail"><span>DRAGON PIXEL STUDIO</span><nav aria-label="Help and policies"><Link href="/pricing">Credits & pricing</Link><Link href="/contact">Contact & support</Link><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms of service</Link><Link href="/refund-policy">Refund policy</Link></nav><p>Need support?</p><a href={`mailto:${CONTACT_EMAIL}`}>Contact support ↗</a></aside><article className="support-document">{children}</article></div></main></>;
}
export function PolicySection({ title, children }: { title: string; children: ReactNode }) { return <section className="policy-section"><h2>{title}</h2><div>{children}</div></section>; }
