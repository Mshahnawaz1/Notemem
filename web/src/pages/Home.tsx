import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation } from 'wouter';
import { createRoom } from '../lib/api';
import { GITHUB_URL, GitHubIcon, LogoMark, Navbar } from '../components/Brand';

const STEPS = [
  {
    n: '01',
    title: 'Create a room',
    body: 'One click gives you a private room with two URLs: one that can write and one that can only read. Nothing to sign up for.',
  },
  {
    n: '02',
    title: 'Hand the URL to your agent',
    body: 'Paste it into a prompt or add it as an MCP server. A GET on the URL returns a plain page that explains the API to the agent.',
  },
  {
    n: '03',
    title: 'Work from the same pads',
    body: 'You and the agent read and write the same markdown pads. Changes show up here live, with every revision kept.',
  },
];

const FACTS = [
  { title: 'Separate read and write keys', body: 'Share the read URL for review. Writes with it are refused.' },
  { title: 'Only hashes are stored', body: 'Keys never reach logs, error messages or query strings.' },
  { title: 'Versioned writes', body: 'Replacing a pad needs the version you read, so a stale write fails instead of overwriting someone else.' },
  { title: 'Rooms expire', body: 'A room is deleted after 30 days without a change. Any write resets the clock.' },
  { title: 'Not indexed', body: 'Every page is served with noindex and no referrer.' },
  { title: 'Content is data', body: 'Agents are told up front that pad contents are untrusted user data, not instructions.' },
];

const LIMITS = [
  { value: '20', unit: 'pads per room' },
  { value: '256 KB', unit: 'per pad' },
  { value: '50', unit: 'revisions per pad' },
  { value: '30 days', unit: 'until an idle room expires' },
];

type Door = 'http' | 'mcp';

function SectionHeading({ eyebrow, title, stacked, children }: { eyebrow: string; title: string; stacked?: boolean; children?: ComponentChildren }) {
  return (
    <div className={`grid gap-4 ${stacked ? '' : 'lg:grid-cols-2 lg:gap-12 lg:items-end'}`}>
      <div>
        <div className="label text-[11px] text-ink-soft mb-3 flex items-center gap-3"><span className="w-1.5 h-1.5 bg-brand" />{eyebrow}</div>
        <h2 className="font-display text-[1.6rem] sm:text-[2.1rem] leading-[1.12] font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      {children && <p className="text-base text-ink-soft leading-relaxed max-w-lg">{children}</p>}
    </div>
  );
}

function CodeBlock({ door, origin }: { door: Door; origin: string }) {
  const room = `${origin}/r/{room}/{key}`;
  const lines = door === 'http'
    ? [
        ['#', 'Leave a plan for the next agent'],
        ['$', `curl -X POST "${room}/pads/plan/append" \\`],
        [' ', "  --data-binary '- [ ] migrate the schema'"],
        ['', ''],
        ['#', 'Read it back; the version is in the ETag'],
        ['$', `curl -i "${room}/pads/plan"`],
      ]
    : [
        ['#', 'Claude Code'],
        ['$', `claude mcp add --transport http notemem \\`],
        [' ', `  ${origin}/mcp/{room}/{key}`],
        ['', ''],
        ['#', 'Tools: list_pads, read_pad, get_history,'],
        ['#', '       write_pad, append_pad, delete_pad'],
      ];
  return (
    <pre className="font-mono text-xs leading-5 overflow-x-auto p-4 sm:p-5 text-ink">
      {lines.map(([mark, text], i) => (
        <div key={i} className="whitespace-pre min-h-5">
          <span className={mark === '#' ? 'text-ink-faint' : 'text-ink-soft'}>{mark === ' ' ? '  ' : mark ? `${mark} ` : ''}</span>
          <span className={mark === '#' ? 'text-ink-faint' : ''}>{text}</span>
        </div>
      ))}
    </pre>
  );
}

const FOOTER_LINKS = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'HTTP and MCP', href: '#agents' },
      { label: 'Safety', href: '#safety' },
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

