import { DocPage } from '../components/Layout';
import { GITHUB_URL } from '../lib/site';

const CHANNELS = [
  {
    title: 'Bugs and feature requests',
    body: 'Open an issue on GitHub. Include what you did, what you expected, and what happened instead.',
    href: `${GITHUB_URL}/issues/new`,
    action: 'Open an issue',
  },
  {
    title: 'Security reports',
    body: 'Please report vulnerabilities privately through a GitHub security advisory rather than a public issue.',
    href: `${GITHUB_URL}/security/advisories/new`,
    action: 'Report privately',
  },
  {
    title: 'Remove a room or report abuse',
    body: 'Open an issue with the room ID, the part of the URL right after /r/. Never post the key that follows it.',
    href: `${GITHUB_URL}/issues/new`,
    action: 'Send a request',
  },
];

export default function Contact() {
  return (
    <DocPage
      eyebrow="Contact us"
      title="Get in touch."
      intro="Notemem has no accounts and no support inbox to sign in to. Every conversation happens on GitHub, where you can follow the replies."
    >
      <div className="not-prose grid gap-px bg-line border border-line">
        {CHANNELS.map(channel => (
          <div key={channel.title} className="bg-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="max-w-md">
              <h2 className="font-display text-base font-semibold text-ink">{channel.title}</h2>
              <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{channel.body}</p>
            </div>
            <a href={channel.href} target="_blank" rel="noreferrer" className="btn-secondary h-10 px-4 text-xs shrink-0">
              {channel.action} <span aria-hidden="true">→</span>
            </a>
          </div>
        ))}
      </div>

      <h2>Before you write</h2>
      <ul>
        <li>Never share a room's full URL in an issue. Anyone who sees it can read the room, and the write URL can change it.</li>
        <li>A lost room URL can't be recovered, because there are no accounts to recover it from.</li>
        <li>Rooms are deleted automatically 30 days after their last change.</li>
      </ul>
    </DocPage>
  );
}
