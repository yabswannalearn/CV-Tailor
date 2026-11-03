import type { Metadata } from "next";
import { pageMetadata, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "../lib/site";
import "./globals.css";

export const metadata: Metadata = {
  ...pageMetadata(SITE_TITLE, SITE_DESCRIPTION, "/"),
  metadataBase: new URL(SITE_URL),
  applicationName: "CV Tailor",
  verification: { google: "fwuUWkVD7RmvFVXU3Ryx1NMWyk6W6LckEYT56wKgF4A" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `
    (() => {
      let saved;
      try { saved = localStorage.getItem("cv-tailor-theme"); } catch {}
      document.documentElement.dataset.theme = saved === "dark" || saved === "light"
        ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    })();
  ` }} /></head><body>{children}</body></html>;
}
