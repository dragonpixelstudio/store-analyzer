import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const CONTACT_EMAIL = "contact@dragonpixelstudio.com";

const navLinks = [
  { href: "/", label: "Analyzer" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function SiteNav() {
  return (
    <nav className="mx-auto mt-5 flex max-w-[760px] flex-wrap items-center justify-center gap-2">
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="font-brand rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-[13px] font-semibold text-[var(--text-3)] transition hover:-translate-y-0.5 hover:border-[var(--cyan)] hover:text-[var(--foreground)]"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`mt-24 border-t border-white/[0.08] pt-10 pb-6 ${className}`}>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_.8fr_.8fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Dragon Pixel Studio"
              width={280}
              height={64}
              className="h-14 w-auto brightness-125 contrast-125"
            />
          </Link>
          <p className="mt-2 max-w-md text-[14px] leading-6 text-[var(--text-2)]">
            1068 Beijing West Road, Jing&apos;an, Shanghai. China.
          </p>
        </div>

        <div>
          <h4 className="font-brand text-[13px] font-semibold text-[var(--foreground)]">
            Product
          </h4>
          <nav className="mt-3 flex flex-col gap-2 text-[14px] text-[var(--text-3)]">
            <Link href="/" className="transition hover:text-[var(--cyan)]">
              Analyzer
            </Link>
            <Link href="/pricing" className="transition hover:text-[var(--cyan)]">
              Pricing
            </Link>
            <Link href="/contact" className="transition hover:text-[var(--cyan)]">
              Contact
            </Link>
          </nav>
        </div>

        <div>
          <h4 className="font-brand text-[13px] font-semibold text-[var(--foreground)]">
            Legal
          </h4>
          <nav className="mt-3 flex flex-col gap-2 text-[14px] text-[var(--text-3)]">
            <Link href="/terms" className="transition hover:text-[var(--cyan)]">
              Terms
            </Link>
            <Link href="/privacy" className="transition hover:text-[var(--cyan)]">
              Privacy Policy
            </Link>
            <Link href="/refund-policy" className="transition hover:text-[var(--cyan)]">
              Refund Policy
            </Link>
          </nav>
        </div>
      </div>

      <div className="mt-8 border-t border-white/[0.08] pt-5 text-center text-[13px] text-[var(--text-4)]">
        <span>&copy; 2026 Dragon Pixel Studio. All rights reserved.</span>
      </div>
    </footer>
  );
}

export function PageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="relative z-[1] mx-auto w-[min(1060px,calc(100%-44px))] pb-16">
      <header className="pt-8 pb-1 text-center">
        <Link href="/" className="mb-6 inline-flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Dragon Pixel Studio"
            width={300}
            height={64}
            className="h-12 w-auto opacity-95 md:h-14"
          />
        </Link>
        <SiteNav />
        <div className="dpx-kicker mt-10 justify-center" data-tone="gold">
          {eyebrow}
        </div>
        <h1
          className="font-brand mx-auto mt-4 max-w-[820px] text-[clamp(38px,6vw,66px)] font-bold leading-[.98] text-transparent bg-clip-text"
          style={{ backgroundImage: "linear-gradient(180deg,#fff,#cfe9ff 70%,#9fd2ff)" }}
        >
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-[680px] text-[clamp(16px,2vw,19px)] font-medium leading-8 text-[var(--text-2)]">
          {intro}
        </p>
      </header>

      <section
        className="mt-10 rounded-2xl border border-[var(--edge)] p-6 shadow-[0_8px_24px_rgba(0,0,0,.18)] md:p-8"
        style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}
      >
        {children}
      </section>

      <SiteFooter />
    </main>
  );
}

export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-white/10 py-7 first:border-t-0 first:pt-0 last:pb-0">
      <h2 className="font-brand text-[20px] font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="mt-3 space-y-3 text-[14.5px] font-normal leading-7 text-[var(--text-2)]">
        {children}
      </div>
    </section>
  );
}
