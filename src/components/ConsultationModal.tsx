import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { firstMeetingPreset, type ConsultationPreset } from "../consultation";
import { InquiryForm } from "./InquiryForm";

export function ConsultationModal({
  onClose,
  preset = firstMeetingPreset,
}: {
  onClose: () => void;
  preset?: ConsultationPreset;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="consultation-dialog"
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="consultation-title"
    >
      <button
        type="button"
        className="dialog-close"
        onClick={onClose}
        aria-label="Dialog schließen"
      >
        <X size={22} />
      </button>
      <p className="section-kicker">{preset.kicker}</p>
      <h2 id="consultation-title">{preset.title}</h2>
      <InquiryForm topic={preset.topic} message={preset.message} />
    </dialog>
  );
}
