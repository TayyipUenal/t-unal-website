import { MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import { QuoteConfigurator } from "./components/QuoteConfigurator";
import { Contact } from "./components/Contact";
import { Expertise } from "./components/Expertise";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { AuditCity } from "./components/AuditCity";
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
  const home = !legalPage && !audit;
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
        {legalPage ? (
          <LegalPage kind={legalPage} />
        ) : audit ? (
          <AuditPage audit={audit} />
        ) : (
          <>
            <Hero onConsultation={() => openConsultation()} />
            <Services />
            <Statement />
            <Specialty />
            <AuditCity onConsultation={() => openConsultation()} />
            <NightGlobe />
            <QuoteConfigurator onConsultation={() => openConsultation()} />
            <SccJourney onRequest={openConsultation} />
            <Story />
            <Bento />
            <NormCheck onRequest={() => openConsultation()} />
            <Expertise />
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
