import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const CONTACT_EMAIL = "contact@dragonpixelstudio.com";

// Pricing is intentionally out of the primary nav: leading with a price cools
// a visitor before the tool has proven its value. The /pricing page still
// exists (payment-provider verification, checkout, footer link) - it's just
// not the second thing a first-time visitor is shown.
const navLinks = [
  { href: "/", label: "Analyzer" },
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
    <footer
      className={`relative z-[1] mt-16 w-full border-t border-white/[0.08] ${className}`}
      style={{ background: "linear-gradient(180deg, rgba(8,10,18,.78), rgba(4,5,10,.94))" }}
    >
      <div className="mx-auto w-[min(1060px,calc(100%-44px))]">
        <div className="flex justify-center gap-[clamp(48px,9vw,110px)] pt-10 pb-8 text-left max-[640px]:flex-col max-[640px]:items-center max-[640px]:gap-8 max-[640px]:text-center">
          <div>
            <h4 className="font-brand text-[13px] font-bold uppercase tracking-[.14em] text-[var(--foreground)]">
              Product
            </h4>
            <nav className="mt-3.5 flex flex-col gap-2.5 text-[14.5px] text-[var(--text-3)]">
              <Link href="/" className="transition hover:text-[var(--cyan)]">
                Analyzer
              </Link>
              <Link href="/contact" className="transition hover:text-[var(--cyan)]">
                Contact
              </Link>
            </nav>
          </div>

          <div>
            <h4 className="font-brand text-[13px] font-bold uppercase tracking-[.14em] text-[var(--foreground)]">
              Legal
            </h4>
            <nav className="mt-3.5 flex flex-col gap-2.5 text-[14.5px] text-[var(--text-3)]">
              <Link href="/terms" className="transition hover:text-[var(--cyan)]">
                Terms
              </Link>
              <Link href="/privacy" className="transition hover:text-[var(--cyan)]">
                Privacy Policy
              </Link>
            </nav>
          </div>

          <div>
            <h4 className="font-brand text-[13px] font-bold uppercase tracking-[.14em] text-[var(--foreground)]">
              Follow
            </h4>
            <nav className="mt-3.5 flex flex-col gap-2.5 text-[14.5px] text-[var(--text-3)]">
              <a
                href="https://www.youtube.com/@dragonpixelstudio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-[var(--cyan)] max-[640px]:justify-center"
              >
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] flex-none" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="#ff4d4d"/><path fill="#ffffff" d="M10 9v6l5.2-3z"/></svg>
                <span>YouTube</span>
              </a>
              <a
                href="https://www.instagram.com/dragonpixelstudio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-[var(--cyan)] max-[640px]:justify-center"
              >
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] flex-none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="#ff3db4" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#ff3db4" strokeWidth="2"/><circle cx="17.4" cy="6.6" r="1.3" fill="#ff3db4"/></svg>
                <span>Instagram</span>
              </a>
              <a
                href="https://www.linkedin.com/company/dragonpixelstudio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-[var(--cyan)] max-[640px]:justify-center"
              >
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] flex-none" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="4" fill="#0a66c2"/><path fill="#ffffff" d="M7.9 9.4H5.6v8h2.3zM6.75 5.7a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7zM13 9.2c-1.1 0-1.9.5-2.3 1.2v-1H8.5v8h2.3v-4.2c0-1.1.5-1.9 1.6-1.9s1.4.9 1.4 2v4.1h2.3v-4.6c0-2.4-1.2-3.6-3.1-3.6z"/></svg>
                <span>LinkedIn</span>
              </a>
            </nav>
          </div>
        </div>

        <div className="border-t border-white/[0.065] pt-4.5 pb-6 text-center text-[13.5px] text-[var(--text-4)]">
          <span>&copy; 2026 Dragon Pixel Studio. All rights reserved.</span>
        </div>
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
        className="mt-10 rounded-2xl border border-[var(--edge)] p-6 md:p-8"
        style={{ background: "linear-gradient(160deg,rgba(18,18,34,.96),rgba(7,8,18,.96))" }}
      >
        {children}
      </section>
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
