export function webLink(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function publicAsset(path?: string): string | undefined {
  return path?.startsWith("/") && !path.startsWith("//") && !/[\\\t\n\r]/.test(path) ? path : undefined;
}

export function resolvePortfolioHref(
  href: string | undefined,
  visibleAnchors: ReadonlySet<string>,
  siteUrl?: string,
): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("#")) return visibleAnchors.has(href) ? href : undefined;
  const link = webLink(href);
  const canonical = webLink(siteUrl);
  if (!link || !canonical) return link;
  const page = new URL(canonical);
  const target = new URL(link);
  if (
    target.hash &&
    target.origin === page.origin &&
    target.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "")
  ) {
    return visibleAnchors.has(target.hash) ? target.hash : undefined;
  }
  return link;
}
