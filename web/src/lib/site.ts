import { FAQ } from './faq';

/** The public origin, for canonical URLs and structured data. Keep in sync with `web/public/sitemap.xml` and `robots.txt`. */
export const SITE_URL = 'https://notemem.mshahnawaz.me';
export const SITE_NAME = 'Notemem';
export const GITHUB_URL = 'https://github.com/Mshahnawaz1/Notemem';

/** The link preview image, rendered from `web/og/og-image.svg`. Social sites need an absolute URL. */
export const OG_IMAGE = {
  url: `${SITE_URL}/og-image.png`,
  width: '1200',
  height: '630',
  alt: 'Notemem: shared notes for you and your AI agents. One private URL to read and write the same markdown pads over HTTP or MCP.',
};

type PageMeta = { title: string; description: string; noindex?: boolean };

/** Title and description for each public page; `vite.config.ts` prerenders each one. Room pages are never indexed and use `ROOM_TITLE`. */
export const PAGES: Record<string, PageMeta> = {
  '/': {
    title: 'Notemem: shared notes for you and your AI agents',
    description:
      'Free, no-signup shared notes for you and your AI agents. Give Claude Code, Cursor or any MCP client one private URL to read and write the same pads.',
  },
  '/about': {
    title: 'About Notemem',
    description:
      'Notemem is an open-source workspace where people and AI agents share notes through one private URL. Why it exists and the principles behind it.',
  },
  '/contact': {
    title: 'Contact Notemem',
    description: 'Report a bug, suggest a feature, report a security issue or ask for a room to be removed.',
  },
  '/privacy': {
    title: 'Privacy Policy | Notemem',
    description: 'What Notemem stores, for how long, who processes it, and how to have it removed. No accounts, no cookies, no analytics.',
  },
  '/terms': {
    title: 'Terms and Conditions | Notemem',
    description: 'The terms for using Notemem, a free shared notes service for people and AI agents.',
  },
  '/404': {
    title: 'Page not found | Notemem',
    description: 'This page does not exist.',
    noindex: true,
  },
  '/500': {
    title: 'Something went wrong | Notemem',
    description: 'The server hit an error.',
    noindex: true,
  },
};

export const ROOM_TITLE = 'Notemem room';

export function metaFor(path: string): PageMeta {
  return PAGES[path] ?? PAGES['/404'];
}

type HeadElement = { type: string; props: Record<string, string> };

// JSON in a <script> block must not contain `</script>`.
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * The `<head>` tags for a prerendered page. Each carries `data-seo`, so the Worker can strip them
 * from the shell it serves for room pages.
 */
export function headFor(path: string): { lang: string; title: string; elements: Set<HeadElement> } {
  const meta = metaFor(path);
  const url = `${SITE_URL}${path === '/' ? '/' : path}`;
  const tag = (type: string, props: Record<string, string>): HeadElement => ({ type, props: { ...props, 'data-seo': '' } });
  const elements = [
    tag('meta', { name: 'description', content: meta.description }),
    tag('meta', { property: 'og:type', content: 'website' }),
    tag('meta', { property: 'og:site_name', content: SITE_NAME }),
    tag('meta', { property: 'og:title', content: meta.title }),
    tag('meta', { property: 'og:description', content: meta.description }),
    tag('meta', { property: 'og:locale', content: 'en_US' }),
    tag('meta', { property: 'og:image', content: OG_IMAGE.url }),
    tag('meta', { property: 'og:image:type', content: 'image/png' }),
    tag('meta', { property: 'og:image:width', content: OG_IMAGE.width }),
    tag('meta', { property: 'og:image:height', content: OG_IMAGE.height }),
    tag('meta', { property: 'og:image:alt', content: OG_IMAGE.alt }),
    tag('meta', { name: 'twitter:card', content: 'summary_large_image' }),
    tag('meta', { name: 'twitter:title', content: meta.title }),
    tag('meta', { name: 'twitter:description', content: meta.description }),
    tag('meta', { name: 'twitter:image', content: OG_IMAGE.url }),
    tag('meta', { name: 'twitter:image:alt', content: OG_IMAGE.alt }),
  ];
  if (meta.noindex) {
    elements.push(tag('meta', { name: 'robots', content: 'noindex' }));
  } else {
    elements.push(tag('link', { rel: 'canonical', href: url }), tag('meta', { property: 'og:url', content: url }));
  }
  if (path === '/') {
    elements.push(
      tag('script', {
        type: 'application/ld+json',
        children: json({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          description: meta.description,
          image: OG_IMAGE.url,
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Any',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          sameAs: [GITHUB_URL],
        }),
      }),
      tag('script', {
        type: 'application/ld+json',
        children: json({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: `${SITE_URL}/`,
        }),
      }),
      tag('script', {
        type: 'application/ld+json',
        children: json({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map(item => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }),
      }),
    );
  }
  return { lang: 'en', title: meta.title, elements: new Set(elements) };
}
