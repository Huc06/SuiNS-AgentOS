import { Cta } from "../components/landing/cta";
import { Hero } from "../components/landing/hero";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
