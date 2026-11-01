import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
interface Props {
  open: boolean;
  onClose(): void;
  title: string;
  subtitle?: string;
  side?: "left" | "right" | "center";
  children: ReactNode;
}
export function Overlay({
  open,
  onClose,
  title,
  subtitle,
  side = "right",
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
        returnFocus.current?.focus();
      }
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={"overlay-dialog " + side}
      aria-labelledby={id}
      aria-hidden={!open}
      inert={!open}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
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
    >
      <div className="dialog-heading">
        <div>
          {subtitle && <p className="eyebrow">{subtitle}</p>}
          <h2 id={id}>{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
