import type { Metadata } from "next";

export const SITE_URL = "https://www.cvtailor.me";
export const REPOSITORY_URL = "https://github.com/yabswannalearn/CV-Tailor";
export const SITE_TITLE = "CV Tailor | Open-Source AI Resume Builder & Job Tracker";
export const SITE_DESCRIPTION = "Tailor one-page resumes, track job applications, and prepare for interviews with your AI agent. Open source, local data, and no CV Tailor account required.";
export const SOCIAL_IMAGE = {
  url: `${SITE_URL}/opengraph-image.png`,
  width: 1200,
  height: 630,
  alt: "CV Tailor — Open-source AI resume builder and job application tracker. Your agent. Your machine.",
};

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url, type: "website", siteName: "CV Tailor", locale: "en_US",
      images: [SOCIAL_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [SOCIAL_IMAGE] },
  };
}

export const homeStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "CV Tailor",
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: `${SITE_URL}/`,
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: { "@id": `${SITE_URL}/#software` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "CV Tailor",
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Windows, macOS, Linux",
      softwareRequirements: "Python 3.12 or newer. An AI agent for agent workflows. Node.js 22 or newer to install the optional dashboard.",
      license: `${REPOSITORY_URL}/blob/main/LICENSE`,
      isAccessibleForFree: true,
      installUrl: `${SITE_URL}/#install`,
      sameAs: [REPOSITORY_URL],
      featureList: ["One-page resume tailoring", "ATS checks", "Cover letters", "Local job application tracking", "Application form assistance", "Interview preparation", "Coding practice"],
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${SITE_URL}/#source`,
      name: "CV Tailor source code",
      codeRepository: REPOSITORY_URL,
      programmingLanguage: ["Python", "TypeScript"],
      license: `${REPOSITORY_URL}/blob/main/LICENSE`,
      targetProduct: { "@id": `${SITE_URL}/#software` },
    },
  ],
};
