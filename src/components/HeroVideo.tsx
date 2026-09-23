import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";

/** The clip is authored at 1x; it plays slightly faster so the story lands quicker. Captions follow media time, so they stay in sync. */
const PLAYBACK_RATE = 1.25;

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useInView(ref, { amount: 0.3 });
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const completed = useRef(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.defaultPlaybackRate = PLAYBACK_RATE;
    video.playbackRate = PLAYBACK_RATE;
    if (!visible) video.pause();
    else if (!reduced && !completed.current) void video.play().catch(() => {});
  }, [visible, reduced]);
  return (
    <figure className="hero-film">
      {failed ? (
        <img
          className="film-poster"
          src="/media/workflow-poster.png?v=12932b1cf1"
          alt="Zertifizierung auswählen: Der Prozess führt von der Dokumentensammlung über die Prüfung bis zum gemeinsamen Abschluss."
        />
      ) : (
        <video
          ref={ref}
          muted
          playsInline
          controls={!ended}
          preload="metadata"
          poster="/media/workflow-poster.png?v=12932b1cf1"
          aria-label="Vom Paket zum Abschluss: Zertifizierung auswählen, Unterlagen sammeln, prüfen und gemeinsam abschließen."
          aria-describedby="hero-video-description"
          onLoadedMetadata={(event) => {
            event.currentTarget.playbackRate = PLAYBACK_RATE;
          }}
          onEnded={() => {
            completed.current = true;
            setEnded(true);
          }}
          onError={() => setFailed(true)}
        >
          <source src="/media/workflow-de.mp4?v=e5e482f2ee" type="video/mp4" />
          <track
            kind="captions"
            src="/media/workflow-de.vtt?v=059c3400f4"
            srcLang="de"
            label="Deutsch"
          />
        </video>
      )}
      {ended && !failed && (
        <button
          type="button"
          className="film-replay"
          aria-label="Video erneut abspielen"
          title="Erneut ansehen"
          onClick={() => {
            completed.current = false;
            setEnded(false);
            if (ref.current) {
              ref.current.currentTime = 0;
              ref.current.playbackRate = PLAYBACK_RATE;
              void ref.current.play().catch(() => {});
            }
          }}
        >
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      )}
      <figcaption id="hero-video-description" className="visually-hidden">
        Beispiel Zertifizierung: Ein Paket wird ausgewählt. Die Unterlagen
        sammeln sich zu einem Stapel und werden mit einem Haken bestätigt. Sie
        werden an Tayyip Ünal übermittelt und mit der Zertifizierungsstelle
        abgestimmt. Nach erfolgreicher Prüfung bestätigt ein Daumen nach oben
        die finalisierten Dokumente. Ein Handschlag markiert den gemeinsamen
        Abschluss. Das Video endet mit dem vollständig abgeschlossenen Vorgang.
      </figcaption>
    </figure>
  );
}
