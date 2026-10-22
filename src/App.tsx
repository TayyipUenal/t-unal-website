import { MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import { QuoteConfigurator } from "./components/QuoteConfigurator";
import { Contact } from "./components/Contact";
import { Expertise } from "./components/Expertise";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Nationwide } from "./components/Nationwide";
import { Bento } from "./components/Bento";
import { Services, Specialty, Statement } from "./components/Studio";
import { NormCheck } from "./components/NormCheck";
import { NightGlobe } from "./components/NightGlobe";
import { Story } from "./components/Story";
import { SccJourney } from "./components/SccJourney";
import { LegalPage } from "./components/LegalPage";
import { useState } from "react";
import { WhatsAppButton } from "./components/WhatsAppButton";
import { audits } from "./audits";
import { AuditPage } from "./components/AuditPage";
import { PartnerApply } from "./portal/PartnerApply";
import { PartnerLanding } from "./portal/PartnerLanding";
import { PartnerTeaser } from "./portal/PartnerTeaser";
import { Portal } from "./portal/Portal";
import { ConsultationModal } from "./components/ConsultationModal";
import { firstMeetingPreset, type ConsultationPreset } from "./consultation";

function App({ path = "/" }: { path?: string }) {
  const page = path.replace(/\/$/, "");
  const [consultation, setConsultation] = useState<ConsultationPreset | null>(null);
  const openConsultation = (preset: ConsultationPreset = firstMeetingPreset) => setConsultation(preset);
  const audit = audits.find((audit) => audit.path.replace(/\/$/, "") === page);
  const legalPage =
    page === "/datenschutz"
      ? "privacy"
      : page === "/impressum"
        ? "imprint"
        : null;
  const applyPage = page === "/partner-werden";
  const portalPage = page === "/portal" || page.startsWith("/portal/");
  const partnerSlug = page.startsWith("/partner/") ? page.slice("/partner/".length) : "";
  const home = !legalPage && !audit && !applyPage && !portalPage && !partnerSlug;
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="scroll-progress" style={{ scaleX }} />
      <Header onConsultation={() => openConsultation()} home={home} />
      <main>
        {applyPage ? (
          <PartnerApply />
        ) : portalPage ? (
          <Portal path={page} />
        ) : partnerSlug ? (
          <PartnerLanding slug={partnerSlug} />
        ) : legalPage ? (
          <LegalPage kind={legalPage} />
        ) : audit ? (
          <AuditPage audit={audit} />
        ) : (
          <>
            <Hero onConsultation={() => openConsultation()} />
            <Services />
            <Statement />
            <Specialty />
            <Nationwide />
            <NightGlobe />
            <QuoteConfigurator onConsultation={() => openConsultation()} />
            <SccJourney onRequest={openConsultation} />
            <Story />
            <Bento />
            <NormCheck onRequest={() => openConsultation()} />
            <Expertise />
            <PartnerTeaser />
            <Contact onConsultation={() => openConsultation()} />
          </>
        )}
      </main>
      <Footer />
      <WhatsAppButton />
      {consultation && (
        <ConsultationModal preset={consultation} onClose={() => setConsultation(null)} />
      )}
    </MotionConfig>
  );
}

export default App;
