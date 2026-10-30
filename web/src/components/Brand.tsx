import { Link } from 'wouter';

export const GITHUB_URL = 'https://github.com/Mshahnawaz1/Notemem';

/** A note with a folded corner; the two lines stand for the human and the agent writing to it. */
export function LogoMark({ className = 'w-6 h-6', inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M5 3h15l7 7v19H5z" fill={inverted ? '#F8F6F1' : '#0F2A23'} />
      <path d="M20 3v7h7z" fill="#C1E05A" />
      <rect x="9" y="15" width="12" height="2.5" fill={inverted ? '#0F2A23' : '#F8F6F1'} />
      <rect x="9" y="21" width="8" height="2.5" fill="#C1E05A" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label="Notemem home">
      <LogoMark className="w-5 h-5" />
      <span className="font-display text-lg font-semibold tracking-tight">notemem</span>
    </Link>
  );
}

export function GitHubIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function Navbar() {
  return (
    <header className="px-4 pt-4">
      <nav className="mx-auto flex items-stretch justify-between bg-white border border-line h-[3.25rem]">
        <div className="flex items-center px-4 sm:px-6">
          <Logo />
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-4 sm:px-6 bg-mist hover:bg-[#cfe3e1] text-ink label text-[11px] transition-colors"
        >
          <GitHubIcon className="w-4 h-4" />
          <span>GitHub</span>
        </a>
      </nav>
    </header>
  );
}
