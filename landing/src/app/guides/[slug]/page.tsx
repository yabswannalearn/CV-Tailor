import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import ThemeToggle from "../../theme-toggle";
import CopyButton from "../../copy-button";
import { guides } from "../../../lib/guides";
import { pageMetadata, REPOSITORY_URL, SITE_URL } from "../../../lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map(({ slug }) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = guides.find(item => item.slug === slug);
  if (!guide) notFound();
  return pageMetadata(guide.title, guide.description, `/guides/${guide.slug}/`);
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = guides.find(item => item.slug === slug);
  if (!guide) notFound();
  const url = `${SITE_URL}/guides/${guide.slug}/`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url, name: guide.title, description: guide.description, inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@type": "SoftwareApplication", "@id": `${SITE_URL}/#software`, name: "CV Tailor", url: `${SITE_URL}/` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "CV Tailor", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: guide.label, item: url },
        ],
      },
    ],
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner guide-header"><Link className="brand" href="/">CV Tailor</Link><nav aria-label="Guide navigation"><Link href="/#guides">All guides</Link><Link href="/#install">Get started<ArrowUpRight size={13} aria-hidden="true" /></Link></nav><ThemeToggle /></div></header>
    <main id="main" className="guide-page section">
      <nav className="guide-breadcrumb" aria-label="Breadcrumb"><Link href="/">CV Tailor</Link><span aria-hidden="true">/</span><span aria-current="page">{guide.label}</span></nav>
      <article>
        <header className="guide-intro"><span className="eyebrow">{guide.label}</span><h1>{guide.heading}</h1><p>{guide.introduction}</p></header>
        <div className="guide-body">{guide.sections.map(section => <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.code && <pre><code>{section.code}</code></pre>}
          {section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
          {section.prompt && <div className="guide-prompt"><div><span className="eyebrow">ASK YOUR AGENT</span><CopyButton text={section.prompt} label={`Copy ${guide.label.toLowerCase()} prompt`} /></div><blockquote>{section.prompt}</blockquote></div>}
        </section>)}</div>
        <p className="guide-source">Based on <a href={`${REPOSITORY_URL}#readme`}>CV Tailor’s documented workflow<ArrowUpRight size={13} aria-hidden="true" /></a>. Source code is available under the <a href={`${REPOSITORY_URL}/blob/main/LICENSE`}>MIT license</a>.</p>
      </article>
      <aside className="guide-cta"><h2>Make it your workspace.</h2><p>Install the CLI, bring your agent, and start with your own experience.</p><Link className="button button-secondary" href="/#install">Get started locally<ArrowRight size={15} aria-hidden="true" /></Link></aside>
      <nav className="guide-related" aria-label="Related guides"><h2>Keep exploring</h2>{guides.filter(item => item.slug !== slug).map(item => <Link key={item.slug} href={`/guides/${item.slug}/`}>{item.heading}<ArrowRight size={15} aria-hidden="true" /></Link>)}<Link href="/"><ArrowLeft size={15} aria-hidden="true" />Back to CV Tailor</Link></nav>
    </main>
    <footer className="guide-footer section"><span>CV Tailor · Open source. Local by default.</span><a href={REPOSITORY_URL}>Browse the code<ArrowUpRight size={13} aria-hidden="true" /></a></footer>
  </>;
}
