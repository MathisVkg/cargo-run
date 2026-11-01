import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
interface Props {
  open: boolean;
  onClose(): void;
  title: string;
  subtitle?: string;
  side?: "left" | "right" | "center";
  className?: string;
  dismissOnOutside?: boolean;
  children: ReactNode;
}
export function Overlay({
  open,
  onClose,
  title,
  subtitle,
  side = "right",
  className = "",
  dismissOnOutside = false,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null),
    returnFocus = useRef<HTMLElement | null>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      const ownedFocus =
        dialog.contains(document.activeElement) ||
        document.activeElement === document.body;
      if (dialog.open) dialog.close();
      if (ownedFocus && returnFocus.current?.isConnected)
        returnFocus.current.focus();
    };
  }, [open]);
  // A native top-layer dialog still inherits CSS from its DOM ancestors. Portaling
  // prevents a ship picker opened in the title bar from inheriting its drag region.
  return createPortal(
    <dialog
      ref={ref}
      className={"overlay-dialog " + side + " " + className}
      aria-labelledby={id}
      aria-hidden={!open}
      inert={!open}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (!dismissOnOutside || event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          {subtitle && <p className="eyebrow">{subtitle}</p>}
          <h2 id={id}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