function Footer({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <footer className="ruled-dark relative overflow-hidden bg-ink text-paper">
      <div aria-hidden="true" className="wordmark-faint hidden md:block absolute right-8 -bottom-[0.2em] font-display font-semibold tracking-tight leading-none text-[11rem] select-none whitespace-nowrap">
        notemem
      </div>
      <div className="relative px-4 sm:px-8 pt-10 pb-6">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="max-w-sm">
            <a href="/" className="flex items-center gap-2 text-paper" aria-label="Notemem home">
              <LogoMark className="w-5 h-5" inverted />
              <span className="font-display text-lg font-semibold tracking-tight">notemem</span>
            </a>
            <p className="mt-3 text-sm leading-relaxed text-paper/60">
              A shared notebook for people and AI agents. Open a room, hand over the URL, and read the same pads from anywhere.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button onClick={onCreate} disabled={creating} className="btn-primary h-9 px-4 text-xs">
                {creating ? 'Creating…' : 'Create a room'} {!creating && <span aria-hidden="true">→</span>}
              </button>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn h-9 px-4 text-xs border-paper/25 text-paper hover:bg-paper/10">
                <GitHubIcon className="w-3.5 h-3.5" /> Star on GitHub
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8">
            {FOOTER_LINKS.map(col => (
              <div key={col.heading}>
                <div className="label text-[11px] text-brand">{col.heading}</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {col.links.map(link => {
                    const external = link.href.startsWith('http');
                    return (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                          className="text-paper/70 hover:text-paper transition-colors"
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  })}
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

export default function Home() {
  const [, setLocation] = useLocation();
  const [joinUrl, setJoinUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [door, setDoor] = useState<Door>('http');
  const origin = window.location.origin;

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { writeUrl } = await createRoom();
      setLocation(new URL(writeUrl).pathname);
    } catch {
      setError('Could not create a room. Please try again.');
      setLoading(false);
    }
  };

  const handleJoin = (e: Event) => {
    e.preventDefault();
    setError(null);
    let path = joinUrl.trim();
    try {
      path = new URL(path).pathname;
    } catch {
      // Not a full URL; it may be just the path.
    }
    if (path.startsWith('/r/')) {
      setLocation(path);
    } else {
      setError('That doesn\'t look like a room URL. It should contain /r/{room}/{key}.');
    }
  };

  return (
    <div className="min-h-screen ruled">
      <div className="max-w-[1080px] mx-auto border-x border-line min-h-screen flex flex-col">
        <Navbar />

        <main className="flex-1">
          {/* Hero */}
          <section className="px-4 pt-14 sm:pt-20 pb-16 text-center">
            <div className="inline-flex items-center gap-3 border border-dashed border-line-strong bg-paper/80 p-1 pr-3 text-[13px] text-ink-soft">
              <span className="label bg-white border border-line px-1.5 py-0.5 text-ink text-[10px]">Free</span>
              <span>No accounts. No SDK.<span className="hidden sm:inline"> The URL is the key.</span></span>
            </div>

            <h1 className="mt-8 font-display font-semibold tracking-tight leading-[1.04] text-[2.1rem] sm:text-5xl lg:text-[3.8rem] text-ink">
              Shared notes for you
              <br />
              <span className="text-ink-soft">and your AI agents.</span>
            </h1>
            <p className="mt-5 max-w-xl mx-auto text-base sm:text-lg leading-relaxed text-ink-soft">
              A cloud agent leaves a plan, a local coding agent picks it up, and you check progress from your phone. Everyone reads and writes the same pads over plain HTTP or MCP.
            </p>

            <div className="mt-9 max-w-md mx-auto flex flex-col gap-2.5">
              <button onClick={() => void handleCreate()} disabled={loading} className="btn-primary h-11 w-full">
                {loading ? 'Creating room…' : 'Create a room'}
                {!loading && <span aria-hidden="true">→</span>}
              </button>
              <form onSubmit={handleJoin} className="flex">
                <input
                  type="text"
                  placeholder="Paste a room URL to join"
                  aria-label="Room URL"
                  value={joinUrl}
                  onInput={(e) => setJoinUrl(e.currentTarget.value)}
                  className="field flex-1 min-w-0 h-11 px-3.5 font-mono text-[13px] border-r-0"
                />
                <button type="submit" className="btn-secondary h-11 px-5 sm:px-6">Join</button>
              </form>
              {error && (
                <div role="alert" className="text-left bg-red-50 border border-red-200 text-red-900 text-sm px-4 py-3">
                  {error}
                </div>
              )}
            </div>
          </section>

          {/* How it works */}
          <section id="how-it-works" className="scroll-mt-4 border-t border-line px-4 sm:px-8 py-14 sm:py-[4.5rem]">
            <SectionHeading eyebrow="How it works" title="Three steps, no setup.">
              Rooms are disposable workspaces. Make one for a task, share it with whatever needs it, and let it expire when you're done.
            </SectionHeading>
            <div className="ticks mt-10 grid md:grid-cols-3 border border-line bg-white">
              {STEPS.map((step, i) => (
                <div key={step.n} className={`p-6 ${i > 0 ? 'border-t md:border-t-0 md:border-l border-line' : ''}`}>
                  <div className="font-mono text-xs text-ink-faint">{step.n} <span className="text-line-strong">/ 03</span></div>
                  <h3 className="mt-5 font-display text-[17px] font-semibold text-ink">{step.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* HTTP and MCP */}
          <section id="agents" className="scroll-mt-4 border-t border-line px-4 sm:px-8 py-14 sm:py-[4.5rem] grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 items-start">
            <SectionHeading stacked eyebrow="For agents" title="Plain HTTP or MCP. Same room.">
              Any agent that can make a request can use a room. Agents with MCP support get six tools instead. Both talk to the same pads, so you can mix them freely.
            </SectionHeading>
            <div className="ticks border border-line bg-white min-w-0">
              <div className="flex border-b border-line" role="tablist">
                {(['http', 'mcp'] as const).map(d => (
                  <button
                    key={d}
                    role="tab"
                    aria-selected={door === d}
                    onClick={() => setDoor(d)}
                    className={`label text-[11px] px-4 py-2.5 border-r border-line transition-colors ${door === d ? 'bg-mist text-ink' : 'text-ink-soft hover:text-ink'}`}
                  >
                    {d === 'http' ? 'HTTP' : 'MCP'}
                  </button>
                ))}
              </div>
              <CodeBlock door={door} origin={origin} />
            </div>
          </section>

          {/* Safety */}
          <section id="safety" className="scroll-mt-4 border-t border-line px-4 sm:px-8 py-14 sm:py-[4.5rem]">
            <SectionHeading eyebrow="Safe by default" title="Private by URL, careful by design.">
              There are no accounts to lose, so the keys and the limits do the work.
            </SectionHeading>
            <dl className="ticks mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line">
              {FACTS.map(fact => (
                <div key={fact.title} className="bg-paper p-6">
                  <dt className="font-display text-base font-semibold text-ink">{fact.title}</dt>
                  <dd className="mt-1.5 text-sm text-ink-soft leading-relaxed">{fact.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Limits */}
          <section className="border-t border-line">
            <dl className="grid grid-cols-2 lg:grid-cols-4">
              {LIMITS.map((limit, i) => (
                <div key={limit.unit} className={`px-5 sm:px-8 py-8 border-line ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
                  <dt className="font-display text-2xl sm:text-[1.8rem] font-semibold tracking-tight text-ink">{limit.value}</dt>
                  <dd className="mt-1.5 label text-[11px] text-ink-soft">{limit.unit}</dd>
                </div>
              ))}
            </dl>
          </section>
        </main>

        <Footer onCreate={() => void handleCreate()} creating={loading} />
      </div>
    </div>
  );
}
