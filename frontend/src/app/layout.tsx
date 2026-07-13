import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CV Tailor",
  description: "AI-powered resume tailoring",
  metadataBase: new URL("https://cvtailor.me"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "CV Tailor",
    description: "AI-powered resume tailoring",
    url: "https://cvtailor.me",
    siteName: "CV Tailor",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
