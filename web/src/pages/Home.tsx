import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation } from 'wouter';
import { PageLayout } from '../components/Layout';
import { FAQ } from '../lib/faq';
import { SITE_URL } from '../lib/site';
import { useCreateRoom } from '../lib/useCreateRoom';

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
  { title: 'Rooms are not indexed', body: 'Room pages and API responses are served with noindex and no referrer.' },
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

const ABOUT = [
  {
    title: 'Why agents need a shared place to write',
    body: 'AI coding agents are good at long tasks, but their memory ends with the session. When a cloud agent finishes a research step and a local coding agent has to continue, or when you want to check progress from your phone, there is usually no common place to put the work. Copying text between chat windows loses context, and a file on one machine is invisible to an agent running somewhere else. Notemem gives every participant the same notes through a URL, so a plan written by one agent can be picked up by another, reviewed by a person and updated again, wherever each of them runs.',
  },
  {
    title: 'Works with any agent: plain HTTP or MCP',
    body: 'Any agent that can make a web request can use a room. A GET request on the room URL returns a short markdown page that explains the API, so you can paste the URL into a prompt with one sentence of instruction and the agent works out the rest. Pads are read as plain text, appended with a POST and replaced with a PUT. Agents with Model Context Protocol support, such as Claude Code, Cursor, Codex and other MCP clients, can add the room as a remote MCP server and get six tools for listing, reading, writing, appending, deleting and viewing history. Chat assistants that can only fetch pages can still read a room.',
  },
  {
    title: 'Safe concurrent edits',
    body: 'When several agents write to the same notes, the usual failure is a silent overwrite: one agent saves an old copy over another agent\'s work. Notemem prevents it with versioned writes. Replacing a pad requires the version number you last read, sent as an If-Match header or an MCP argument, and a stale write is rejected with a clear message telling the agent to re-read and try again. Appending never conflicts, which makes it the right choice for logs and checklists. Every revision is kept in the pad\'s history, up to 50 per pad, so earlier text can be restored.',
  },
  {
    title: 'Private by URL, with read-only sharing',
    body: 'Each room has two keys: a write URL for you and your trusted agents, and a read-only URL you can share for review. Only hashes of the keys are stored, keys never appear in logs, and room pages are served with noindex and no referrer, so they stay out of search engines and analytics. Agents are told up front that pad contents are user data, not instructions, which helps against prompt injection through shared notes. Rooms are temporary by design: a room is deleted after 30 days without a change, and any write resets the clock.',
  },
];

function AboutTool() {
  return (
    <section id="about-notemem" className="scroll-mt-4 border-t border-line px-4 sm:px-8 py-14 sm:py-[4.5rem]">
      <SectionHeading eyebrow="About the tool" title="A shared notebook for humans and AI agents.">
        Notemem is a free shared workspace where you and any AI agent read and write the same notes. You open a room with one click, and its private URL is all anyone needs: no accounts, no API keys to register and no SDK to install. A room holds up to 20 markdown pads, such as a plan, a task list, a decision log or a handoff note, and every change is versioned.
      </SectionHeading>
      <div className="ticks mt-10 grid md:grid-cols-2 gap-px bg-line border border-line">
        {ABOUT.map(item => (
          <div key={item.title} className="bg-white p-6 sm:p-7">
            <h3 className="font-display text-[17px] font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-2 lg:gap-12">
        <h3 className="font-display text-[17px] font-semibold text-ink">What people use it for</h3>
        <p className="text-sm sm:text-base text-ink-soft leading-relaxed">
          Common uses include handing a plan from a planning agent to a coding agent, keeping a task list that several agents tick off, collecting research notes from a cloud agent to read on your phone, leaving instructions for an agent that runs on a schedule, and giving a reviewer read-only access to an agent's progress log. The web view updates live, so you can watch an agent work and step in by editing the same pad. Notemem is open source and free: create a room, hand the URL to your agent, and work from the same page.
        </p>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-4 border-t border-line px-4 sm:px-8 py-14 sm:py-[4.5rem] grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 items-start">
      <SectionHeading stacked eyebrow="FAQ" title="Questions, answered.">
        Can't find what you need? Open an issue on GitHub or see the contact page.
      </SectionHeading>
      <div className="ticks border border-line bg-white divide-y divide-line">
        {FAQ.map(item => (
          <details key={item.q} className="faq group">
            <summary className="flex items-start justify-between gap-4 cursor-pointer list-none px-5 py-4 font-display text-[15px] sm:text-base font-semibold text-ink hover:bg-paper">
              <span>{item.q}</span>
              <span aria-hidden="true" className="font-mono text-ink-faint group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="px-5 pb-5 -mt-1 text-sm text-ink-soft leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [joinUrl, setJoinUrl] = useState('');
  const { create: handleCreate, creating: loading, error, setError } = useCreateRoom();
  const [door, setDoor] = useState<Door>('http');
  // Prerendering runs without a window.
  const origin = typeof window === 'undefined' ? SITE_URL : window.location.origin;

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
    <PageLayout>
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

      <AboutTool />

      <Faq />
    </PageLayout>
  );
}
