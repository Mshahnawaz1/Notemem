import { Link } from 'wouter';
import { PageLayout } from '../components/Layout';

function ErrorPage({ code, title, body }: { code: string; title: string; body: string }) {
  return (
    <PageLayout>
      {/* `data-server-error` tells main.tsx to keep showing this page at the URL that failed. */}
      <section data-server-error={code === '500' ? '' : undefined} className="px-4 pt-16 sm:pt-24 pb-20 sm:pb-28 text-center">
        <div className="label text-[11px] text-ink-soft inline-flex items-center gap-3"><span className="w-1.5 h-1.5 bg-brand" />Error {code}</div>
        <h1 className="mt-6 font-display font-semibold tracking-tight leading-[1.05] text-[2.2rem] sm:text-5xl text-ink">{title}</h1>
        <p className="mt-5 max-w-md mx-auto text-base leading-relaxed text-ink-soft">{body}</p>
        <div className="mt-9 flex flex-col sm:flex-row gap-2.5 justify-center max-w-md mx-auto">
          <Link href="/" className="btn-primary h-11 px-6">Back to home <span aria-hidden="true">→</span></Link>
          <Link href="/contact" className="btn-secondary h-11 px-6">Contact us</Link>
        </div>
      </section>
    </PageLayout>
  );
}

export function NotFound() {
  return (
    <ErrorPage
      code="404"
      title="This page doesn't exist."
      body="The link may be mistyped, or the page may have moved. If you were opening a room, check that you copied its whole URL: rooms are also deleted 30 days after their last change."
    />
  );
}

export function ServerError() {
  return (
    <ErrorPage
      code="500"
      title="Something went wrong."
      body="The server hit an unexpected error. Please try again in a moment. If it keeps happening, please let us know."
    />
  );
}
