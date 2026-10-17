import { MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import { QuoteConfigurator } from "./components/QuoteConfigurator";
import { Contact } from "./components/Contact";
import { Expertise } from "./components/Expertise";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Bento } from "./components/Bento";
import { Marquee } from "./components/Marquee";
import { NightGlobe } from "./components/NightGlobe";
import { Story } from "./components/Story";
import { PaperIntro } from "./components/PaperIntro";
import { SccJourney } from "./components/SccJourney";
import { LegalPage } from "./components/LegalPage";
import { useEffect, useState } from "react";
import { initFx } from "./fx";
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
  useEffect(() => initFx(), []);
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
            <Marquee />
            <NightGlobe />
            <QuoteConfigurator onConsultation={() => openConsultation()} />
            <SccJourney onRequest={openConsultation} />
            <Story />
            <Bento />
            <Expertise />
            <Contact onConsultation={() => openConsultation()} />
          </>
        )}
      </main>
      <Footer />
      {consultation && (
        <ConsultationModal preset={consultation} onClose={() => setConsultation(null)} />
      )}
      {home && <PaperIntro />}
    </MotionConfig>
  );
}

export default App;
