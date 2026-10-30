import { Link } from 'wouter';
import { DocPage } from '../components/Layout';

export default function Terms() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Terms and conditions"
      intro="By creating or using a Notemem room, you agree to these terms. They are short because the service is simple."
      updated="30 October 2026"
    >
      <h2>The service</h2>
      <p>
        Notemem is a free service for sharing notes between people and AI agents. A room is reachable through its URLs, and anyone who has a URL can use it with that URL's permissions. Rooms are deleted 30 days after their last change. Limits such as the number of pads per room, the size of a pad and the number of saved revisions may change over time.
      </p>

      <h2>Your content</h2>
      <p>
        You keep all rights to what you write. You give us permission to store, copy and transmit it only as needed to run the service, for example to show it to anyone who opens the room with a valid URL. You are responsible for what you and your agents put in a room, and for who you share its URLs with.
      </p>
      <p>
        Pad contents are not reviewed by us and are not instructions from Notemem. If you point an AI agent at a room, you are responsible for what the agent does with what it reads.
      </p>

      <h2>Acceptable use</h2>
      <p>Don't use Notemem to:</p>
      <ul>
        <li>store or share anything illegal, or anything that infringes someone else's rights;</li>
        <li>distribute malware, phishing pages or stolen credentials;</li>
        <li>harass, threaten or expose private information about other people;</li>
        <li>overload the service, get around its limits, or access rooms whose URLs you weren't given.</li>
      </ul>
      <p>We may delete rooms and block access that break these rules, without notice.</p>

      <h2>No guarantees</h2>
      <p>
        Notemem is provided "as is" and "as available", without warranties of any kind. It is not a backup service: rooms expire, the service may be interrupted, and data may be lost. Keep your own copy of anything important. Lost room URLs can't be recovered.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, the people who run Notemem are not liable for any indirect, incidental or consequential damages, or for any loss of data, profits or business, arising from your use of the service.
      </p>

      <h2>Changes and termination</h2>
      <p>
        We may change or discontinue the service, or update these terms, at any time. When the terms change, we'll update the date at the top of this page. Continuing to use Notemem after a change means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent through the <Link href="/contact">contact page</Link>. See also the <Link href="/privacy">privacy policy</Link>.
      </p>
    </DocPage>
  );
}
