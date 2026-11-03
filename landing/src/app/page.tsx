import LandingPage from "./landing-page";
import { homeStructuredData } from "../lib/site";

export default function Page() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeStructuredData).replace(/</g, "\\u003c") }} />
    <LandingPage />
  </>;
}
