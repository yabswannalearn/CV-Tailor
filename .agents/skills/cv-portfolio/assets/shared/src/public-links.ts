export function webLink(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function publicAsset(path?: string) {
  return path?.startsWith("/") && !path.startsWith("//") && !/[\\\t\n\r]/.test(path) ? path : undefined;
}
