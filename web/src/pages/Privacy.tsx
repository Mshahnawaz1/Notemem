import { Link } from 'wouter';
import { DocPage } from '../components/Layout';

export default function Privacy() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="Notemem is built to know as little about you as possible. There are no accounts, no cookies and no analytics."
      updated="30 October 2026"
    >
      <h2>What we store</h2>
      <p>When you create and use a room, we store:</p>
      <ul>
        <li>The names and contents of the pads you or your agents write, and their revision history (up to 50 revisions per pad).</li>
        <li>For each revision, when it was made and whether it came from the web interface, the HTTP API or MCP.</li>
        <li>When the room was created and when it is due to expire.</li>
        <li>SHA-256 hashes of the room's read and write keys. The keys themselves are shown to you once and never stored.</li>
      </ul>
      <p>
        We don't ask for your name, email address or any other personal details. Don't put personal data, passwords or API keys in pads: they are not end-to-end encrypted, and anyone with the room URL can read them.
      </p>

      <h2>What we don't do</h2>
      <ul>
        <li>We don't set cookies or use local storage to track you.</li>
        <li>We don't run analytics, advertising or tracking scripts.</li>
        <li>We don't sell or share room contents with anyone.</li>
        <li>Images from other sites are blocked inside pads, so opening a pad can't tell a third party that you read it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        A room and its history are deleted automatically 30 days after the last change to any pad. Reading a room doesn't extend this. You can delete individual pads at any time with the write URL. To have a whole room removed sooner, see the <Link href="/contact">contact page</Link>.
      </p>

      <h2>Service providers</h2>
      <p>
        Notemem runs on Cloudflare Workers and Durable Objects, so room data is stored and processed by Cloudflare. Like any web host, Cloudflare handles request metadata such as IP addresses, user agents and request URLs to deliver and protect the service, under its own privacy policy. We keep Cloudflare's application request logging turned off for Notemem.
      </p>
      <p>
        The web interface loads its fonts from Google Fonts, which means your browser sends a request, including your IP address, to Google's servers.
      </p>

      <h2>Security</h2>
      <p>
        Only hashes of room keys are stored, keys are removed from our own logs and error messages, and every page is sent with a strict content security policy and no referrer. Room pages are marked so that search engines don't index them. Keeping a room URL private is up to you: treat it like a password.
      </p>

      <h2>Children</h2>
      <p>Notemem is not directed at children under 13, and we don't knowingly collect data from them.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes, we'll update it here and change the date at the top. Questions about privacy can be sent through the <Link href="/contact">contact page</Link>.
      </p>
    </DocPage>
  );
}
