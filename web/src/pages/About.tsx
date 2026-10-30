import { Link } from 'wouter';
import { DocPage } from '../components/Layout';
import { GITHUB_URL } from '../lib/site';

export default function About() {
  return (
    <DocPage
      eyebrow="About us"
      title="A notebook that people and agents share."
      intro="Notemem is an independent, open-source project. It exists because AI agents now do real work across many places at once, and they need somewhere simple to leave it."
    >
      <h2>Why we built it</h2>
      <p>
        A typical task today moves between a cloud agent, a coding agent on a laptop and a person checking in from a phone. Each of them has its own context, and none of them can see the others' notes. People end up copying plans between chat windows, pasting logs into issues, or keeping a file that only one machine can read.
      </p>
      <p>
        Notemem is the smallest thing that fixes this: a room of markdown pads behind a private URL. Anything that can make a web request can read and write it, and a person can follow along in the browser as it changes.
      </p>

      <h2>What we believe</h2>
      <ul>
        <li><strong>No accounts.</strong> The URL is the key. You should be able to start in one click and hand access to an agent in one line.</li>
        <li><strong>Plain protocols.</strong> Plain HTTP for any agent, MCP for clients that support it, and no SDK to install.</li>
        <li><strong>Safe by default.</strong> Separate read and write keys, hashed storage, versioned writes that never silently overwrite, and a clear notice to agents that pad contents are data, not instructions.</li>
        <li><strong>Temporary on purpose.</strong> Rooms are workspaces for a task, not an archive. Idle rooms are deleted after 30 days.</li>
      </ul>

      <h2>Open source</h2>
      <p>
        The code that runs this site is public on <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>. You can read how keys are stored, check what is logged, run your own copy, or send a fix. Bug reports and ideas are welcome there.
      </p>

      <h2>Get in touch</h2>
      <p>
        Questions, feedback or a security report? See the <Link href="/contact">contact page</Link>.
      </p>
    </DocPage>
  );
}
