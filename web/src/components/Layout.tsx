import type { ComponentChildren } from 'preact';
import { Link } from 'wouter';
import { GITHUB_URL } from '../lib/site';
import { useCreateRoom } from '../lib/useCreateRoom';
import { GitHubIcon, LogoMark, Navbar } from './Brand';

const FOOTER_LINKS = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'HTTP and MCP', href: '/#agents' },
      { label: 'Safety', href: '/#safety' },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About us', href: '/about' },
      { label: 'Contact us', href: '/contact' },
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms and conditions', href: '/terms' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'Source code', href: GITHUB_URL },
      { label: 'Agent quickstart', href: `${GITHUB_URL}#readme` },
      { label: 'Report an issue', href: `${GITHUB_URL}/issues` },
    ],
  },
];

function FooterLink({ href, children }: { href: string; children: ComponentChildren }) {
  const className = 'text-paper/70 hover:text-paper transition-colors';
  if (href.startsWith('http')) {
    return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  }
  // Hash links are plain anchors so the browser scrolls to the section.
  if (href.includes('#')) return <a href={href} className={className}>{children}</a>;
  return <Link href={href} className={className}>{children}</Link>;
}

export function Footer() {
  const { create, creating, error } = useCreateRoom();
  return (
    <footer className="ruled-dark relative overflow-hidden bg-ink text-paper">
      <div aria-hidden="true" className="wordmark-faint hidden md:block absolute right-8 -bottom-[0.2em] font-display font-semibold tracking-tight leading-none text-[11rem] select-none whitespace-nowrap">
        notemem
      </div>
      <div className="relative px-4 sm:px-8 pt-10 pb-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2 text-paper" aria-label="Notemem home">
              <LogoMark className="w-5 h-5" inverted />
              <span className="font-display text-lg font-semibold tracking-tight">notemem</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-paper/60">
              A shared notebook for people and AI agents. Open a room, hand over the URL, and read the same pads from anywhere.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button onClick={() => void create()} disabled={creating} className="btn-primary h-9 px-4 text-xs">
                {creating ? 'Creating…' : 'Create a room'} {!creating && <span aria-hidden="true">→</span>}
              </button>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn h-9 px-4 text-xs border-paper/25 text-paper hover:bg-paper/10">
                <GitHubIcon className="w-3.5 h-3.5" /> Star on GitHub
              </a>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {FOOTER_LINKS.map(col => (
              <div key={col.heading}>
                <div className="label text-[11px] text-brand">{col.heading}</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {col.links.map(link => (
                    <li key={link.label}><FooterLink href={link.href}>{link.label}</FooterLink></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-paper/15 flex flex-col sm:flex-row gap-2 sm:items-center justify-between label text-[10px] text-paper/50">
          <span>© {new Date().getFullYear()} Notemem</span>
          <span>Idle rooms are deleted after 30 days</span>
        </div>
      </div>
    </footer>
  );
}

/** The paper page with the navbar and footer, shared by the home page and the info pages. */
export function PageLayout({ children }: { children: ComponentChildren }) {
  return (
    <div className="min-h-screen ruled">
      <div className="max-w-[1080px] mx-auto border-x border-line min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

/** A text page (about, legal, contact): eyebrow, headline, then prose. */
export function DocPage({ eyebrow, title, intro, updated, children }: {
  eyebrow: string;
  title: string;
  intro?: string;
  updated?: string;
  children: ComponentChildren;
}) {
  return (
    <PageLayout>
      <article className="px-4 sm:px-8 pt-12 sm:pt-16 pb-16 sm:pb-20">
        <header className="max-w-2xl">
          <div className="label text-[11px] text-ink-soft mb-3 flex items-center gap-3"><span className="w-1.5 h-1.5 bg-brand" />{eyebrow}</div>
          <h1 className="font-display text-[2rem] sm:text-[2.6rem] leading-[1.1] font-semibold tracking-tight text-ink">{title}</h1>
          {intro && <p className="mt-4 text-base sm:text-lg leading-relaxed text-ink-soft">{intro}</p>}
          {updated && <p className="mt-4 label text-[11px] text-ink-faint">Last updated {updated}</p>}
        </header>
        <div className="doc-prose mt-10 max-w-2xl">{children}</div>
      </article>
    </PageLayout>
  );
}
